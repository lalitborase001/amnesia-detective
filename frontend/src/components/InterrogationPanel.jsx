// components/InterrogationPanel.jsx
// Player types natural language questions → recall() → VERA answers.

import { useState } from "react";
import { useCognee } from "../hooks/useCognee";
import { useGameStore } from "../stores/gameStore";

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
