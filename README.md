# Amnesia Detective 🕵️

A noir mystery game where Cognee IS the gameplay. Every mechanic maps
directly to a Cognee memory lifecycle API.

## Architecture Overview

```
amnesia-detective/
├── backend/
│   ├── cognee_layer/        ← All Cognee API calls live here
│   │   ├── memory_ops.py    ← remember, recall, cognify, forget wrappers
│   │   └── graph_query.py   ← Knowledge graph read helpers
│   ├── api/
│   │   ├── main.py          ← FastAPI app + CORS
│   │   └── routes.py        ← /remember /recall /deduce /forget /status
│   ├── cases/
│   │   ├── case_schema.py   ← Pydantic models for cases + evidence
│   │   └── the_venetian_job.json  ← Case 1 (seed data)
│   └── requirements.txt
│
└── frontend/
    ├── src/
    │   ├── components/
    │   │   ├── EvidenceBoard.jsx    ← Drag-and-drop evidence cards
    │   │   ├── AIPartner.jsx        ← Chat interface + memory status HUD
    │   │   ├── MemoryGraph.jsx      ← Live Cognee graph visualizer
    │   │   ├── InterrogationPanel.jsx ← Recall query + AI response
    │   │   ├── DeduceModal.jsx      ← Cognify trigger: link 2 evidence
    │   │   └── HackAlert.jsx        ← Planted memory detection UI
    │   ├── hooks/
    │   │   └── useCognee.js         ← All API calls in one hook
    │   ├── stores/
    │   │   └── gameStore.js         ← Zustand state (evidence, memories, score)
    │   └── styles/
    │       └── noir.css             ← Film noir aesthetic tokens
    └── package.json
```

## API → Game Mechanic Mapping

| Cognee API      | Game Action                        | Player Trigger                          |
|-----------------|------------------------------------|-----------------------------------------|
| `cognee.add()`  | Upload evidence                    | Drag evidence card to "Feed AI" zone    |
| `cognee.cognify()` | Remember raw fact               | Card turns amber — stored in graph      |
| `cognee.search()` | Interrogate AI partner           | Type question in Interrogation Panel    |
| `cognee.prune()` (memify) | Deduce — link two facts | Hit Deduce button with 2 cards selected |
| `cognee.delete()` | Forget planted memory           | Identify contradiction → delete node   |

## Data Flow

```
Player drops evidence
        │
        ▼
POST /api/remember
        │
        ▼
cognee_layer/memory_ops.py
  └── cognee.add(text, dataset="case-{id}")
  └── cognee.cognify()          ← builds graph
        │
        ▼
Evidence card status: raw → remembered → graph node created
        │
        ▼
Player selects 2 cards → POST /api/deduce
        │
        ▼
  └── cognee.search(entity_a + entity_b)
  └── Claude evaluates connection strength
  └── Returns: "Case Conclusion" node added to graph
        │
        ▼
Killer triggers POST /api/hack  (server-side game event)
        │
        ▼
  └── Injects false memory via cognee.add()
  └── Sets memory.confidence = "corrupted"
  └── Contradiction flag raised in gameStore
        │
        ▼
Player spots contradiction → POST /api/forget
  └── cognee.delete(memory_id)
  └── Node removed from graph
```

## Adding New Cases

Drop a new JSON file in `backend/cases/` following this schema:

```json
{
  "id": "case-002",
  "title": "The Midnight Express",
  "setting": "A train murder crossing the Alps, 1953",
  "suspects": [...],
  "evidence": [...],
  "solution": { "culprit": "...", "motive": "...", "method": "..." },
  "red_herrings": [...],
  "hack_events": [{ "at_evidence_count": 5, "inject": "..." }]
}
```

That's it. The backend auto-loads all case files on startup.
