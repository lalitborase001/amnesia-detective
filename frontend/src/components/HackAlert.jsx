// components/HackAlert.jsx
// Shown when killer plants a false memory.
// Player must identify it among real memories and use forget().

import { useCognee } from "../hooks/useCognee";
import { useGameStore } from "../stores/gameStore";

export function HackAlert() {
  const { forget } = useCognee();
  const { memories, hackAlert, clearHackAlert } = useGameStore();

  if (!hackAlert) return null;

  const corruptedNodes = Object.values(memories).filter((m) => m.status === "corrupted");

  return (
    <div className="hack-alert-panel">
      <div className="glitch-header">⚠ MEMORY CORRUPTION DETECTED</div>
      <p>An unknown process has injected data into VERA's graph. Identify the false memory and purge it before it corrupts the case.</p>

      <div className="corrupted-list">
        {corruptedNodes.map((node) => (
          <div key={node.id} className="corrupted-node">
            <span className="corrupted-text">{node.text}</span>
            <span className="corrupted-source">Source: {node.source}</span>
            <button
              className="btn-forget"
              onClick={() => { forget(node.id); clearHackAlert(); }}
            >
              Purge from graph →
            </button>
          </div>
        ))}
      </div>

      <button className="btn-dismiss" onClick={clearHackAlert}>
        Investigate later (risky)
      </button>
    </div>
  );
}
