"""
cases/case_schema.py

Pydantic models for the entire game domain.
"""

from pydantic import BaseModel, Field
from enum import Enum
from typing import Optional


class MemoryStatus(str, Enum):
    RAW        = "raw"          # Card dropped, not yet stored
    REMEMBERED = "remembered"   # cognee.add() + cognify() done
    DEDUCED    = "deduced"      # Conclusion from deduce() — gold in UI
    CORRUPTED  = "corrupted"    # Planted by killer — red glow in UI
    FORGOTTEN  = "forgotten"    # forget() called — greyed out + struck through


class EvidenceCard(BaseModel):
    id: str
    title: str                  # Short label: "Bartender testimony"
    text: str                   # Full raw text fed to Cognee
    source: str                 # "Witness", "Police report", "CCTV log", etc.
    category: str               # "alibi" | "location" | "motive" | "timeline"
    unlocked_at: int            # How many prior evidence pieces needed to unlock
    is_red_herring: bool = False  # True = it's legit but misleading, not planted


class MemoryNode(BaseModel):
    id: str
    evidence_id: str
    text: str
    source: str
    status: MemoryStatus
    confidence: float = Field(ge=0.0, le=1.0)
    timestamp: str
    dataset: str
    is_planted: bool = False
    derived_from: list[str] = []   # IDs of parent nodes (for DEDUCED nodes)


class Suspect(BaseModel):
    id: str
    name: str
    description: str
    alibi: str                  # Their stated alibi — may be false
    is_culprit: bool = False    # Only one True per case


class HackEvent(BaseModel):
    at_evidence_count: int      # Trigger when player has stored N memories
    inject_text: str            # The false memory text to plant
    contradicts_evidence_id: str  # Which real evidence this contradicts


class Case(BaseModel):
    id: str
    title: str
    subtitle: str               # Noir tagline shown on case select screen
    setting: str                # Atmospheric description for the UI header
    year: int                   # e.g. 1952 — shown in UI chrome
    suspects: list[Suspect]
    evidence: list[EvidenceCard]
    hack_events: list[HackEvent]
    solution: dict              # {"culprit_id": "...", "motive": "...", "method": "..."}
    win_condition: dict         # {"required_deductions": [...], "must_forget": [...]}


# ---------------------------------------------------------------------------
# Request/Response models for the API
# ---------------------------------------------------------------------------

class RememberRequest(BaseModel):
    case_id: str
    evidence_id: str

class RecallRequest(BaseModel):
    case_id: str
    query: str

class DeduceRequest(BaseModel):
    case_id: str
    memory_id_a: str
    memory_id_b: str

class ForgetRequest(BaseModel):
    case_id: str
    memory_id: str

class AccuseRequest(BaseModel):
    case_id: str
    suspect_id: str
    supporting_deduction_ids: list[str]

class RecallResponse(BaseModel):
    answer: str                 # Claude's synthesized answer
    sources: list[dict]         # Raw Cognee results shown in UI
    confidence: float
    graph_nodes_used: int

class DeduceResponse(BaseModel):
    success: bool
    conclusion: Optional[str]
    new_memory_node: Optional[MemoryNode]
    connection_strength: float  # 0–1, shown as pulse animation strength
    message: str
