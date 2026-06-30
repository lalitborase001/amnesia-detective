// stores/gameStore.js
// Global game state with Zustand.
// Every Cognee API response updates state here — components react automatically.

import { create } from "zustand";

export const useGameStore = create((set, get) => ({
  // -------------------------------------------------------------------------
  // Case context
  // -------------------------------------------------------------------------
  caseId: "case-001",
  caseData: null,
  setCaseData: (data) => set({ caseData: data }),
  setCaseId: (id) => set({ caseId: id }),

  // -------------------------------------------------------------------------
  // Memory graph — the core state that mirrors Cognee's graph
  // key: memory node ID, value: MemoryNode object from backend
  // -------------------------------------------------------------------------
  memories: {},           // { [id]: MemoryNode }
  selectedMemories: [],   // up to 2 selected for Deduce

  addMemoryNode: (node) =>
    set((s) => ({ memories: { ...s.memories, [node.id]: node } })),

  updateMemoryNode: (id, patch) =>
    set((s) => ({
      memories: {
        ...s.memories,
        [id]: s.memories[id] ? { ...s.memories[id], ...patch } : s.memories[id],
      },
    })),

  toggleSelectMemory: (id) =>
    set((s) => {
      const sel = s.selectedMemories;
      if (sel.includes(id)) return { selectedMemories: sel.filter((x) => x !== id) };
      if (sel.length >= 2) return { selectedMemories: [sel[1], id] }; // slide window
      return { selectedMemories: [...sel, id] };
    }),

  clearSelection: () => set({ selectedMemories: [] }),

  // -------------------------------------------------------------------------
  // Evidence cards (from case JSON, unlocked progressively)
  // -------------------------------------------------------------------------
  unlockedEvidence: [],
  usedEvidenceIds: new Set(),

  unlockEvidence: (card) =>
    set((s) => ({ unlockedEvidence: [...s.unlockedEvidence, card] })),

  markEvidenceUsed: (id) =>
    set((s) => ({ usedEvidenceIds: new Set([...s.usedEvidenceIds, id]) })),

  // -------------------------------------------------------------------------
  // Recall / interrogation
  // -------------------------------------------------------------------------
  interrogationHistory: [],   // [{ query, answer, sources, confidence }]
  lastRecallResult: null,

  addInterrogation: (entry) =>
    set((s) => ({
      interrogationHistory: [...s.interrogationHistory, entry],
      lastRecallResult: entry,
    })),

  // -------------------------------------------------------------------------
  // Hack system
  // -------------------------------------------------------------------------
  hackAlert: null,    // { nodeId, message, contradicts } | null
  setHackAlert: (alert) => set({ hackAlert: alert }),
  clearHackAlert: () => set({ hackAlert: null }),

  // -------------------------------------------------------------------------
  // Loading states (per operation for granular UI feedback)
  // -------------------------------------------------------------------------
  loading: { remember: false, recall: false, deduce: false, forget: false },
  setLoading: (op, val) =>
    set((s) => ({ loading: { ...s.loading, [op]: val } })),

  // -------------------------------------------------------------------------
  // API activity log (shown in the HUD terminal)
  // -------------------------------------------------------------------------
  apiLog: [],   // [{ op, msg, status, ts }]
  addLogEntry: (entry) =>
    set((s) => ({
      apiLog: [{ ...entry, ts: new Date().toLocaleTimeString() }, ...s.apiLog].slice(0, 20),
    })),

  // -------------------------------------------------------------------------
  // Scoring
  // -------------------------------------------------------------------------
  score: 0,
  incrementScore: (delta) => set((s) => ({ score: Math.max(0, s.score + delta) })),

  // -------------------------------------------------------------------------
  // Game phase
  // -------------------------------------------------------------------------
  phase: "playing",  // "playing" | "won" | "lost"
  setPhase: (p) => set({ phase: p }),

  // -------------------------------------------------------------------------
  // Computed helpers (not reactive — call as functions)
  // -------------------------------------------------------------------------
  getMemoriesByStatus: (status) =>
    Object.values(get().memories).filter((m) => m.status === status),

  getCorruptedMemories: () =>
    Object.values(get().memories).filter((m) => m.status === "corrupted"),

  getDeductions: () =>
    Object.values(get().memories).filter((m) => m.status === "deduced"),
}));
