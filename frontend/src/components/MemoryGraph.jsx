// components/MemoryGraph.jsx
// Live visualization of Cognee's knowledge graph using D3 force layout.
// Nodes = memory nodes. Edges = derived_from relationships (deductions
// pointing back at the two memories that produced them).
// Node radius scales with confidence. Color follows memory status.

import { useEffect, useRef } from "react";
import * as d3 from "d3";
import { useGameStore } from "../stores/gameStore";

const STATUS_COLOR = {
  raw: "#555566",
  remembered: "#4a9eff",
  deduced: "#f5c842",
  corrupted: "#e05252",
  forgotten: "#333344",
};

export function MemoryGraph() {
  const { memories } = useGameStore();
  const svgRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    const nodesData = Object.values(memories);
    if (nodesData.length === 0) return;

    const width = containerRef.current?.clientWidth || 600;
    const height = 280;

    // Build D3 node objects
    const nodes = nodesData.map((m) => ({
      id: m.id,
      status: m.status,
      confidence: m.confidence ?? 0.7,
      label: m.text.slice(0, 24) + (m.text.length > 24 ? "…" : ""),
      isPlanted: m.is_planted,
    }));

    // Build edges from derived_from relationships (deduction → parents)
    const links = [];
    nodesData.forEach((m) => {
      (m.derived_from || []).forEach((parentId) => {
        if (memories[parentId]) {
          links.push({ source: parentId, target: m.id });
        }
      });
    });

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove(); // clear previous render

    svg.attr("viewBox", `0 0 ${width} ${height}`);

    const simulation = d3
      .forceSimulation(nodes)
      .force("link", d3.forceLink(links).id((d) => d.id).distance(90).strength(0.6))
      .force("charge", d3.forceManyBody().strength(-180))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide((d) => 14 + d.confidence * 16));

    // Edges
    const link = svg
      .append("g")
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke", "#3a3a4a")
      .attr("stroke-width", 1.5)
      .attr("stroke-dasharray", "4,3");

    // Node groups
    const node = svg
      .append("g")
      .selectAll("g")
      .data(nodes)
      .join("g")
      .attr("class", "graph-node")
      .call(
        d3
          .drag()
          .on("start", (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on("drag", (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on("end", (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          })
      );

    node
      .append("circle")
      .attr("r", (d) => 10 + d.confidence * 14)
      .attr("fill", (d) => STATUS_COLOR[d.status] || "#555")
      .attr("fill-opacity", (d) => (d.status === "forgotten" ? 0.25 : 0.85))
      .attr("stroke", (d) => STATUS_COLOR[d.status] || "#555")
      .attr("stroke-width", 2)
      .attr("class", (d) => (d.status === "corrupted" ? "pulse-node" : ""));

    node
      .append("text")
      .text((d) => d.label)
      .attr("text-anchor", "middle")
      .attr("dy", (d) => 10 + d.confidence * 14 + 14)
      .attr("font-size", "10px")
      .attr("fill", "#888899")
      .attr("font-family", "IBM Plex Mono, monospace");

    simulation.on("tick", () => {
      link
        .attr("x1", (d) => d.source.x)
        .attr("y1", (d) => d.source.y)
        .attr("x2", (d) => d.target.x)
        .attr("y2", (d) => d.target.y);

      node.attr("transform", (d) => `translate(${d.x},${d.y})`);
    });

    return () => simulation.stop();
  }, [memories]);

  return (
    <section className="memory-graph" ref={containerRef}>
      <header>
        <h2>Memory Graph</h2>
        <span className="api-hint">cognee knowledge graph — live</span>
      </header>

      {Object.keys(memories).length === 0 ? (
        <div className="graph-empty">No memories stored yet. Feed VERA some evidence.</div>
      ) : (
        <svg ref={svgRef} width="100%" height="280" />
      )}

      <div className="graph-legend">
        <span style={{ color: "#4a9eff" }}>● stored</span>
        <span style={{ color: "#f5c842" }}>● deduced</span>
        <span style={{ color: "#e05252" }}>● corrupted</span>
        <span style={{ color: "#555566" }}>● forgotten</span>
      </div>
    </section>
  );
}
