import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  BarChart4, Activity, DollarSign, Clock, LayoutGrid, Radio, Shield, CheckCircle2, AlertTriangle, RefreshCw
} from 'lucide-react';
import { D3Heatmap } from './D3Heatmap';

export function ObservabilityDashboard() {
  const [activeRegion, setActiveRegion] = useState<'us-east-1' | 'eu-west-1'>('us-east-1');
  const [isFailingOver, setIsFailingOver] = useState(false);
  const [failureHistory, setFailureHistory] = useState<string[]>([]);
  
  // Real-time jitter metrics
  const [metrics, setMetrics] = useState({
    cpuPercent: 34.2,
    latencyMs: 142.5,
    apiCost: 0.042,
    activeThreads: 3,
    overrideRate: 8.5,
    systemHealth: 100
  });

  // Jitter simulator
  useEffect(() => {
    const interval = setInterval(() => {
      setMetrics((prev) => {
        const jitterCpu = Number((30 + Math.random() * 12).toFixed(1));
        const jitterLatency = Number((130 + Math.random() * 30).toFixed(1));
        return {
          ...prev,
          cpuPercent: jitterCpu,
          latencyMs: jitterLatency,
          apiCost: Number((prev.apiCost + (Math.random() * 0.001)).toFixed(5))
        };
      });
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const triggerManualFailover = () => {
    if (isFailingOver) return;
    setIsFailingOver(true);
    const destination = activeRegion === 'us-east-1' ? 'eu-west-1' : 'us-east-1';
    
    // Simulate <2s Route53 global failover
    setTimeout(() => {
      setActiveRegion(destination);
      setIsFailingOver(false);
      setFailureHistory((prev) => [
        `[${new Date().toLocaleTimeString()}] Route53 record flipped: Dynamic registers shifted to ${destination}`,
        ...prev
      ]);
    }, 1500);
  };

  return (
    <div className="space-y-8">
      
      {/* Active fail-over control board */}
      <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 blur-3xl pointer-events-none" />
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <span className="text-xs font-mono tracking-wider text-cyan-400 uppercase font-medium">Route53 Active-Passive Multi-Region failover</span>
            <h3 className="text-xl font-sans font-medium text-slate-200 mt-0.5">Global Cluster Failover Management</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-xl leading-relaxed">
              PolyVerses tracks DNS health metrics on a 10s interval. Breaches trigger emergency traffic flow routing using weighted DNS values in &lt;120 seconds.
            </p>
          </div>

          <button
            onClick={triggerManualFailover}
            disabled={isFailingOver}
            className="px-5 py-3 h-11 bg-slate-850 hover:bg-slate-800 hover:text-cyan-400 border border-slate-700/80 rounded-xl text-xs font-mono font-bold tracking-wider transition uppercase flex items-center justify-center space-x-2 shrink-0 cursor-pointer"
          >
            {isFailingOver ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
                <span>Redirecting Traffic...</span>
              </>
            ) : (
              <>
                <Radio className="w-4 h-4 animate-pulse text-rose-500 shrink-0" />
                <span>Trigger Manual Failover</span>
              </>
            )}
          </button>
        </div>

        {/* Global regions topology comparison mockup map */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
          {/* Primary region */}
          <div className={`p-4 rounded-xl border transition duration-300 ${
            activeRegion === 'us-east-1' 
              ? 'bg-cyan-950/10 border-cyan-500/40 ring-1 ring-cyan-500/20' 
              : 'bg-slate-950/20 border-slate-850 opacity-60'
          }`}>
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center space-x-2">
                <Shield className="w-4 h-4 text-cyan-400" />
                <span className="font-semibold text-xs font-mono text-slate-300">US-EAST-1 (Primary)</span>
              </div>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                activeRegion === 'us-east-1' ? 'bg-cyan-500/15 text-cyan-400 font-bold' : 'bg-slate-800 text-slate-500'
              }`}>
                {activeRegion === 'us-east-1' ? 'ACTIVE LEADER' : 'PASSIVE STANDBY'}
              </span>
            </div>
            <p className="text-xs text-slate-450 mt-2 leading-relaxed">Runs master RDS PostgreSQL entries, Redis ledger pipelines, and is targeted by AWS ELB routers.</p>
          </div>

          {/* Standby region */}
          <div className={`p-4 rounded-xl border transition duration-300 ${
            activeRegion === 'eu-west-1' 
              ? 'bg-cyan-950/10 border-cyan-500/40 ring-1 ring-cyan-500/20' 
              : 'bg-slate-950/20 border-slate-850 opacity-60'
          }`}>
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center space-x-2">
                <Radio className="w-4 h-4 text-emerald-400" />
                <span className="font-semibold text-xs font-mono text-slate-300">EU-WEST-1 (Standby)</span>
              </div>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                activeRegion === 'eu-west-1' ? 'bg-cyan-500/15 text-cyan-400 font-bold' : 'bg-slate-800 text-slate-500'
              }`}>
                {activeRegion === 'eu-west-1' ? 'ACTIVE LEADER' : 'PASSIVE STANDBY'}
              </span>
            </div>
            <p className="text-xs text-slate-450 mt-2 leading-relaxed">Houses cross-region database replication streams with RPO &lt;5 seconds. Ready for hot-takeover.</p>
          </div>
        </div>

        {/* Failover logs */}
        {failureHistory.length > 0 && (
          <div className="mt-4 p-3 bg-slate-950/60 border border-slate-850 rounded-xl space-y-1 overflow-x-hidden">
            <span className="text-[10px] font-mono text-slate-500 tracking-wider uppercase block font-semibold">Route53 DNS ledger</span>
            {failureHistory.map((h, i) => (
              <div key={i} className="text-xs font-mono text-slate-400 leading-relaxed truncate">{h}</div>
            ))}
          </div>
        )}
      </div>

      {/* D3-based Agent Telemetry Heatmap */}
      <D3Heatmap />

      {/* Grid of Prometheus / OpenTelemetry telemetry counters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        
        {/* Dynamic Spend */}
        <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5">
          <div className="flex justify-between items-start w-full">
            <DollarSign className="w-5 h-5 text-emerald-400" />
            <span className="text-[10px] font-mono text-slate-500">athena_llm_cost_usd</span>
          </div>
          <span className="block text-3xl font-sans font-medium text-slate-100 mt-4">${metrics.apiCost.toFixed(4)}</span>
          <p className="text-xs text-slate-450 mt-1.5 leading-relaxed">Total spent on active GPT-4o integration calls during this live session.</p>
        </div>

        {/* Latency Index */}
        <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5">
          <div className="flex justify-between items-start w-full">
            <Clock className="w-5 h-5 text-cyan-400" />
            <span className="text-[10px] font-mono text-slate-500">athena_api_latency_ms</span>
          </div>
          <span className="block text-3xl font-sans font-medium text-slate-100 mt-4">{metrics.latencyMs}ms</span>
          <p className="text-xs text-slate-450 mt-1.5 leading-relaxed">p95 API response duration times across internal agent loops.</p>
        </div>

        {/* Human Override rate */}
        <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5">
          <div className="flex justify-between items-start w-full">
            <Activity className="w-5 h-5 text-amber-500" />
            <span className="text-[10px] font-mono text-slate-500">athena_gate_override_rate</span>
          </div>
          <span className="block text-3xl font-sans font-medium text-slate-100 mt-4">{metrics.overrideRate}%</span>
          <p className="text-xs text-slate-450 mt-1.5 leading-relaxed">Average percentage of workflow decisions modified by human authorization steps.</p>
        </div>

        {/* Server utilization */}
        <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5">
          <div className="flex justify-between items-start w-full">
            <BarChart4 className="w-5 h-5 text-indigo-400" />
            <span className="text-[10px] font-mono text-slate-500">athena_cpu_load</span>
          </div>
          <span className="block text-3xl font-sans font-medium text-slate-100 mt-4">{metrics.cpuPercent}%</span>
          <p className="text-xs text-slate-450 mt-1.5 leading-relaxed">Active CPU threads utilization across container pods.</p>
        </div>

        {/* Active threads */}
        <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5">
          <div className="flex justify-between items-start w-full">
            <LayoutGrid className="w-5 h-5 text-pink-400" />
            <span className="text-[10px] font-mono text-slate-500">athena_active_nodes</span>
          </div>
          <span className="block text-3xl font-sans font-medium text-slate-100 mt-4">{metrics.activeThreads}</span>
          <p className="text-xs text-slate-450 mt-1.5 leading-relaxed">Currently active thread counts in the Redis Streams buffer queue.</p>
        </div>

        {/* Status indicator */}
        <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5">
          <div className="flex justify-between items-start w-full">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <span className="text-[10px] font-mono text-slate-500">athena_system_health</span>
          </div>
          <span className="block text-3xl font-sans font-medium text-slate-100 mt-4">{metrics.systemHealth}%</span>
          <p className="text-xs text-slate-450 mt-1.5 leading-relaxed">Comprehensive health rating computed against SLA bounds.</p>
        </div>

      </div>

    </div>
  );
}
