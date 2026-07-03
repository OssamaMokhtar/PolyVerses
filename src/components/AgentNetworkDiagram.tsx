import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';
import { motion, AnimatePresence } from 'motion/react';
import { Zap, ShieldCheck, Clock, Search, RefreshCw, ZoomIn, ZoomOut, Compass, Info } from 'lucide-react';

interface HeatmapAgent {
  id: string;
  name: string;
  role: string;
  load: number;
  successRate: number;
  latency: number;
}

interface TelemetryAlert {
  id: string;
  agentId: string;
  agentName: string;
  metric: 'latency' | 'successRate';
  value: number;
  limit: number;
  timestamp: string;
  resolved: boolean;
}

interface AgentNetworkDiagramProps {
  heatmapAgents: HeatmapAgent[];
  coreLoad: number;
  coreSuccessRate: number;
  coreLatency: number;
  alerts: TelemetryAlert[];
  onSelectAgent: (agentId: string) => void;
}

interface NetworkNode extends d3.SimulationNodeDatum {
  id: string;
  name: string;
  role: string;
  load: number;
  successRate: number;
  latency: number;
  isViolated: boolean;
  // Node coordinate fallbacks in case of simulation lag
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

interface NetworkLink {
  id: string;
  source: string;
  target: string;
  label: string;
}

const STATIC_LINKS: NetworkLink[] = [
  // Gateway & Identity Flow
  { id: 'l1', source: 'A14', target: 'A15', label: 'Auth Handshake' },
  { id: 'l2', source: 'A14', target: 'A09', label: 'Auth Check' },
  
  // Security & Compliance Flow
  { id: 'l3', source: 'A09', target: 'A08', label: 'PII Scrubbing' },
  { id: 'l4', source: 'A08', target: 'A11', label: 'Clean Forward' },
  { id: 'l5', source: 'A07', target: 'A04', label: 'Signal Stream' },
  { id: 'l6', source: 'A04', target: 'A13', label: 'Legal Constraints' },
  
  // AI & Generation Flow
  { id: 'l7', source: 'A11', target: 'A10', label: 'Context Query' },
  { id: 'l8', source: 'A11', target: 'A05', label: 'LLM Prompt' },
  { id: 'l9', source: 'A05', target: 'A13', label: 'Schema Design' },
  { id: 'l10', source: 'A13', target: 'A23', label: 'Consensus Sync' },
  
  // Strategic Prioritization & Beta Rollout
  { id: 'l11', source: 'A23', target: 'A03', label: 'RICE Priority' },
  { id: 'l12', source: 'A03', target: 'A07', label: 'Feedback Sync' },
  { id: 'l13', source: 'A07', target: 'A06', label: 'Beta Program' },
  { id: 'l14', source: 'A06', target: 'A12', label: 'SLA Validate' },
  
  // SRE Monitoring Cycle
  { id: 'l15', source: 'A17', target: 'A02', label: 'Diagnostic Profiling' },
  { id: 'l16', source: 'A02', target: 'A16', label: 'Thread Monitor' },
  { id: 'l17', source: 'A16', target: 'A19', label: 'Memory Guard' },
  { id: 'l18', source: 'A19', target: 'A20', label: 'Pod Scaler' },
  { id: 'l19', source: 'A20', target: 'A21', label: 'DNS Probe' },
  { id: 'l20', source: 'A21', target: 'A22', label: 'Dispatch Alert' },
  { id: 'l21', source: 'A22', target: 'A01', label: 'Auto Rollback' },
  { id: 'l22', source: 'A18', target: 'A08', label: 'Threat Signature' },
  
  // Master Consolidation Gateway Lines
  { id: 'l23', source: 'A12', target: 'CORE', label: 'Compliance SLA' },
  { id: 'l24', source: 'A01', target: 'CORE', label: 'Rollback Pulse' },
  { id: 'l25', source: 'CORE', target: 'A14', label: 'Gateway Control' },
];

export function AgentNetworkDiagram({
  heatmapAgents,
  coreLoad,
  coreSuccessRate,
  coreLatency,
  alerts,
  onSelectAgent,
}: AgentNetworkDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 480 });
  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredNode, setHoveredNode] = useState<NetworkNode | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [zoomScale, setZoomScale] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isDraggingCanvas, setIsDraggingCanvas] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  // Compile full node list including CORE
  const nodes = useMemo<NetworkNode[]>(() => {
    const activeViolatedIds = new Set(alerts.filter(a => !a.resolved).map(a => a.agentId));
    
    const list: NetworkNode[] = heatmapAgents.map(a => ({
      id: a.id,
      name: a.name,
      role: a.role,
      load: a.load,
      successRate: a.successRate,
      latency: a.latency,
      isViolated: activeViolatedIds.has(a.id),
    }));

    // Add CORE
    list.push({
      id: 'CORE',
      name: 'PolyVerses Core',
      role: 'Master Router Core',
      load: coreLoad,
      successRate: coreSuccessRate,
      latency: coreLatency,
      isViolated: activeViolatedIds.has('CORE'),
    });

    return list;
  }, [heatmapAgents, coreLoad, coreSuccessRate, coreLatency, alerts]);

  // Keep a persistent ref to coordinates to prevent layout jumps on value updates
  const coordsRef = useRef<Record<string, { x: number; y: number }>>({});
  const [tick, setTick] = useState(0);

  // Initialize and run the simulation once, or re-run on dimension changes
  useEffect(() => {
    const width = dimensions.width;
    const height = dimensions.height;

    // Create a local mutable copy of nodes with preserved coordinates
    const simNodes: NetworkNode[] = nodes.map(node => {
      const existing = coordsRef.current[node.id];
      return {
        ...node,
        x: existing ? existing.x : width / 2 + (Math.random() - 0.5) * 300,
        y: existing ? existing.y : height / 2 + (Math.random() - 0.5) * 200,
      };
    });

    // Generate links connecting valid indices
    const simLinks = STATIC_LINKS.map(link => ({
      ...link,
      source: simNodes.find(n => n.id === link.source)!,
      target: simNodes.find(n => n.id === link.target)!,
    })).filter(l => l.source && l.target);

    const simulation = d3.forceSimulation<NetworkNode>(simNodes)
      .force('link', d3.forceLink<NetworkNode, any>(simLinks)
        .id(d => d.id)
        .distance(110)
      )
      .force('charge', d3.forceManyBody().strength(-240))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(35))
      .alphaDecay(0.04);

    simulation.on('tick', () => {
      simNodes.forEach(node => {
        if (node.x !== undefined && node.y !== undefined) {
          coordsRef.current[node.id] = { x: node.x, y: node.y };
        }
      });
      setTick(t => t + 1);
    });

    // Handle container resize
    if (containerRef.current) {
      const resizeObserver = new ResizeObserver(entries => {
        if (!entries || entries.length === 0) return;
        const { width: newWidth, height: newHeight } = entries[0].contentRect;
        setDimensions({
          width: Math.max(newWidth, 600),
          height: Math.max(newHeight, 400),
        });
      });
      resizeObserver.observe(containerRef.current);
      return () => {
        simulation.stop();
        resizeObserver.disconnect();
      };
    }

    return () => simulation.stop();
  }, [dimensions.width, dimensions.height]);

  // Merge the simulated node positions with the latest live values
  const positionedNodes = useMemo(() => {
    return nodes.map(node => {
      const coords = coordsRef.current[node.id] || { x: dimensions.width / 2, y: dimensions.height / 2 };
      return {
        ...node,
        x: coords.x,
        y: coords.y,
      };
    });
  }, [nodes, tick, dimensions.width, dimensions.height]);

  // Compute links using positions
  const positionedLinks = useMemo(() => {
    return STATIC_LINKS.map(link => {
      const sourceNode = positionedNodes.find(n => n.id === link.source);
      const targetNode = positionedNodes.find(n => n.id === link.target);
      return {
        ...link,
        sourceNode,
        targetNode,
      };
    }).filter(l => l.sourceNode && l.targetNode) as Array<NetworkLink & { sourceNode: NetworkNode; targetNode: NetworkNode }>;
  }, [positionedNodes]);

  // Canvas interaction handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).tagName === 'circle' || (e.target as HTMLElement).closest('.node-element')) {
      return; // Handled by node drag or click
    }
    setIsDraggingCanvas(true);
    dragStartRef.current = { x: e.clientX - panOffset.x, y: e.clientY - panOffset.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingCanvas) return;
    setPanOffset({
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y,
    });
  };

  const handleMouseUp = () => {
    setIsDraggingCanvas(false);
  };

  const resetZoomPan = () => {
    setZoomScale(1);
    setPanOffset({ x: 0, y: 0 });
  };

  // Node Drag Handler (allows fine adjustments)
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);

  const handleNodeDragStart = (nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDraggedNodeId(nodeId);
  };

  const handleNodeDrag = (e: React.MouseEvent) => {
    if (!draggedNodeId) return;
    const svgRect = e.currentTarget.getBoundingClientRect();
    // Convert client coords back to canvas scale Space
    const clickX = (e.clientX - svgRect.left - panOffset.x) / zoomScale;
    const clickY = (e.clientY - svgRect.top - panOffset.y) / zoomScale;

    coordsRef.current[draggedNodeId] = { x: clickX, y: clickY };
    setTick(t => t + 1);
  };

  const handleNodeDragEnd = () => {
    setDraggedNodeId(null);
  };

  // Search filter
  const filteredNodes = useMemo(() => {
    if (!searchQuery) return positionedNodes;
    const q = searchQuery.toLowerCase();
    return positionedNodes.filter(n => 
      n.id.toLowerCase().includes(q) || 
      n.name.toLowerCase().includes(q) || 
      n.role.toLowerCase().includes(q)
    );
  }, [positionedNodes, searchQuery]);

  // Check if a link should be highlighted (e.g. connected to hovered or selected node)
  const isLinkHighlighted = (link: any) => {
    const focusId = hoveredNode?.id || selectedNode;
    if (!focusId) return false;
    return link.source === focusId || link.target === focusId;
  };

  // Metric styles for nodes
  const getNodeColor = (node: NetworkNode) => {
    if (node.isViolated) return 'rgba(239, 68, 68, 0.85)'; // Red alarm
    if (node.id === 'CORE') return 'rgba(0, 163, 255, 0.85)'; // Blue Core
    if (node.latency > 450) return 'rgba(245, 158, 11, 0.85)'; // Orange high-latency
    return 'rgba(16, 185, 129, 0.85)'; // Green compliant
  };

  const getNodeGlow = (node: NetworkNode) => {
    if (node.isViolated) return 'shadow-[0_0_15px_rgba(239,68,68,0.5)]';
    if (node.id === 'CORE') return 'shadow-[0_0_15px_rgba(0,163,255,0.4)]';
    return 'shadow-[0_0_8px_rgba(24,24,27,0.3)]';
  };

  return (
    <div className="flex flex-col lg:grid lg:grid-cols-12 gap-5 h-full">
      {/* Search and control bar */}
      <div className="lg:col-span-12 flex flex-col sm:flex-row gap-3 items-center justify-between pb-4 border-b border-[#27272A]/60">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            type="text"
            placeholder="Search network node (e.g. A01, SRE, Gateway)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-[#0C0C0E] border border-[#27272A] rounded-xl text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-[#00A3FF] transition"
          />
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          <button
            onClick={() => setZoomScale(prev => Math.min(2, prev + 0.15))}
            className="p-1.5 px-2 bg-[#121215] border border-[#27272A] rounded-lg text-zinc-400 hover:text-white transition text-xs flex items-center space-x-1"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setZoomScale(prev => Math.max(0.5, prev - 0.15))}
            className="p-1.5 px-2 bg-[#121215] border border-[#27272A] rounded-lg text-zinc-400 hover:text-white transition text-xs flex items-center space-x-1"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={resetZoomPan}
            className="p-1.5 px-2 bg-[#121215] border border-[#27272A] rounded-lg text-zinc-400 hover:text-white transition text-xs flex items-center space-x-1.5"
            title="Reset Pan"
          >
            <Compass className="w-3.5 h-3.5" />
            <span className="text-[10px] font-mono">Reset view</span>
          </button>
        </div>
      </div>

      {/* SVG Canvas Workspace */}
      <div 
        ref={containerRef}
        className="lg:col-span-8 bg-[#0C0C0E] border border-[#27272A] rounded-2xl h-[460px] relative overflow-hidden select-none cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <svg
          className="w-full h-full"
          onMouseMove={handleNodeDrag}
          onMouseUp={handleNodeDragEnd}
        >
          {/* Background grid */}
          <defs>
            <pattern id="network-grid" width="30" height="30" patternUnits="userSpaceOnUse">
              <path d="M 30 0 L 0 0 0 30" fill="none" stroke="rgba(39,39,42,0.2)" strokeWidth="1" />
            </pattern>
            <marker
              id="arrowhead"
              viewBox="0 0 10 10"
              refX="18"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#27272A" />
            </marker>
            <marker
              id="arrowhead-active"
              viewBox="0 0 10 10"
              refX="18"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#00A3FF" />
            </marker>
            <marker
              id="arrowhead-violated"
              viewBox="0 0 10 10"
              refX="18"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#EF4444" />
            </marker>
          </defs>
          <rect width="100%" height="100%" fill="url(#network-grid)" />

          {/* Zoomable & Pannable Group */}
          <g transform={`translate(${panOffset.x}, ${panOffset.y}) scale(${zoomScale})`}>
            
            {/* 1. Connection Lines (Links) */}
            {positionedLinks.map((link) => {
              const activeFocus = isLinkHighlighted(link);
              const isViolatedLink = link.sourceNode.isViolated || link.targetNode.isViolated;
              
              let strokeColor = '#27272A';
              let markerId = 'arrowhead';
              if (isViolatedLink) {
                strokeColor = 'rgba(239, 68, 68, 0.45)';
                markerId = 'arrowhead-violated';
              } else if (activeFocus) {
                strokeColor = '#00A3FF';
                markerId = 'arrowhead-active';
              }

              return (
                <g key={link.id}>
                  <path
                    d={`M ${link.sourceNode.x} ${link.sourceNode.y} L ${link.targetNode.x} ${link.targetNode.y}`}
                    stroke={strokeColor}
                    strokeWidth={activeFocus ? 2 : 1.2}
                    markerEnd={`url(#${markerId})`}
                    fill="none"
                    className="transition-colors duration-300"
                  />

                  {/* Packet flow particles (moving dots) */}
                  {!link.sourceNode.isViolated && (
                    <circle r="2" fill={activeFocus ? '#00A3FF' : '#52525B'}>
                      <animateMotion
                        path={`M ${link.sourceNode.x} ${link.sourceNode.y} L ${link.targetNode.x} ${link.targetNode.y}`}
                        dur={`${Math.max(1, 4 - (link.sourceNode.load / 25))}s`}
                        repeatCount="indefinite"
                      />
                    </circle>
                  )}
                </g>
              );
            })}

            {/* 2. Link labels on hover */}
            {positionedLinks.map((link) => {
              const showLabel = isLinkHighlighted(link) || hoveredNode?.id === link.source || hoveredNode?.id === link.target;
              if (!showLabel) return null;

              const midX = (link.sourceNode.x! + link.targetNode.x!) / 2;
              const midY = (link.sourceNode.y! + link.targetNode.y!) / 2;

              return (
                <g key={`lbl-${link.id}`} className="pointer-events-none">
                  <rect
                    x={midX - 35}
                    y={midY - 8}
                    width="70"
                    height="14"
                    rx="3"
                    fill="#09090B"
                    stroke="#27272A"
                    strokeWidth="0.5"
                  />
                  <text
                    x={midX}
                    y={midY + 1.5}
                    textAnchor="middle"
                    fill="#A1A1AA"
                    fontSize="7"
                    fontFamily="monospace"
                  >
                    {link.label}
                  </text>
                </g>
              );
            })}

            {/* 3. Interactive Nodes */}
            {positionedNodes.map((node) => {
              const isSearchMatch = searchQuery ? filteredNodes.some(fn => fn.id === node.id) : true;
              const isHovered = hoveredNode?.id === node.id;
              const isSelected = selectedNode === node.id;
              
              const nodeRadius = node.id === 'CORE' ? 18 : 13;
              const nodeColor = getNodeColor(node);

              return (
                <g
                  key={node.id}
                  className="node-element transition-opacity duration-300"
                  opacity={isSearchMatch ? 1 : 0.15}
                  transform={`translate(${node.x}, ${node.y})`}
                  onMouseEnter={() => setHoveredNode(node)}
                  onMouseLeave={() => setHoveredNode(null)}
                  onMouseDown={(e) => handleNodeDragStart(node.id, e)}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedNode(node.id);
                    onSelectAgent(node.id);
                  }}
                >
                  {/* Outer pulsating alarm glow */}
                  {node.isViolated && (
                    <circle
                      r={nodeRadius + 7}
                      fill="none"
                      stroke="#EF4444"
                      strokeWidth="1.5"
                      className="animate-ping opacity-35"
                    />
                  )}

                  {/* Hover ring */}
                  {(isHovered || isSelected) && (
                    <circle
                      r={nodeRadius + 4}
                      fill="none"
                      stroke={node.isViolated ? '#EF4444' : '#00A3FF'}
                      strokeWidth="1.5"
                      strokeDasharray="3 2"
                    />
                  )}

                  {/* Main Node Body */}
                  <circle
                    r={nodeRadius}
                    fill="#121215"
                    stroke={nodeColor}
                    strokeWidth={isSelected ? 3 : 2}
                    className="cursor-pointer transition-colors duration-200"
                  />

                  {/* Core interior design or standard label */}
                  {node.id === 'CORE' ? (
                    <path
                      d="M -5 -3 L 5 -3 L 0 5 Z"
                      fill="#00A3FF"
                      className="pointer-events-none"
                    />
                  ) : (
                    <text
                      textAnchor="middle"
                      y="3.5"
                      fill="#FFFFFF"
                      fontSize="9"
                      fontWeight="bold"
                      fontFamily="monospace"
                      className="pointer-events-none select-none"
                    >
                      {node.id}
                    </text>
                  )}
                </g>
              );
            })}

          </g>
        </svg>

        {/* Live Map Legend */}
        <div className="absolute bottom-4 left-4 bg-black/75 border border-[#27272A]/80 p-3 rounded-xl backdrop-blur-md pointer-events-none space-y-1.5 text-[9px] font-mono">
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span className="text-zinc-400">Compliant (SLA OK)</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            <span className="text-zinc-400">Degraded Latency</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
            <span className="text-zinc-400">SLA Breach Alert</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-sky-500" />
            <span className="text-zinc-400">Master Router Core</span>
          </div>
        </div>

        {/* Floating instruction helper */}
        <div className="absolute bottom-4 right-4 bg-black/60 border border-[#27272A]/40 px-2.5 py-1 rounded-lg pointer-events-none text-[8.5px] font-mono text-zinc-500">
          *Drag nodes to rearrange. Click to inspect telemetry details.
        </div>
      </div>

      {/* Side Inspect Telemetry Panel (Col-span 4) */}
      <div className="lg:col-span-4 flex flex-col justify-between bg-[#121215] border border-[#27272A]/60 rounded-2xl p-5 relative overflow-hidden h-[460px]">
        {/* Abstract cybernetic backdrop lines */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/[0.01] rounded-full pointer-events-none" />

        <div className="space-y-5">
          {/* Active focus context header */}
          <div>
            <span className="text-[9px] font-mono text-[#71717A] uppercase tracking-widest block font-bold">Node Inspector Node</span>
            <h4 className="text-md font-sans font-black text-zinc-100 mt-1 flex items-center space-x-2">
              <Compass className="w-4.5 h-4.5 text-[#00A3FF]" />
              <span>{hoveredNode ? hoveredNode.name : (selectedNode ? positionedNodes.find(n => n.id === selectedNode)?.name : 'Select a node')}</span>
            </h4>
          </div>

          <AnimatePresence mode="wait">
            {(() => {
              const activeNode = hoveredNode || (selectedNode ? positionedNodes.find(n => n.id === selectedNode) : null);
              if (!activeNode) {
                return (
                  <motion.div
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="h-56 flex flex-col items-center justify-center text-center p-4 border border-dashed border-[#27272A]/60 rounded-xl"
                  >
                    <Info className="w-8 h-8 text-zinc-600 mb-2.5 animate-pulse" />
                    <p className="text-[11px] font-mono text-zinc-500 uppercase leading-normal">
                      Hover over any network node or click to inspect real-time connection telemetry values
                    </p>
                  </motion.div>
                );
              }

              const isViolated = activeNode.isViolated;
              
              return (
                <motion.div
                  key={activeNode.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.15 }}
                  className="space-y-4"
                >
                  <div className="flex items-center space-x-2">
                    <span className="px-1.5 py-0.5 bg-[#0C0C0E] border border-[#27272A] rounded font-mono text-[10px] text-zinc-400 font-bold uppercase">
                      {activeNode.id}
                    </span>
                    <span className="text-[10px] font-mono text-zinc-500 uppercase truncate">
                      {activeNode.role}
                    </span>
                  </div>

                  {/* Active SLA Alarm Indicator */}
                  {isViolated && (
                    <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 font-mono text-[10.5px] leading-relaxed animate-pulse">
                      <div className="font-bold flex items-center space-x-2 mb-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                        <span>SLA BUDGET THRESHOLD BREACHED</span>
                      </div>
                      Target SLA parameters exceeded. System currently generating diagnostics logs.
                    </div>
                  )}

                  {/* Metric Progress Bars */}
                  <div className="space-y-3.5 bg-[#0C0C0E]/50 border border-[#27272A]/40 p-3.5 rounded-xl">
                    {/* Workload */}
                    <div>
                      <div className="flex items-center justify-between text-[10px] font-mono mb-1.5">
                        <span className="text-zinc-500 flex items-center space-x-1">
                          <Zap className="w-3 h-3 text-[#00A3FF]" />
                          <span>Workload Load</span>
                        </span>
                        <span className="text-zinc-200 font-bold">{activeNode.load}%</span>
                      </div>
                      <div className="h-1.5 bg-[#121215] border border-zinc-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#00A3FF] transition-all duration-300"
                          style={{ width: `${activeNode.load}%` }}
                        />
                      </div>
                    </div>

                    {/* Success SLA */}
                    <div>
                      <div className="flex items-center justify-between text-[10px] font-mono mb-1.5">
                        <span className="text-zinc-500 flex items-center space-x-1">
                          <ShieldCheck className="w-3 h-3 text-[#10B981]" />
                          <span>Success SLA</span>
                        </span>
                        <span className={`font-bold ${activeNode.successRate < 80 ? 'text-rose-400 font-black' : 'text-zinc-200'}`}>
                          {activeNode.successRate}%
                        </span>
                      </div>
                      <div className="h-1.5 bg-[#121215] border border-zinc-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-300 ${activeNode.successRate < 80 ? 'bg-rose-500' : 'bg-emerald-500'}`}
                          style={{ width: `${activeNode.successRate}%` }}
                        />
                      </div>
                    </div>

                    {/* Latency */}
                    <div>
                      <div className="flex items-center justify-between text-[10px] font-mono mb-1.5">
                        <span className="text-zinc-500 flex items-center space-x-1">
                          <Clock className="w-3 h-3 text-[#F59E0B]" />
                          <span>Routing Latency</span>
                        </span>
                        <span className={`font-bold ${activeNode.latency > 500 ? 'text-amber-400' : 'text-zinc-200'}`}>
                          {activeNode.latency}ms
                        </span>
                      </div>
                      <div className="h-1.5 bg-[#121215] border border-zinc-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-300 ${activeNode.latency > 500 ? 'bg-amber-500' : 'bg-[#00A3FF]'}`}
                          style={{ width: `${Math.min(100, (activeNode.latency / 1000) * 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Connected links detail list */}
                  <div>
                    <span className="text-[9px] font-mono uppercase text-zinc-500 tracking-wider mb-2 block font-bold">Connected Pathways</span>
                    <div className="space-y-1.5 max-h-24 overflow-y-auto">
                      {positionedLinks
                        .filter(l => l.source === activeNode.id || l.target === activeNode.id)
                        .map((link, idx) => {
                          const otherId = link.source === activeNode.id ? link.target : link.source;
                          const otherNode = positionedNodes.find(n => n.id === otherId);
                          return (
                            <div
                              key={idx}
                              onClick={() => {
                                setSelectedNode(otherId);
                                onSelectAgent(otherId);
                              }}
                              className="p-1.5 px-2 bg-[#0C0C0E] border border-zinc-800 hover:border-[#00A3FF]/40 rounded text-[9.5px] font-mono flex items-center justify-between cursor-pointer text-zinc-400 hover:text-white transition"
                            >
                              <div className="flex items-center space-x-1.5 truncate">
                                <span className="font-bold shrink-0">{link.source === activeNode.id ? '➔ TO' : '● FROM'}</span>
                                <span className="text-zinc-500">[{otherId}]</span>
                                <span className="truncate">{otherNode?.name}</span>
                              </div>
                              <span className="text-[8px] opacity-70 italic text-zinc-500 shrink-0">{link.label}</span>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                </motion.div>
              );
            })()}
          </AnimatePresence>
        </div>

        {/* Action button inside side-inspect */}
        <div className="pt-3 border-t border-zinc-800/60">
          <button
            type="button"
            disabled={!selectedNode}
            onClick={() => {
              if (selectedNode) onSelectAgent(selectedNode);
            }}
            className={`w-full py-2 rounded-xl text-xs font-mono font-extrabold uppercase tracking-widest transition flex items-center justify-center space-x-2 cursor-pointer ${
              selectedNode
                ? 'bg-[#00A3FF]/15 border border-[#00A3FF]/30 hover:bg-[#00A3FF]/25 text-[#60C5FF]'
                : 'bg-zinc-900 border border-zinc-800 text-zinc-600 cursor-not-allowed'
            }`}
          >
            <span>Open Advanced Console</span>
          </button>
        </div>
      </div>
    </div>
  );
}
