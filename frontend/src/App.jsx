// src/App.jsx
// Top-level layout. Wires case loading + assembles the game grid
// from the components built in components/index.jsx.

import { useEffect, useState } from "react";
import { useGameStore } from "./stores/gameStore";
import { EvidenceBoard } from "./components/EvidenceBoard.jsx";
import { AIPartner } from "./components/AIPartner.jsx";
import { InterrogationPanel } from "./components/InterrogationPanel.jsx";
import { DeduceModal } from "./components/DeduceModal.jsx";
import { HackAlert } from "./components/HackAlert.jsx";
import { MemoryGraph } from "./components/MemoryGraph.jsx";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000/api";

export default function App() {
  const { caseId, setCaseData, unlockEvidence, unlockedEvidence } = useGameStore();
  const [caseList, setCaseList] = useState([]);
  const [caseData, setLocalCaseData] = useState(null);

  // Fetch available cases on mount
  useEffect(() => {
    fetch(`${API}/cases`)
      .then((r) => r.json())
      .then((d) => setCaseList(d.cases))
      .catch((e) => console.error("Failed to load cases — is the backend running?", e));
  }, []);

  // Fetch the active case's data (suspects + progressively unlocked evidence)
  useEffect(() => {
    if (!caseId) return;
    fetch(`${API}/case/${caseId}`)
      .then((r) => r.json())
      .then((d) => {
        setLocalCaseData(d);
        setCaseData(d);
        // Sync unlocked evidence into the store for EvidenceBoard to render
        d.unlocked_evidence.forEach((card) => {
          if (!unlockedEvidence.find((u) => u.id === card.id)) {
            unlockEvidence(card);
          }
        });
      })
      .catch((e) => console.error("Failed to load case data", e));
  }, [caseId]);

  if (caseList.length === 0) {
    return (
      <div className="loading-screen">
        <p>Connecting to VERA's memory drive…</p>
        <p className="api-hint">Make sure the backend is running on :8000</p>
      </div>
    );
  }

  return (
    <div className="game-layout">
      <header className="case-header">
        <span className="case-title">THE VENETIAN JOB</span>
        <span className="case-meta">VENICE · FEBRUARY 1954 · CASE FILE 001</span>
      </header>

      <AIPartner />
      <EvidenceBoard />
      <MemoryGraph />
      <InterrogationPanel />

      <DeduceModal />
      <HackAlert />
    </div>
  );
}
