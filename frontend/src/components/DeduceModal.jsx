// components/DeduceModal.jsx
// Appears when exactly 2 memory nodes are selected.
// Calls deduce() → cognify the connection.

import { useState } from "react";
import { useCognee } from "../hooks/useCognee";
import { useGameStore } from "../stores/gameStore";

export function DeduceModal() {
  const { deduce } = useCognee();
  const { selectedMemories, memories, clearSelection, loading } = useGameStore();
  const [result, setResult] = useState(null);

  if (selectedMemories.length !== 2) return null;

  const [a, b] = selectedMemories.map((id) => memories[id]);

  const handleDeduce = async () => {
    const res = await deduce(selectedMemories[0], selectedMemories[1]);
    setResult(res);
    if (res.success) setTimeout(() => { clearSelection(); setResult(null); }, 2000);
  };

  return (
    <div className="deduce-modal-overlay">
      <div className="deduce-modal">
        <h2>Deduce Connection</h2>
        <p className="api-hint">→ cognee.memify() / cognee.cognify()</p>

        <div className="evidence-pair">
          <div className="pair-card">{a?.text.slice(0, 100)}…</div>
          <div className="pair-connector">+</div>
          <div className="pair-card">{b?.text.slice(0, 100)}…</div>
        </div>

        {result && (
          <div className={`deduce-result ${result.success ? "success" : "fail"}`}>
            {result.success
              ? `✓ Deduction locked: "${result.conclusion}"`
              : `✗ ${result.message}`}
            {result.success && (
              <div className="connection-strength">
                Connection strength: {Math.round(result.connection_strength * 100)}%
              </div>
            )}
          </div>
        )}

        <div className="modal-actions">
          <button onClick={clearSelection} className="btn-cancel">Cancel</button>
          <button onClick={handleDeduce} disabled={loading.deduce} className="btn-deduce">
            {loading.deduce ? "Analyzing graph…" : "Deduce →"}
          </button>
        </div>
      </div>
    </div>
  );
}
