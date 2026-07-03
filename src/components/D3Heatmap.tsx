import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as d3 from 'd3';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Activity, Clock, HelpCircle, Info, Zap, AlertTriangle, ShieldCheck, Play, Pause, RefreshCw 
} from 'lucide-react';

interface HeatmapDataPoint {
  agentId: string;
  agentName: string;
  timeLabel: string;
  frequency: number; // executions per minute
  latency: number;   // millisecond latency
  successRate: number; // percentage
}

const AGENTS_LIST = [
  { id: 'A01', name: 'Rollback Orchestrator', role: 'Emergency SRE Monitor' },
  { id: 'A03', name: 'Opportunity Planner', role: 'Strategic Backlog Ranker' },
  { id: 'A04', name: 'Compliance Auditor', role: 'GDPR/HIPAA Gate' },
  { id: 'A05', name: 'PRD Creator', role: 'Requirements Docs Architect' },
  { id: 'A11', name: 'Model Routing Agent', role: 'LLM Context Broker' },
  { id: 'A18', name: 'Security Threat Auditor', role: 'SecOps CVE Shield' },
  { id: 'A20', name: 'Container Scale Master', role: 'K8s Autoscaler Advisor' },
  { id: 'A23', name: 'Consensus Engine Agent', role: 'Distributed Voter' },
];

// Generate past 10 time intervals
const generateTimeLabels = () => {
  const labels: string[] = [];
  const now = new Date();
  for (let i = 9; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 3 * 60000); // 3-minute steps
    labels.push(`${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`);
  }
  return labels;
};

