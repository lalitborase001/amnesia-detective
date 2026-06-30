"""
api/routes.py

All game API endpoints. Each route maps 1:1 to a Cognee memory operation
and a game mechanic. Claude (via Anthropic SDK) synthesizes the AI
Partner's dialogue on top of Cognee's raw graph results.
"""

import anthropic
import json
from fastapi import APIRouter, HTTPException
from ..cases.case_schema import (
    RememberRequest, RecallRequest, DeduceRequest,
    ForgetRequest, AccuseRequest,
    RecallResponse, DeduceResponse, MemoryStatus,
)
from ..cognee_layer.memory_ops import (
    remember, recall, deduce, forget, plant_false_memory
)

router = APIRouter(prefix="/api")
client = anthropic.Anthropic()

# In-memory game state (replace with Redis/DB for persistence)
_sessions: dict[str, dict] = {}


def get_session(case_id: str) -> dict:
    if case_id not in _sessions:
        _sessions[case_id] = {
            "memories": {},       # memory_id → MemoryNode
            "evidence_count": 0,
            "hack_events_fired": set(),
            "case_data": _load_case(case_id),
        }
    return _sessions[case_id]


def _load_case(case_id: str) -> dict:
    import os, json
    cases_dir = os.path.join(os.path.dirname(__file__), "../cases")
    for fname in os.listdir(cases_dir):
        if fname.endswith(".json"):
            with open(os.path.join(cases_dir, fname)) as f:
                data = json.load(f)
                if data["id"] == case_id:
                    return data
    raise HTTPException(status_code=404, detail=f"Case {case_id} not found")


# ---------------------------------------------------------------------------
# GET /api/cases  — list available cases for case-select screen
# ---------------------------------------------------------------------------

@router.get("/cases")
async def list_cases():
    import os, json
    cases_dir = os.path.join(os.path.dirname(__file__), "../cases")
    cases = []
    for fname in os.listdir(cases_dir):
        if fname.endswith(".json"):
            with open(os.path.join(cases_dir, fname)) as f:
                data = json.load(f)
                cases.append({
                    "id": data["id"],
                    "title": data["title"],
                    "subtitle": data["subtitle"],
                    "year": data["year"],
                    "evidence_count": len(data["evidence"]),
                    "suspect_count": len(data["suspects"]),
                })
    return {"cases": cases}


# ---------------------------------------------------------------------------
# GET /api/case/{case_id}  — full case data, evidence filtered by unlock state
# ---------------------------------------------------------------------------

@router.get("/case/{case_id}")
async def get_case(case_id: str):
    session = get_session(case_id)
    case_data = session["case_data"]
    count = session["evidence_count"]

    # Only return evidence the player has unlocked so far
    unlocked = [e for e in case_data["evidence"] if e["unlocked_at"] <= count]

    return {
        "id": case_data["id"],
        "title": case_data["title"],
        "subtitle": case_data["subtitle"],
        "setting": case_data["setting"],
        "year": case_data["year"],
        "suspects": case_data["suspects"],
        "unlocked_evidence": unlocked,
        "total_evidence": len(case_data["evidence"]),
        "evidence_count": count,
    }


# ---------------------------------------------------------------------------
# POST /api/remember  — player drops an evidence card
# Cognee: cognee.add() + cognee.cognify()
# ---------------------------------------------------------------------------

@router.post("/remember")
async def remember_evidence(req: RememberRequest):
    session = get_session(req.case_id)
    case_data = session["case_data"]

    # Find the evidence card in the case data
    evidence_raw = next(
        (e for e in case_data["evidence"] if e["id"] == req.evidence_id), None
    )
    if not evidence_raw:
        raise HTTPException(status_code=404, detail="Evidence not found")

    from ..cases.case_schema import EvidenceCard
    evidence = EvidenceCard(**evidence_raw)

    # ← COGNEE CALL
    node = await remember(evidence, req.case_id)
    session["memories"][node.id] = node
    session["evidence_count"] += 1

    # Check if a hack event should fire
    hack_result = await _maybe_fire_hack(session, req.case_id)

    return {
        "memory_node": node.model_dump(),
        "total_memories": len(session["memories"]),
        "hack_fired": hack_result,
        "api_call": f'cognee.add("{evidence.text[:40]}…") + cognee.cognify()',
    }


