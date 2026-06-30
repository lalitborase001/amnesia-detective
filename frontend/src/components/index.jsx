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


// components/AIPartner.jsx
// VERA's face — memory HUD + status indicators.
// Shows graph health, corrupted memory count, score.

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


// components/InterrogationPanel.jsx
// Player types natural language questions → recall() → VERA answers.

import { useState } from "react";

export function InterrogationPanel() {
  const { recall } = useCognee();
  const { interrogationHistory, addInterrogation, loading } = useGameStore();
  const [query, setQuery] = useState("");

  const handleRecall = async () => {
    if (!query.trim()) return;
    const result = await recall(query);
    addInterrogation({ query, ...result });
    setQuery("");
  };

  return (
    <section className="interrogation-panel">
      <header>
        <h2>Interrogate VERA</h2>
        <span className="api-hint">→ cognee.search()</span>
      </header>

      <div className="chat-history">
        {interrogationHistory.map((entry, i) => (
          <div key={i} className="exchange">
            <div className="query-bubble">
              <strong>Detective:</strong> {entry.query}
            </div>
            <div className="answer-bubble" data-confidence={entry.confidence > 0.7 ? "high" : "low"}>
              <strong>VERA:</strong> {entry.answer}
              <div className="confidence-bar">
                <div style={{ width: `${Math.round(entry.confidence * 100)}%` }} />
                <span>{Math.round(entry.confidence * 100)}% confidence</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="query-input">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleRecall()}
          placeholder="Where was suspect Bellini at 11 PM?"
          disabled={loading.recall}
        />
        <button onClick={handleRecall} disabled={loading.recall || !query.trim()}>
          {loading.recall ? "Searching graph…" : "Ask →"}
        </button>
      </div>
    </section>
  );
}


// components/DeduceModal.jsx
// Appears when exactly 2 memory nodes are selected.
// Calls deduce() → cognify the connection.

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


// components/HackAlert.jsx
// Shown when killer plants a false memory.
// Player must identify it among real memories and use forget().

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


// components/MemoryGraph.jsx
// Live visualization of Cognee's knowledge graph.
// Uses D3 force-directed graph. Nodes colored by status.
// "Corrupted" nodes pulse red. "Deduced" nodes glow gold.

export function MemoryGraph() {
  const { memories } = useGameStore();
  // Implementation: mount D3 force graph on <svg ref>
  // Nodes = memory nodes, edges = derived_from relationships
  // Node radius = confidence score * 20
  // See: https://d3js.org/d3-force
  return (
    <section className="memory-graph">
      <header>
        <h2>Memory Graph</h2>
        <span className="api-hint">cognee knowledge graph</span>
      </header>
      <svg id="graph-svg" width="100%" height="300">
        {/* D3 populates this */}
      </svg>
      <div className="graph-legend">
        <span style={{ color: "#4a9eff" }}>● stored</span>
        <span style={{ color: "#f5c842" }}>● deduced</span>
        <span style={{ color: "#e05252" }}>● corrupted</span>
        <span style={{ color: "#555" }}>● forgotten</span>
      </div>
    </section>
  );
}
