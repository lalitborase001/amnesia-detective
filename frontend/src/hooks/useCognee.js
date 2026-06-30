// hooks/useCognee.js
// Single hook that wraps every backend API call.
// Components never call fetch directly — they use this hook.

import { useCallback } from "react";
import { useGameStore } from "../stores/gameStore";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000/api";

export function useCognee() {
  const {
    caseId,
    addMemoryNode,
    updateMemoryNode,
    setLoading,
    setHackAlert,
    addLogEntry,
    incrementScore,
  } = useGameStore();

  // -----------------------------------------------------------------------
  // remember() — player drops evidence card
  // Calls POST /api/remember → cognee.add() + cognee.cognify()
  // -----------------------------------------------------------------------
  const remember = useCallback(async (evidenceId) => {
    setLoading("remember", true);
    addLogEntry({ op: "remember", msg: `cognee.add("${evidenceId}") + cognee.cognify()`, status: "calling" });

    try {
      const res = await fetch(`${API}/remember`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ case_id: caseId, evidence_id: evidenceId }),
      });
      const data = await res.json();

      addMemoryNode(data.memory_node);
      addLogEntry({ op: "remember", msg: data.api_call, status: "success" });

      // Hack event fired by server?
      if (data.hack_fired?.fired) {
        setHackAlert({
          nodeId: data.hack_fired.node_id,
          message: data.hack_fired.message,
          contradicts: data.hack_fired.contradicts,
        });
        addLogEntry({ op: "plant", msg: "⚠ UNKNOWN PROCESS injected false memory into graph", status: "warning" });
      }

      return data;
    } finally {
      setLoading("remember", false);
    }
  }, [caseId]);

  // -----------------------------------------------------------------------
  // recall() — player interrogates the AI
  // Calls POST /api/recall → cognee.search()
  // -----------------------------------------------------------------------
  const recall = useCallback(async (query) => {
    setLoading("recall", true);
    addLogEntry({ op: "recall", msg: `cognee.search("${query.slice(0, 40)}…")`, status: "calling" });

    try {
      const res = await fetch(`${API}/recall`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ case_id: caseId, query }),
      });
      const data = await res.json();

      addLogEntry({
        op: "recall",
        msg: `cognee.search() → ${data.graph_nodes_used} nodes, confidence ${Math.round(data.confidence * 100)}%`,
        status: "success",
      });

      return data; // { answer, sources, confidence, graph_nodes_used }
    } finally {
      setLoading("recall", false);
    }
  }, [caseId]);

  // -----------------------------------------------------------------------
  // deduce() — player links two memories (memify / improve)
  // Calls POST /api/deduce → Claude evaluation + cognee.add() conclusion
  // -----------------------------------------------------------------------
  const deduce = useCallback(async (memoryIdA, memoryIdB) => {
    setLoading("deduce", true);
    addLogEntry({ op: "deduce", msg: `cognee.memify(node_a, node_b) — evaluating connection…`, status: "calling" });

    try {
      const res = await fetch(`${API}/deduce`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ case_id: caseId, memory_id_a: memoryIdA, memory_id_b: memoryIdB }),
      });
      const data = await res.json();

      if (data.success && data.new_memory_node) {
        addMemoryNode(data.new_memory_node);
        incrementScore(100);
        addLogEntry({ op: "deduce", msg: `cognee.add("[DEDUCTION] ${data.conclusion?.slice(0, 50)}…")`, status: "success" });
      } else {
        addLogEntry({ op: "deduce", msg: `Connection too weak (strength: ${data.connection_strength})`, status: "fail" });
      }

      return data;
    } finally {
      setLoading("deduce", false);
    }
  }, [caseId]);

  // -----------------------------------------------------------------------
  // forget() — player deletes a suspected false memory
  // Calls POST /api/forget → cognee.prune()
  // -----------------------------------------------------------------------
  const forget = useCallback(async (memoryId) => {
    setLoading("forget", true);
    addLogEntry({ op: "forget", msg: `cognee.prune(node_id="${memoryId.slice(0, 16)}…")`, status: "calling" });

    try {
      const res = await fetch(`${API}/forget`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ case_id: caseId, memory_id: memoryId }),
      });
      const data = await res.json();

      updateMemoryNode(memoryId, { status: "forgotten" });
      incrementScore(data.score_delta);

      addLogEntry({
        op: "forget",
        msg: data.was_planted
          ? `✓ False memory purged — graph clean`
          : `✗ Real memory deleted — graph damaged`,
        status: data.was_planted ? "success" : "fail",
      });

      return data;
    } finally {
      setLoading("forget", false);
    }
  }, [caseId]);

  // -----------------------------------------------------------------------
  // accuse() — player makes final accusation
  // -----------------------------------------------------------------------
  const accuse = useCallback(async (suspectId, supportingDeductionIds) => {
    const res = await fetch(`${API}/accuse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ case_id: caseId, suspect_id: suspectId, supporting_deduction_ids: supportingDeductionIds }),
    });
    return await res.json();
  }, [caseId]);

  return { remember, recall, deduce, forget, accuse };
}