# ---------------------------------------------------------------------------
# POST /api/recall  — player interrogates the AI partner
# Cognee: cognee.search()
# Claude: synthesizes the answer into noir detective dialogue
# ---------------------------------------------------------------------------

@router.post("/recall", response_model=RecallResponse)
async def recall_query(req: RecallRequest):
    session = get_session(req.case_id)

    # ← COGNEE CALL
    results = await recall(req.query, req.case_id)

    if not results:
        return RecallResponse(
            answer="My circuits are drawing a blank, detective. Feed me more evidence first.",
            sources=[],
            confidence=0.0,
            graph_nodes_used=0,
        )

    # Build context from Cognee results
    context = "\n".join([f"- {r['text']} (source: {r['source']})" for r in results])

    # ← CLAUDE CALL — synthesize into AI Partner dialogue
    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=300,
        system="""You are VERA — a damaged AI detective assistant with a corrupted memory drive.
You speak in clipped, noir-flavored language. You are uncertain but precise.
When answering, cite your sources. Express your confidence level.
Never invent facts — only use what's in your memory context.
Format: 2-4 sentences max. Start with what you know, end with what you're uncertain about.""",
        messages=[{
            "role": "user",
            "content": f"Query: {req.query}\n\nMy current memory contains:\n{context}"
        }]
    )

    answer = response.content[0].text
    avg_score = sum(r["score"] for r in results) / len(results)

    return RecallResponse(
        answer=answer,
        sources=results,
        confidence=round(avg_score, 2),
        graph_nodes_used=len(results),
    )


# ---------------------------------------------------------------------------
# POST /api/deduce  — player links two memories (memify / improve)
# Cognee: cognee.search() to verify, then cognee.add() the conclusion
# Claude: evaluates logical connection strength
# ---------------------------------------------------------------------------

@router.post("/deduce", response_model=DeduceResponse)
async def deduce_connection(req: DeduceRequest):
    session = get_session(req.case_id)

    mem_a = session["memories"].get(req.memory_id_a)
    mem_b = session["memories"].get(req.memory_id_b)

    if not mem_a or not mem_b:
        raise HTTPException(status_code=404, detail="Memory node not found")

    if mem_a.status == MemoryStatus.CORRUPTED or mem_b.status == MemoryStatus.CORRUPTED:
        return DeduceResponse(
            success=False,
            conclusion=None,
            new_memory_node=None,
            connection_strength=0.0,
            message="Cannot deduce from corrupted memory. Identify and forget the false data first.",
        )

    # ← CLAUDE CALL — evaluate if these two facts logically connect
    eval_response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=200,
        system="""You are a deduction engine for a detective game. Evaluate if two pieces of evidence 
logically connect to form a valid case conclusion. 
Respond ONLY with JSON: {"connects": true/false, "strength": 0.0-1.0, "conclusion": "one sentence"}
strength 0.8+ = strong deduction, 0.5-0.8 = possible, <0.5 = weak/no connection.""",
        messages=[{
            "role": "user",
            "content": f"Evidence A: {mem_a.text}\n\nEvidence B: {mem_b.text}\n\nDo these connect?"
        }]
    )

    try:
        eval_data = json.loads(eval_response.content[0].text)
    except json.JSONDecodeError:
        eval_data = {"connects": False, "strength": 0.0, "conclusion": ""}

    if not eval_data.get("connects") or eval_data.get("strength", 0) < 0.5:
        return DeduceResponse(
            success=False,
            conclusion=None,
            new_memory_node=None,
            connection_strength=eval_data.get("strength", 0.0),
            message="These facts don't connect clearly enough to form a conclusion.",
        )

    # ← COGNEE CALL — store the deduction as a permanent memory node
    conclusion_node = await deduce(mem_a, mem_b, req.case_id, eval_data["conclusion"])
    session["memories"][conclusion_node.id] = conclusion_node

    return DeduceResponse(
        success=True,
        conclusion=eval_data["conclusion"],
        new_memory_node=conclusion_node,
        connection_strength=eval_data["strength"],
        message="Deduction locked in. The AI's knowledge graph has been upgraded.",
    )


