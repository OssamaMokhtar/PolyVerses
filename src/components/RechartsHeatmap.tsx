import React, { useState, useMemo } from 'react';
import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip } from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { Zap, Clock, ShieldCheck, AlertTriangle, Info, HelpCircle } from 'lucide-react';

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

interface RechartsHeatmapProps {
  heatmapAgents: HeatmapAgent[];
  coreLoad: number;
  coreSuccessRate: number;
  coreLatency: number;
  alerts: TelemetryAlert[];
  onSelectAgent: (agentId: string) => void;
}

interface GridItem extends HeatmapAgent {
  x: number;
  y: number;
  isViolated: boolean;
}

export function RechartsHeatmap({
  heatmapAgents,
  coreLoad,
  coreSuccessRate,
  coreLatency,
  alerts,
  onSelectAgent,
}: RechartsHeatmapProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Compile full node list including CORE, mapped to a 6x4 coordinate space
  const gridData = useMemo<GridItem[]>(() => {
    const activeViolatedIds = new Set(alerts.filter(a => !a.resolved).map(a => a.agentId));
    
    // Add CORE to beginning
    const list: HeatmapAgent[] = [
      {
        id: 'CORE',
        name: 'PolyVerses Core',
        role: 'Master Router Core',
        load: coreLoad,
        successRate: coreSuccessRate,
        latency: coreLatency,
      },
      ...heatmapAgents,
    ];

    return list.map((agent, i) => {
      // 6 columns (1 to 6), 4 rows (1 to 4)
      const x = (i % 6) + 1;
      const y = 4 - Math.floor(i / 6); // reverse y to start from top
      return {
        ...agent,
        x,
        y,
        isViolated: activeViolatedIds.has(agent.id),
      };
    });
  }, [heatmapAgents, coreLoad, coreSuccessRate, coreLatency, alerts]);

  // Find currently inspected node
  const activeInspectedNode = useMemo(() => {
    const id = hoveredId || selectedId;
    if (!id) return null;
    return gridData.find(n => n.id === id) || null;
  }, [gridData, hoveredId, selectedId]);

  // Render a custom heat block tile
  const renderTile = (props: any, metricType: 'load' | 'latency') => {
    const { cx, cy, payload } = props;
    if (cx === undefined || cy === undefined) return null;

    const width = 58;
    const height = 48;
    const x = cx - width / 2;
    const y = cy - height / 2;

    let fill = '#18181b';
    let border = 'rgba(39, 39, 42, 0.4)';
    let glowColor = 'transparent';

    if (metricType === 'load') {
      const load = payload.load;
      const pct = load / 100;
      fill = `rgba(6, 182, 212, ${0.1 + pct * 0.85})`;
      border = `rgba(6, 182, 212, ${0.3 + pct * 0.6})`;
      if (load > 85) {
        glowColor = 'rgba(6, 182, 212, 0.4)';
      }
    } else {
      const latency = payload.latency;
      const pct = Math.min(1, Math.max(0, (latency - 100) / 700));
      if (latency > 500) {
        fill = `rgba(239, 68, 68, ${0.1 + pct * 0.85})`;
        border = `rgba(239, 68, 68, ${0.3 + pct * 0.6})`;
        glowColor = 'rgba(239, 68, 68, 0.3)';
      } else {
        fill = `rgba(245, 158, 11, ${0.1 + pct * 0.85})`;
        border = `rgba(245, 158, 11, ${0.3 + pct * 0.6})`;
      }
    }

    if (payload.isViolated) {
      fill = 'rgba(239, 68, 68, 0.25)';
      border = 'rgba(239, 68, 68, 0.85)';
      glowColor = 'rgba(239, 68, 68, 0.45)';
    }

    const isHovered = hoveredId === payload.id;
    const isSelected = selectedId === payload.id;

    return (
      <g
        className="cursor-pointer transition-all duration-150"
        onClick={() => {
          setSelectedId(payload.id);
          onSelectAgent(payload.id);
        }}
        onMouseEnter={() => setHoveredId(payload.id)}
        onMouseLeave={() => setHoveredId(null)}
      >
        {/* Glow/Selection outline border */}
        {(isHovered || isSelected || glowColor !== 'transparent') && (
          <rect
            x={x - 2}
            y={y - 2}
            width={width + 4}
            height={height + 4}
            rx={8}
            fill="none"
            stroke={isSelected ? '#00A3FF' : isHovered ? 'rgba(255,255,255,0.45)' : border}
            strokeWidth={isSelected ? 2 : 1.2}
            className="transition-all duration-150"
          />
        )}

        {/* Main heatmap block */}
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          rx={6}
          fill={fill}
          stroke={border}
          strokeWidth={1}
          className="transition-colors duration-200"
        />

        {/* Dynamic Warning Accent Dot */}
        {payload.isViolated && (
          <circle
            cx={x + 8}
            cy={y + 8}
            r="3"
            fill="#EF4444"
            className="animate-pulse"
          />
        )}

        {/* Agent ID Label */}
        <text
          x={cx}
          y={cy - 4}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={payload.isViolated ? '#FECACA' : '#F4F4F5'}
          fontSize={10.5}
          fontWeight="bold"
          fontFamily="monospace"
          className="pointer-events-none select-none"
        >
          {payload.id}
        </text>

        {/* Metric Value Label */}
        <text
          x={cx}
          y={cy + 10}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={metricType === 'load' ? '#A5F3FC' : '#FEF3C7'}
          fontSize={8.5}
          fontFamily="monospace"
          className="pointer-events-none select-none opacity-90"
        >
          {metricType === 'load' ? `${payload.load}%` : `${payload.latency}ms`}
        </text>
      </g>
    );
  };

  // Custom tooltip content
  const renderTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-[#09090B] border border-[#27272A] p-3.5 rounded-xl shadow-2xl font-mono text-[11px] max-w-xs text-left">
          <div className="flex items-center justify-between mb-2 border-b border-zinc-800 pb-1.5">
            <span className="font-black text-white">[{data.id}] {data.name}</span>
            {data.isViolated && (
              <span className="text-rose-400 font-black text-[9px] bg-rose-500/10 border border-rose-500/20 px-1.5 py-0.2 rounded animate-pulse">
                SLA ALERT
              </span>
            )}
          </div>
          <p className="text-zinc-500 text-[9.5px] mb-2 leading-relaxed font-semibold">{data.role}</p>
          <div className="space-y-1.5 text-zinc-300">
            <div className="flex justify-between">
              <span className="text-zinc-500">Compute Load:</span>
              <span className="font-bold text-cyan-400">{data.load}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">SLA Success:</span>
              <span className="font-bold text-emerald-400">{data.successRate}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Routing Latency:</span>
              <span className="font-bold text-amber-400">{data.latency}ms</span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 h-full">
      
      {/* Visual Heatmaps side-by-side or stacked container */}
      <div className="lg:col-span-8 space-y-5 bg-[#0C0C0E] border border-[#27272A] p-5 rounded-2xl">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          
          {/* Heatmap 1: Compute Load */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Zap className="w-4 h-4 text-[#00A3FF]" />
                <span className="text-xs font-mono font-bold text-zinc-200 uppercase tracking-wider">
                  Compute Load Distribution
                </span>
              </div>
              <span className="text-[10px] font-mono text-cyan-400 font-bold">Cyan Gradient (0-100%)</span>
            </div>
            
            <div className="h-[280px] bg-[#121215]/40 border border-[#27272A]/40 rounded-xl relative flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 25, right: 30, bottom: 25, left: 30 }}>
                  <XAxis
                    type="number"
                    dataKey="x"
                    domain={[0.5, 6.5]}
                    tickCount={6}
                    tick={false}
                    axisLine={false}
                  />
                  <YAxis
                    type="number"
                    dataKey="y"
                    domain={[0.5, 4.5]}
                    tickCount={4}
                    tick={false}
                    axisLine={false}
                  />
                  <ZAxis type="number" range={[100, 100]} />
                  <Tooltip content={renderTooltip} cursor={false} />
                  <Scatter
                    data={gridData}
                    shape={(props: any) => renderTile(props, 'load')}
                  />
                </ScatterChart>
              </ResponsiveContainer>
              
              {/* Overlay labels */}
              <div className="absolute top-2 left-4 text-[8px] font-mono text-zinc-600 uppercase">
                Active Cluster Compute Load Map
              </div>
            </div>
          </div>

          {/* Heatmap 2: Latency */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Clock className="w-4 h-4 text-[#F59E0B]" />
                <span className="text-xs font-mono font-bold text-zinc-200 uppercase tracking-wider">
                  Routing Latency Distribution
                </span>
              </div>
              <span className="text-[10px] font-mono text-amber-400 font-bold">Amber/Red Scale (ms)</span>
            </div>

            <div className="h-[280px] bg-[#121215]/40 border border-[#27272A]/40 rounded-xl relative flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 25, right: 30, bottom: 25, left: 30 }}>
                  <XAxis
                    type="number"
                    dataKey="x"
                    domain={[0.5, 6.5]}
                    tickCount={6}
                    tick={false}
                    axisLine={false}
                  />
                  <YAxis
                    type="number"
                    dataKey="y"
                    domain={[0.5, 4.5]}
                    tickCount={4}
                    tick={false}
                    axisLine={false}
                  />
                  <ZAxis type="number" range={[100, 100]} />
                  <Tooltip content={renderTooltip} cursor={false} />
                  <Scatter
                    data={gridData}
                    shape={(props: any) => renderTile(props, 'latency')}
                  />
                </ScatterChart>
              </ResponsiveContainer>
              
              {/* Overlay labels */}
              <div className="absolute top-2 left-4 text-[8px] font-mono text-zinc-600 uppercase">
                Routing Milliseconds Heat Distribution
              </div>
            </div>
          </div>

        </div>

        {/* Heatmap Visual Guide / Legends */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3.5 border-t border-[#27272A]/50 text-[9px] font-mono">
          <div className="flex items-center gap-4 text-zinc-400">
            <div className="flex items-center space-x-1.5">
              <span className="w-2.5 h-2.5 rounded bg-cyan-950 border border-cyan-800" />
              <span>Low Load</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="w-2.5 h-2.5 rounded bg-cyan-500" />
              <span>Peak Load</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="w-2.5 h-2.5 rounded bg-amber-500" />
              <span>Higher Latency</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="w-2.5 h-2.5 rounded bg-rose-500" />
              <span>SLA Critical Zone</span>
            </div>
          </div>
          <div className="text-zinc-500 flex items-center gap-1">
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Hover on cells to read core node variables. Click to open SRE control console.</span>
          </div>
        </div>
      </div>

      {/* Side Inspect Panel (Col-span 4) */}
      <div className="lg:col-span-4 flex flex-col justify-between bg-[#121215] border border-[#27272A]/60 rounded-2xl p-5 relative overflow-hidden h-full min-h-[400px]">
        <div className="space-y-5">
          <div>
            <span className="text-[9px] font-mono text-[#71717A] uppercase tracking-widest block font-bold">Node Heatmap Inspector</span>
            <h4 className="text-md font-sans font-black text-zinc-100 mt-1 flex items-center space-x-2">
              <Zap className="w-4.5 h-4.5 text-[#00A3FF]" />
              <span>{activeInspectedNode ? activeInspectedNode.name : 'Select a Node'}</span>
            </h4>
          </div>

          <AnimatePresence mode="wait">
            {!activeInspectedNode ? (
              <motion.div
                key="empty-heatmap"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-56 flex flex-col items-center justify-center text-center p-4 border border-dashed border-[#27272A]/60 rounded-xl"
              >
                <Info className="w-8 h-8 text-zinc-600 mb-2.5 animate-pulse" />
                <p className="text-[11px] font-mono text-zinc-500 uppercase leading-normal">
                  Hover over any heatmap block or click a node cell to inspect detailed distribution values and active limits
                </p>
              </motion.div>
            ) : (
              <motion.div
                key={activeInspectedNode.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.15 }}
                className="space-y-4 text-left"
              >
                <div className="flex items-center space-x-2">
                  <span className="px-1.5 py-0.5 bg-[#0C0C0E] border border-[#27272A] rounded font-mono text-[10px] text-zinc-400 font-bold uppercase">
                    {activeInspectedNode.id}
                  </span>
                  <span className="text-[10px] font-mono text-zinc-500 uppercase truncate">
                    {activeInspectedNode.role}
                  </span>
                </div>

                {activeInspectedNode.isViolated && (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 font-mono text-[10.5px] leading-relaxed animate-pulse">
                    <div className="font-bold flex items-center space-x-2 mb-1">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>SLA BREACH DETECTED</span>
                    </div>
                    Latency or success metric has crossed the preset system-wide SRE boundary.
                  </div>
                )}

                {/* Bars for metrics */}
                <div className="space-y-3.5 bg-[#0C0C0E]/50 border border-[#27272A]/40 p-3.5 rounded-xl">
                  {/* Load bar */}
                  <div>
                    <div className="flex items-center justify-between text-[10px] font-mono mb-1.5">
                      <span className="text-zinc-500 flex items-center space-x-1">
                        <Zap className="w-3 h-3 text-[#00A3FF]" />
                        <span>Workload</span>
                      </span>
                      <span className="text-zinc-200 font-bold">{activeInspectedNode.load}%</span>
                    </div>
                    <div className="h-1.5 bg-[#121215] border border-zinc-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-cyan-400 transition-all duration-300"
                        style={{ width: `${activeInspectedNode.load}%` }}
                      />
                    </div>
                  </div>

                  {/* SLA Success rate bar */}
                  <div>
                    <div className="flex items-center justify-between text-[10px] font-mono mb-1.5">
                      <span className="text-zinc-500 flex items-center space-x-1">
                        <ShieldCheck className="w-3 h-3 text-emerald-400" />
                        <span>Success Rate</span>
                      </span>
                      <span className={`font-bold ${activeInspectedNode.successRate < 80 ? 'text-rose-400 font-black' : 'text-zinc-200'}`}>
                        {activeInspectedNode.successRate}%
                      </span>
                    </div>
                    <div className="h-1.5 bg-[#121215] border border-zinc-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${activeInspectedNode.successRate < 80 ? 'bg-rose-500' : 'bg-emerald-500'}`}
                        style={{ width: `${activeInspectedNode.successRate}%` }}
                      />
                    </div>
                  </div>

                  {/* Routing Latency bar */}
                  <div>
                    <div className="flex items-center justify-between text-[10px] font-mono mb-1.5">
                      <span className="text-zinc-500 flex items-center space-x-1">
                        <Clock className="w-3 h-3 text-amber-400" />
                        <span>Latency</span>
                      </span>
                      <span className={`font-bold ${activeInspectedNode.latency > 500 ? 'text-rose-400' : 'text-zinc-200'}`}>
                        {activeInspectedNode.latency}ms
                      </span>
                    </div>
                    <div className="h-1.5 bg-[#121215] border border-zinc-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${activeInspectedNode.latency > 500 ? 'bg-rose-500' : 'bg-amber-500'}`}
                        style={{ width: `${Math.min(100, (activeInspectedNode.latency / 1000) * 100)}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Additional node identity */}
                <div className="text-[10px] font-mono space-y-1 text-zinc-500">
                  <div className="flex justify-between">
                    <span>Coordinates:</span>
                    <span className="text-zinc-400">Column {activeInspectedNode.x}, Row {5 - activeInspectedNode.y}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Role Priority:</span>
                    <span className="text-zinc-400 uppercase font-bold text-[9px]">{activeInspectedNode.id === 'CORE' ? 'Highest' : 'High'}</span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Console Action trigger */}
        <div className="pt-3 border-t border-zinc-800/60">
          <button
            type="button"
            disabled={!selectedId}
            onClick={() => {
              if (selectedId) onSelectAgent(selectedId);
            }}
            className={`w-full py-2 rounded-xl text-xs font-mono font-extrabold uppercase tracking-widest transition flex items-center justify-center space-x-2 cursor-pointer ${
              selectedId
                ? 'bg-cyan-500/15 border border-cyan-500/30 hover:bg-cyan-500/25 text-cyan-400'
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
