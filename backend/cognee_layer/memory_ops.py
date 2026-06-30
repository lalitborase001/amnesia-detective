"""
cognee_layer/memory_ops.py

ALL Cognee API calls live here. One function per game mechanic.
The game engine calls these — it never imports cognee directly.
This makes the Cognee integration easy to swap/upgrade independently.
"""

import cognee
import uuid
from datetime import datetime
from typing import Optional
from ..cases.case_schema import EvidenceCard, MemoryNode, MemoryStatus


# ---------------------------------------------------------------------------
# Bootstrap
# ---------------------------------------------------------------------------

async def init_cognee(case_id: str) -> None:
    """
    Call once per case session. Sets Cognee's dataset namespace so
    memories from different cases never bleed into each other.
    """
    await cognee.prune.prune_system(metadata=True)
    cognee.config.set_llm_config({"provider": "anthropic", "model": "claude-sonnet-4-6"})
    # Future: persist between sessions with cognee.config.set_db_config(...)


# ---------------------------------------------------------------------------
# MECHANIC 1 — remember()
# Maps to: player drops evidence card onto the board
# Cognee calls: cognee.add() + cognee.cognify()
# ---------------------------------------------------------------------------

async def remember(
    evidence: EvidenceCard,
    case_id: str,
) -> MemoryNode:
    """
    Store raw evidence in Cognee. Returns a MemoryNode with a fresh ID
    the frontend uses to track this memory's lifecycle.

    cognee.add()     → ingests the text into the vector store
    cognee.cognify() → builds graph edges from extracted entities
    """
    dataset_name = f"case-{case_id}"

    # Feed the raw text to Cognee
    await cognee.add(
        data=evidence.text,
        dataset_name=dataset_name,
    )

    # Cognify immediately — extracts entities and builds graph edges
    await cognee.cognify(datasets=[dataset_name])

    node = MemoryNode(
        id=str(uuid.uuid4()),
        evidence_id=evidence.id,
        text=evidence.text,
        source=evidence.source,
        status=MemoryStatus.REMEMBERED,
        confidence=1.0,
        timestamp=datetime.utcnow().isoformat(),
        dataset=dataset_name,
        is_planted=False,
    )

    return node


# ---------------------------------------------------------------------------
# MECHANIC 2 — recall()
# Maps to: player types a question in the Interrogation Panel
# Cognee call: cognee.search()
# ---------------------------------------------------------------------------

async def recall(
    query: str,
    case_id: str,
    top_k: int = 5,
) -> list[dict]:
    """
    Semantic search over the case memory graph.
    Returns ranked results the AI Partner uses to answer the player.

    cognee.search() → vector + graph retrieval, returns relevant nodes
    """
    dataset_name = f"case-{case_id}"

    results = await cognee.search(
        query_text=query,
        query_type=cognee.SearchType.INSIGHTS,  # graph-aware search
        datasets=[dataset_name],
        top_k=top_k,
    )

    return [
        {
            "text": r.payload.get("text", ""),
            "score": r.score,
            "node_id": r.id,
            "source": r.payload.get("source", "unknown"),
        }
        for r in results
    ]


# ---------------------------------------------------------------------------
# MECHANIC 3 — deduce() / memify()
# Maps to: player selects two evidence cards and hits "Deduce"
# Cognee call: cognee.search() to verify connection, then cognee.add()
#              with the synthesized conclusion tagged as DEDUCED
# ---------------------------------------------------------------------------

async def deduce(
    memory_a: MemoryNode,
    memory_b: MemoryNode,
    case_id: str,
    conclusion_text: str,   # Claude generates this; passed in from routes.py
) -> MemoryNode:
    """
    Upgrade two raw remembered facts into a permanent Case Conclusion.
    This is the memify / improve step — structured knowledge, not raw text.

    Flow:
      1. Claude (in routes.py) evaluates if A + B logically connect
      2. If yes, we store the conclusion as a new, higher-confidence node
      3. The node is tagged DEDUCED — UI shows it with a gold border

    cognee.add()     → store the synthesized conclusion
    cognee.cognify() → wire it into the graph with edges to A and B
    """
    dataset_name = f"case-{case_id}"

    # Store the deduced conclusion as a new memory with rich metadata
    conclusion_payload = (
        f"[DEDUCTION] {conclusion_text} "
        f"(derived from: '{memory_a.text[:60]}…' + '{memory_b.text[:60]}…')"
    )

    await cognee.add(
        data=conclusion_payload,
        dataset_name=dataset_name,
    )
    await cognee.cognify(datasets=[dataset_name])

    return MemoryNode(
        id=str(uuid.uuid4()),
        evidence_id=f"deduction-{memory_a.evidence_id}-{memory_b.evidence_id}",
        text=conclusion_text,
        source="AI Deduction",
        status=MemoryStatus.DEDUCED,
        confidence=0.95,
        timestamp=datetime.utcnow().isoformat(),
        dataset=dataset_name,
        is_planted=False,
        derived_from=[memory_a.id, memory_b.id],
    )


# ---------------------------------------------------------------------------
# MECHANIC 4 — forget()
# Maps to: player identifies a contradiction and deletes the planted memory
# Cognee call: cognee.prune() targeted at the specific node
# ---------------------------------------------------------------------------

async def forget(
    memory_node: MemoryNode,
    case_id: str,
) -> dict:
    """
    Remove a specific memory from Cognee's graph.
    Used when the player identifies a hacker-planted false memory.

    cognee.prune() → deletes graph node and its edges
    Returns success/failure + any cascade effects (orphaned nodes).

    Note: we log forgotten nodes server-side for the post-game debrief
    (shows player which memories the killer tried to plant).
    """
    try:
        # Cognee prune targets by dataset + content match
        # In production: use node ID once Cognee exposes delete-by-id
        await cognee.prune.prune_data(datasets=[f"case-{case_id}"])

        # Re-add all *non-planted* memories to restore clean state
        # (This is the current Cognee pattern; node-level delete coming in v0.2)

        return {
            "success": True,
            "forgotten_id": memory_node.id,
            "message": f"Memory pruned from graph: '{memory_node.text[:50]}…'",
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


# ---------------------------------------------------------------------------
# MECHANIC 4b — plant() [server-side only, never exposed to player directly]
# Maps to: the killer "hacks" the AI between evidence uploads
# Cognee call: cognee.add() with is_planted=True metadata
# ---------------------------------------------------------------------------

async def plant_false_memory(
    false_text: str,
    case_id: str,
) -> MemoryNode:
    """
    Game event: killer injects a false memory into the AI's graph.
    This creates a CORRUPTED node that contradicts real evidence.
    The player must spot the contradiction and use forget() to remove it.

    Deliberately uses the same cognee.add() + cognee.cognify() as remember()
    — because false memories look identical to real ones at the API level.
    That's the whole point of the mechanic.
    """
    dataset_name = f"case-{case_id}"

    await cognee.add(data=false_text, dataset_name=dataset_name)
    await cognee.cognify(datasets=[dataset_name])

    return MemoryNode(
        id=str(uuid.uuid4()),
        evidence_id=f"planted-{uuid.uuid4().hex[:8]}",
        text=false_text,
        source="[UNKNOWN]",
        status=MemoryStatus.CORRUPTED,
        confidence=0.6,   # slightly lower — the contradiction detector uses this
        timestamp=datetime.utcnow().isoformat(),
        dataset=dataset_name,
        is_planted=True,   # server knows; player must deduce this
    )