export function D3Heatmap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 650, height: 280 });
  const [metricMode, setMetricMode] = useState<'frequency' | 'latency'>('frequency');
  const [isStreaming, setIsStreaming] = useState(true);
  const [timeLabels, setTimeLabels] = useState<string[]>(generateTimeLabels());
  
  // Hover & selection states
  const [hoveredPoint, setHoveredPoint] = useState<HeatmapDataPoint | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<HeatmapDataPoint | null>(null);
  const [lastUpdatedCell, setLastUpdatedCell] = useState<{agentId: string, timeLabel: string} | null>(null);

  // Initialize heatmap data
  const [heatmapData, setHeatmapData] = useState<HeatmapDataPoint[]>(() => {
    const initialData: HeatmapDataPoint[] = [];
    const times = generateTimeLabels();
    
    AGENTS_LIST.forEach(agent => {
      times.forEach(time => {
        // Create baseline realistic loads depending on the agent identity
        let baseFreq = 10 + Math.floor(Math.random() * 45);
        let baseLatency = 120 + Math.floor(Math.random() * 320);
        let successRate = 98.2 + Math.random() * 1.8;

        if (agent.id === 'A01') { // SRE: usually idle, but spikey
          baseFreq = Math.random() > 0.8 ? 85 : 4;
          baseLatency = baseFreq > 50 ? 550 : 90;
        } else if (agent.id === 'A11') { // LLM router: high traffic and latency
          baseFreq = 70 + Math.floor(Math.random() * 50);
          baseLatency = 450 + Math.floor(Math.random() * 400);
        } else if (agent.id === 'A23') { // consensus: periodic heavy loops
          baseFreq = Math.random() > 0.6 ? 60 : 15;
          baseLatency = 200 + Math.floor(Math.random() * 250);
        }

        initialData.push({
          agentId: agent.id,
          agentName: agent.name,
          timeLabel: time,
          frequency: baseFreq,
          latency: baseLatency,
          successRate: Number(successRate.toFixed(2)),
        });
      });
    });
    return initialData;
  });

  // Handle container resizing cleanly
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width } = entry.contentRect;
        setDimensions({
          width: Math.max(380, width),
          height: 280
        });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Live Jitter Streaming Simulation (ticks every 4 seconds)
  useEffect(() => {
    if (!isStreaming) return;

    const interval = setInterval(() => {
      // Randomly pick 1-2 agents and update their latest columns
      setHeatmapData(prev => {
        const next = [...prev];
        const latestTime = timeLabels[timeLabels.length - 1];
        
        // Random agent index
        const randomAgentIdx = Math.floor(Math.random() * AGENTS_LIST.length);
        const selectedAgent = AGENTS_LIST[randomAgentIdx];
        
        // Find latest cell index for this agent
        const cellIdx = next.findIndex(d => d.agentId === selectedAgent.id && d.timeLabel === latestTime);
        if (cellIdx !== -1) {
          const currentCell = next[cellIdx];
          
          // Jitter values
          let newFreq = currentCell.frequency + (Math.random() > 0.5 ? 5 : -5);
          newFreq = Math.max(2, Math.min(120, newFreq));
          
          let newLatency = currentCell.latency + (Math.random() > 0.5 ? 40 : -40);
          newLatency = Math.max(60, Math.min(950, newLatency));

          let newSuccess = currentCell.successRate + (Math.random() > 0.8 ? -0.5 : 0.2);
          newSuccess = Math.max(90, Math.min(100, newSuccess));

          next[cellIdx] = {
            ...currentCell,
            frequency: Math.round(newFreq),
            latency: Math.round(newLatency),
            successRate: Number(newSuccess.toFixed(2)),
          };

          // Trigger flash visual effect
          setLastUpdatedCell({ agentId: selectedAgent.id, timeLabel: latestTime });
          setTimeout(() => setLastUpdatedCell(null), 1000);
        }
        
        return next;
      });
    }, 4000);

    return () => clearInterval(interval);
  }, [isStreaming, timeLabels]);

  // Force tick rolling window (adds a new chronological column every 3 minutes)
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLabels(prev => {
        const nextLabels = [...prev.slice(1)];
        const d = new Date();
        nextLabels.push(`${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`);
        
        // Regenerate data with shifted timeline
        setHeatmapData(currentData => {
          const shifted: HeatmapDataPoint[] = [];
          AGENTS_LIST.forEach(agent => {
            nextLabels.forEach((time, index) => {
              // Try to find if we already have this time data
              const existing = currentData.find(d => d.agentId === agent.id && d.timeLabel === time);
              if (existing) {
                shifted.push(existing);
              } else {
                // Generate fresh metrics for the newest tick
                const prevMetric = currentData.find(d => d.agentId === agent.id && d.timeLabel === prev[prev.length - 1]);
                const baseFreq = prevMetric ? Math.max(5, Math.min(110, prevMetric.frequency + Math.floor(Math.random() * 16 - 8))) : 20;
                const baseLat = prevMetric ? Math.max(80, Math.min(900, prevMetric.latency + Math.floor(Math.random() * 100 - 50))) : 220;
                shifted.push({
                  agentId: agent.id,
                  agentName: agent.name,
                  timeLabel: time,
                  frequency: baseFreq,
                  latency: baseLat,
                  successRate: Number((98.5 + Math.random() * 1.5).toFixed(2))
                });
              }
            });
          });
          return shifted;
        });
        
        return nextLabels;
      });
    }, 180000); // 3 minutes

    return () => clearInterval(interval);
  }, []);

  // Calculate scales and render blocks using D3 utilities
  const margin = { top: 20, right: 10, bottom: 35, left: 45 };
  const graphWidth = dimensions.width - margin.left - margin.right;
  const graphHeight = dimensions.height - margin.top - margin.bottom;

  const { xScale, yScale, colorScale, gridCells } = useMemo(() => {
    // 1. Create Band Scales
    const x = d3.scaleBand<string>()
      .domain(timeLabels)
      .range([0, graphWidth])
      .padding(0.06);

    const y = d3.scaleBand<string>()
      .domain(AGENTS_LIST.map(a => a.id))
      .range([0, graphHeight])
      .padding(0.06);

    // 2. Compute domains for color scaling
    let colorScaleFn: d3.ScaleLinear<string, string>;

    if (metricMode === 'frequency') {
      // Light slate to vivid electric cyan/indigo
      colorScaleFn = d3.scaleLinear<string>()
        .domain([0, 40, 90, 120])
        .range(['rgba(15, 23, 42, 0.35)', 'rgba(6, 182, 212, 0.45)', 'rgba(0, 163, 255, 0.85)', '#c084fc']) as any;
    } else {
      // Amber to severe warning crimson/red
      colorScaleFn = d3.scaleLinear<string>()
        .domain([80, 250, 500, 900])
        .range(['rgba(15, 23, 42, 0.35)', 'rgba(245, 158, 11, 0.5)', 'rgba(244, 63, 94, 0.8)', '#f43f5e']) as any;
    }

    // 3. Map positions
    const cells = heatmapData.map(point => {
      const cellX = x(point.timeLabel);
      const cellY = y(point.agentId);
      const value = metricMode === 'frequency' ? point.frequency : point.latency;
      
      return {
        point,
        x: (cellX ?? 0) + margin.left,
        y: (cellY ?? 0) + margin.top,
        width: x.bandwidth(),
        height: y.bandwidth(),
        fill: colorScaleFn(value),
        valueText: metricMode === 'frequency' ? `${point.frequency} c/m` : `${point.latency}ms`,
        isLastUpdated: lastUpdatedCell?.agentId === point.agentId && lastUpdatedCell?.timeLabel === point.timeLabel,
      };
    });

    return { xScale: x, yScale: y, colorScale: colorScaleFn, gridCells: cells };
  }, [heatmapData, timeLabels, metricMode, graphWidth, graphHeight, lastUpdatedCell]);

  // Currently inspected cell details
  const inspectedData = hoveredPoint || selectedPoint || heatmapData[heatmapData.length - 1];

  return (
    <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5 space-y-5">
      
      {/* Title block with Interactive control bars */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <span className="text-[10px] font-mono tracking-wider text-[#00A3FF] uppercase font-bold flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 animate-pulse text-[#00A3FF]" />
            D3-Engine Real-Time Telemetry Matrix
          </span>
          <h3 className="text-md font-sans font-semibold text-slate-200 mt-1">Agent Microservice Load & Latency Heatmap</h3>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Stream Player Controls */}
          <button
            onClick={() => setIsStreaming(!isStreaming)}
            className={`p-2 rounded-lg border transition text-xs font-mono flex items-center gap-1.5 cursor-pointer ${
              isStreaming 
                ? 'bg-[#00A3FF]/10 text-[#00A3FF] border-[#00A3FF]/30 hover:bg-[#00A3FF]/15' 
                : 'bg-slate-800/40 text-slate-400 border-slate-700/60 hover:bg-slate-700/40'
            }`}
            title={isStreaming ? "Pause Live simulation feed" : "Resume Live simulation feed"}
          >
            {isStreaming ? (
              <>
                <Pause className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Streaming</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Paused</span>
              </>
            )}
          </button>

          {/* Metric Selector Toggles */}
          <div className="bg-slate-950 border border-slate-800 p-0.5 rounded-xl flex">
            <button
              onClick={() => {
                setMetricMode('frequency');
                setSelectedPoint(null);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold tracking-tight transition cursor-pointer flex items-center gap-1.5 ${
                metricMode === 'frequency'
                  ? 'bg-[#00A3FF] text-black font-extrabold'
                  : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              <Zap className="w-3 h-3" />
              <span>Executions (c/m)</span>
            </button>
            <button
              onClick={() => {
                setMetricMode('latency');
                setSelectedPoint(null);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold tracking-tight transition cursor-pointer flex items-center gap-1.5 ${
                metricMode === 'latency'
                  ? 'bg-amber-500 text-black font-extrabold'
                  : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              <Clock className="w-3 h-3" />
              <span>Latency (ms)</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main heatmap structure divided into visualization + sidebar details */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        
        {/* Heatmap Column */}
        <div className="lg:col-span-8 flex flex-col justify-between" ref={containerRef}>
          <div className="relative overflow-visible" style={{ height: dimensions.height }}>
            <svg 
              width={dimensions.width} 
              height={dimensions.height}
              className="overflow-visible select-none"
            >
              {/* Y Axis Labels (Agent ID names) */}
              <g className="font-mono text-[10px] text-slate-500">
                {AGENTS_LIST.map((agent) => {
                  const yVal = yScale(agent.id);
                  if (yVal === undefined) return null;
                  return (
                    <text
                      key={agent.id}
                      x={margin.left - 10}
                      y={yVal + margin.top + yScale.bandwidth() / 2}
                      textAnchor="end"
                      dominantBaseline="middle"
                      fill="#94a3b8"
                      className="font-bold cursor-help"
                      title={`${agent.name}: ${agent.role}`}
                    >
                      {agent.id}
                    </text>
                  );
                })}
              </g>

              {/* X Axis Labels (Time Columns) */}
              <g className="font-mono text-[9px] text-slate-500">
                {timeLabels.map((time, idx) => {
                  const xVal = xScale(time);
                  if (xVal === undefined) return null;
                  return (
                    <text
                      key={`${time}-${idx}`}
                      x={xVal + margin.left + xScale.bandwidth() / 2}
                      y={dimensions.height - margin.bottom + 15}
                      textAnchor="middle"
                      fill="#64748b"
                    >
                      {time}
                    </text>
                  );
                })}
              </g>

              {/* Dynamic Heat Cells */}
              <g>
                {gridCells.map((cell) => {
                  const isHovered = hoveredPoint?.agentId === cell.point.agentId && hoveredPoint?.timeLabel === cell.point.timeLabel;
                  const isSelected = selectedPoint?.agentId === cell.point.agentId && selectedPoint?.timeLabel === cell.point.timeLabel;
                  const strokeColor = isSelected ? '#00A3FF' : isHovered ? 'rgba(255,255,255,0.6)' : 'rgba(30, 41, 59, 0.4)';
                  
                  return (
                    <g key={`${cell.point.agentId}-${cell.point.timeLabel}`}>
                      {/* Pulse effect on live tick update */}
                      {cell.isLastUpdated && (
                        <rect
                          x={cell.x - 2}
                          y={cell.y - 2}
                          width={cell.width + 4}
                          height={cell.height + 4}
                          rx={4}
                          fill="none"
                          stroke={metricMode === 'frequency' ? '#00A3FF' : '#f59e0b'}
                          strokeWidth={2}
                          className="animate-ping"
                        />
                      )}

                      <rect
                        x={cell.x}
                        y={cell.y}
                        width={cell.width}
                        height={cell.height}
                        rx={3}
                        fill={cell.fill}
                        stroke={strokeColor}
                        strokeWidth={isSelected ? 1.8 : isHovered ? 1.2 : 1}
                        className="transition-all duration-200 cursor-pointer"
                        onMouseEnter={() => setHoveredPoint(cell.point)}
                        onMouseLeave={() => setHoveredPoint(null)}
                        onClick={() => setSelectedPoint(cell.point)}
                      />
                    </g>
                  );
                })}
              </g>
            </svg>
          </div>

          {/* D3-specific Legend markers */}
          <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-slate-800/60 text-[10px] font-mono">
            <div className="flex items-center gap-3 text-slate-400">
              <span className="text-slate-500 uppercase font-bold text-[9px]">Legend:</span>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded bg-slate-950 border border-slate-800" />
                <span>Zero/Low</span>
              </div>
              
              {metricMode === 'frequency' ? (
                <>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded bg-cyan-500/40" />
                    <span>Active</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded bg-[#00A3FF]" />
                    <span>Peak calls</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded bg-[#c084fc]" />
                    <span>Consensus burst</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded bg-amber-500/50" />
                    <span>Standard (&lt;250ms)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded bg-rose-500/80" />
                    <span>Slow (500ms)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded bg-rose-600 border border-red-500" />
                    <span>Critical SLA (&gt;800ms)</span>
                  </div>
                </>
              )}
            </div>

            <div className="text-slate-500 flex items-center gap-1 text-[9.5px]">
              <HelpCircle className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span>Hover blocks to trace thread metrics. Click to pin inspection.</span>
            </div>
          </div>
        </div>

        {/* Sidebar Inspector Details Panel (Col-span 4) */}
        <div className="lg:col-span-4 flex flex-col justify-between bg-slate-950/40 border border-slate-850 rounded-xl p-4.5 min-h-[260px] relative overflow-hidden">
          <div className="space-y-4">
            <div>
              <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest block font-bold">
                Cell Telemetry Auditor
              </span>
              <h4 className="text-sm font-sans font-bold text-slate-200 mt-1 flex items-center gap-2">
                <span className="px-1.5 py-0.5 bg-slate-900 border border-slate-800 rounded font-mono text-[10px] text-slate-400 font-bold">
                  {inspectedData.agentId}
                </span>
                <span className="truncate">{inspectedData.agentName}</span>
              </h4>
              <p className="text-[10px] font-mono text-slate-500 mt-0.5 uppercase">
                {AGENTS_LIST.find(a => a.id === inspectedData.agentId)?.role || 'Specialized Routing Subnode'}
              </p>
            </div>

            {/* Custom Warning status if latency exceeds standard limit */}
            {inspectedData.latency > 650 && (
              <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-400 font-mono text-[10px] leading-relaxed flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold block uppercase text-[9px]">SLA Threshold Warning</span>
                  Response latency has exceeded the standard 600ms boundary. Pipeline may experience queue backpressure.
                </div>
              </div>
            )}

            {/* In-depth details table */}
            <div className="space-y-2 bg-slate-900/60 border border-slate-850/60 p-3 rounded-xl font-mono text-[11px]">
              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-medium">Interval timestamp:</span>
                <span className="text-slate-300 font-semibold">{inspectedData.timeLabel}</span>
              </div>
              
              <div className="flex justify-between items-center border-t border-slate-900 pt-2">
                <span className="text-slate-500 font-medium flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-[#00A3FF]" />
                  Execution Volume:
                </span>
                <span className="text-cyan-400 font-bold">{inspectedData.frequency} calls/min</span>
              </div>

              <div className="flex justify-between items-center border-t border-slate-900 pt-2">
                <span className="text-slate-500 font-medium flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  Avg Latency (p95):
                </span>
                <span className={`font-bold ${inspectedData.latency > 650 ? 'text-rose-400' : 'text-amber-400'}`}>
                  {inspectedData.latency}ms
                </span>
              </div>

              <div className="flex justify-between items-center border-t border-slate-900 pt-2">
                <span className="text-slate-500 font-medium flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  SLA Success Ratio:
                </span>
                <span className="text-emerald-400 font-bold">{inspectedData.successRate}%</span>
              </div>
            </div>

            {/* Coordinate Details */}
            <div className="text-[9.5px] font-mono text-slate-500 space-y-0.5">
              <div className="flex justify-between">
                <span>Network Registry Coordinate:</span>
                <span className="text-slate-400">Node Column {timeLabels.indexOf(inspectedData.timeLabel) + 1}</span>
              </div>
              <div className="flex justify-between">
                <span>Raft Priority Class:</span>
                <span className="text-slate-400">Class {inspectedData.agentId === 'A01' ? 'SRE Core' : 'Worker Cluster'}</span>
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-800/40">
            <div className="text-[9.5px] font-mono text-slate-500 italic leading-relaxed text-center">
              Metrics are parsed directly from memory-mapped Redis Streams ledger logs.
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}
