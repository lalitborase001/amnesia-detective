// components/EvidenceBoard.jsx
// Drag-and-drop evidence cards. Click to select for Deduce.
// Status ring color = memory status from Cognee graph.

import { useCognee } from "../hooks/useCognee";
import { useGameStore } from "../stores/gameStore";

const STATUS_STYLES = {
  raw:        { ring: "#555", label: "raw",        glow: "none" },
  remembered: { ring: "#4a9eff", label: "stored",   glow: "0 0 8px #4a9eff66" },
  deduced:    { ring: "#f5c842", label: "deduced",  glow: "0 0 12px #f5c84266" },
  corrupted:  { ring: "#e05252", label: "⚠ corrupted", glow: "0 0 16px #e0525266" },
  forgotten:  { ring: "#333", label: "forgotten",   glow: "none" },
};

export function EvidenceBoard() {
  const { remember } = useCognee();
  const { unlockedEvidence, usedEvidenceIds, memories, toggleSelectMemory, selectedMemories, loading } = useGameStore();

  return (
    <section className="evidence-board">
      <header>
        <h2>Evidence</h2>
        <span className="api-hint">→ cognee.add() + cognee.cognify()</span>
      </header>

      <div className="cards-grid">
        {unlockedEvidence.map((card) => {
          const isUsed = usedEvidenceIds.has(card.id);
          // Find associated memory node
          const node = Object.values(memories).find((m) => m.evidence_id === card.id);
          const style = STATUS_STYLES[node?.status || "raw"];

          return (
            <div
              key={card.id}
              className={`evidence-card ${node?.status || "raw"} ${selectedMemories.includes(node?.id) ? "selected" : ""}`}
              style={{ boxShadow: style.glow, "--ring": style.ring }}
              onClick={() => node ? toggleSelectMemory(node.id) : undefined}
            >
              <div className="card-category">{card.category}</div>
              <h3>{card.title}</h3>
              <p>{card.text.slice(0, 120)}…</p>
              <footer>
                <span className="source">{card.source}</span>
                <span className="status-badge" style={{ color: style.ring }}>{style.label}</span>
              </footer>

              {!isUsed && (
                <button
                  className="btn-remember"
                  disabled={loading.remember}
                  onClick={(e) => { e.stopPropagation(); remember(card.id); }}
                >
                  {loading.remember ? "Storing…" : "Feed to VERA →"}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