# ---------------------------------------------------------------------------
# POST /api/forget  — player identifies and deletes a planted memory
# Cognee: cognee.prune() targeted deletion
# ---------------------------------------------------------------------------

@router.post("/forget")
async def forget_memory(req: ForgetRequest):
    session = get_session(req.case_id)
    node = session["memories"].get(req.memory_id)

    if not node:
        raise HTTPException(status_code=404, detail="Memory node not found")

    # ← COGNEE CALL
    result = await forget(node, req.case_id)

    if result["success"]:
        # Mark as forgotten in session (keep for post-game debrief)
        node.status = MemoryStatus.FORGOTTEN
        session["memories"][req.memory_id] = node

        was_correct = node.is_planted
        return {
            **result,
            "was_planted": was_correct,
            "score_delta": +50 if was_correct else -25,
            "message": (
                "Correct. The false memory has been purged from the graph."
                if was_correct else
                "That was a real memory, detective. You've damaged the case."
            ),
            "api_call": f'cognee.prune(node_id="{node.id}")',
        }

    raise HTTPException(status_code=500, detail=result["error"])


# ---------------------------------------------------------------------------
# POST /api/accuse  — player makes final accusation
# Checks win condition against session state
# ---------------------------------------------------------------------------

@router.post("/accuse")
async def make_accusation(req: AccuseRequest):
    session = get_session(req.case_id)
    case_data = session["case_data"]
    win = case_data["win_condition"]

    correct_suspect = req.suspect_id == win["accuse"]
    planted_forgotten = all(
        any(m.is_planted and m.status == MemoryStatus.FORGOTTEN
            for m in session["memories"].values())
        for _ in win["must_forget"]
    )
    deduction_count = sum(
        1 for m in session["memories"].values()
        if m.status == MemoryStatus.DEDUCED
    )

    won = correct_suspect and planted_forgotten and deduction_count >= len(win["required_deductions"])

    return {
        "won": won,
        "correct_suspect": correct_suspect,
        "cleared_false_memories": planted_forgotten,
        "deductions_made": deduction_count,
        "required_deductions": len(win["required_deductions"]),
        "solution": case_data["solution"] if won else None,
        "message": (
            "Case closed. VERA's memory is clean and the truth is on record."
            if won else
            "Not quite, detective. The graph tells a different story."
        ),
    }


# ---------------------------------------------------------------------------
# GET /api/status/{case_id}  — memory graph state for the HUD
# ---------------------------------------------------------------------------

@router.get("/status/{case_id}")
async def game_status(case_id: str):
    session = get_session(case_id)
    memories = list(session["memories"].values())
    return {
        "total_memories": len(memories),
        "by_status": {
            s.value: sum(1 for m in memories if m.status == s)
            for s in MemoryStatus
        },
        "evidence_count": session["evidence_count"],
        "corrupted_count": sum(1 for m in memories if m.status == MemoryStatus.CORRUPTED),
        "api_call": "cognee.search(query_type=GRAPH_COMPLETION)",
    }


# ---------------------------------------------------------------------------
# Internal: fire hack events at the right moment
# ---------------------------------------------------------------------------

async def _maybe_fire_hack(session: dict, case_id: str) -> dict | None:
    count = session["evidence_count"]
    case_data = session["case_data"]

    for event in case_data["hack_events"]:
        event_key = event["at_evidence_count"]
        if count >= event_key and event_key not in session["hack_events_fired"]:
            session["hack_events_fired"].add(event_key)
            # ← COGNEE CALL — plant false memory using same cognee.add() as remember
            planted_node = await plant_false_memory(event["inject_text"], case_id)
            session["memories"][planted_node.id] = planted_node
            return {
                "fired": True,
                "node_id": planted_node.id,
                "message": "⚠ SYSTEM ALERT: Unknown process modified the memory graph.",
                "contradicts": event["contradicts_evidence_id"],
            }
    return None
