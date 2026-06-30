// components/AIPartner.jsx
// VERA's face — memory HUD + status indicators.
// Shows graph health, corrupted memory count, score.

import { useGameStore } from "../stores/gameStore";

export function AIPartner() {
  const { memories, score, apiLog, hackAlert, clearHackAlert } = useGameStore();
  const nodes = Object.values(memories);

  const counts = {
    remembered: nodes.filter((n) => n.status === "remembered").length,
    deduced: nodes.filter((n) => n.status === "deduced").length,
    corrupted: nodes.filter((n) => n.status === "corrupted").length,
    forgotten: nodes.filter((n) => n.status === "forgotten").length,
  };

  return (
    <aside className="ai-partner">
      <div className="vera-avatar" data-corrupted={counts.corrupted > 0}>
        {/* SVG face — glitches when corrupted > 0 */}
        <span className="vera-name">VERA</span>
        <span className="vera-sub">Memory Integrity: {counts.corrupted > 0 ? "⚠ COMPROMISED" : "NOMINAL"}</span>
      </div>

      <div className="memory-hud">
        <Meter label="Stored" count={counts.remembered} color="#4a9eff" />
        <Meter label="Deduced" count={counts.deduced} color="#f5c842" />
        <Meter label="Corrupted" count={counts.corrupted} color="#e05252" />
        <Meter label="Purged" count={counts.forgotten} color="#555" />
      </div>

      <div className="score-display">
        <span>Score</span>
        <strong>{score}</strong>
      </div>

      {hackAlert && (
        <div className="hack-alert">
          <span>⚠ {hackAlert.message}</span>
          <button onClick={clearHackAlert}>Acknowledge</button>
        </div>
      )}

      <div className="api-log">
        <div className="log-header">Cognee API log</div>
        {apiLog.slice(0, 8).map((entry, i) => (
          <div key={i} className={`log-line op-${entry.op} ${entry.status}`}>
            <span className="log-ts">{entry.ts}</span>
            <span className="log-msg">{entry.msg}</span>
          </div>
        ))}
      </div>
    </aside>
  );
}

function Meter({ label, count, color }) {
  return (
    <div className="meter">
      <span style={{ color }}>{count}</span>
      <label>{label}</label>
    </div>
  );
}
