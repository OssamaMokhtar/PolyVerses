/**
 * ObservabilityDashboard — PolyVerses PM Workbench Governance Panel
 *
 * Real-time budget tracking, circuit breaker status, agent run history,
 * and decision gate activity for the PM workbench.
 *
 * API: GET /api/observability
 */

import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  Activity, Clock, Shield, RefreshCw, AlertTriangle,
  Zap, Database, CheckCircle2, GitBranch
} from 'lucide-react';

interface BudgetState {
  sessionUsed: number;
  sessionBudget: number;
  sessionRemaining: number;
  sessionPercentUsed: number;
  weeklyUsed: number;
  weeklyBudget: number;
  weeklyRemaining: number;
  weeklyPercentUsed: number;
  circuitBreakerLevel: string;
  perAgent: Record<string, { used: number; budget: number; percentUsed: number }>;
}

interface AgentRun {
  id: string;
  agentId: string;
  modelTier: string;
  inputTokens: number;
  outputTokens: number;
  intent: string;
  outcome: string;
  decisionGateTriggered: boolean;
  timestamp: string;
}

interface Stats {
  totalRuns: number;
  totalTokensUsed: number;
  averageTokensPerRun: number;
  decisionGateRate: number;
}

interface ObservabilityDashboardProps {
  className?: string;
}

type ViewMode = 'budget' | 'runs' | 'gates';

function StatItem({ label, value, highlight, color }: { label: string; value: string | number; highlight?: boolean; color?: string }) {
  return (
    <div className="text-center">
      <div className={highlight ? (color || 'text-[#F59E0B]') : 'text-[#00A3FF]'} className="text-lg font-bold">
        {value}
      </div>
      <div className="text-xs text-[#71717A]">{label}</div>
    </div>
  );
}

function BudgetCard({ icon: Icon, title, subtitle, used, total, remaining, percentUsed, lowThreshold, midThreshold }: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  used: number;
  total: number;
  remaining: number;
  percentUsed: number;
  lowThreshold: number;
  midThreshold: number;
}) {
  const barColor = percentUsed > 80 ? 'bg-[#EF4444]' : percentUsed > 50 ? 'bg-[#F59E0B]' : 'bg-[#00A3FF]';
  const ring = percentUsed > 80 ? 'ring-1 ring-red-500/30' : '';
  const remainingColor = remaining < lowThreshold ? 'text-[#EF4444]' : 'text-[#A1A1AA]';

  return (
    <div className="p-4 bg-[#121215]/80 border border-[#27272A] rounded-xl">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-[#00A3FF]" />
        <h3 className="text-sm font-semibold text-[#E4E4E7]">{title}</h3>
        <span className="text-xs text-[#71717A]">{subtitle}</span>
      </div>
      <div className={`h-3 bg-[#1A1A1E] rounded-full overflow-hidden mb-2 ${ring}`}>
        <div className={`h-full rounded-full transition-all duration-700 ${barColor}`}
          style={{ width: `${Math.min(100, percentUsed)}%` }} />
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-[#A1A1AA]">Used</span>
        <span className="text-[#E4E4E7] font-mono font-medium">{formatTokens(used)} / {formatTokens(total)}</span>
      </div>
      <div className="flex items-center justify-between text-xs mt-1">
        <span className="text-[#71717A]">Remaining</span>
        <span className={`font-mono ${remainingColor}`}>
          {formatTokens(remaining)} tokens
        </span>
      </div>
    </div>
  );
}

function formatTokens(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toString();
}

function formatDate(iso: string) {
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

export function ObservabilityDashboard({ className }: ObservabilityDashboardProps) {
  const [budget, setBudget] = useState<BudgetState | null>(null);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('budget');
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshCounter, setRefreshCounter] = useState(0);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/observability');
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.data) {
          setBudget(data.data.budget);
          setRuns(data.data.runs || []);
          setStats(data.data.stats);
          setLastFetched(new Date());
        }
      }
    } catch {}
    finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [refreshCounter]);

  const getBreakerColor = (level: string) => {
    switch (level) {
      case 'small': return 'text-[#F59E0B] bg-[#F59E0B]/10 border-[#F59E0B]/30';
      case 'medium': return 'text-[#EF4444] bg-[#EF4444]/10 border-[#EF4444]/30';
      case 'capable': return 'text-[#DC2626] bg-[#DC2626]/10 border-[#DC2626]/30';
      default: return 'text-[#10B981] bg-[#10B981]/10 border-[#10B981]/30';
    }
  };

  const getBreakerLabel = (level: string) => {
    switch (level) {
      case 'small': return 'Budget pressure — small agents constrained';
      case 'medium': return 'Session budget near limit — pause synthesis agents';
      case 'capable': return 'Critical — halt all agent invocations';
      default: return 'Normal — all agents operational';
    }
  };

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#00A3FF]/10 rounded-lg">
            <Activity className="w-5 h-5 text-[#00A3FF]" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[#E4E4E7]">Observability Dashboard</h2>
            <p className="text-xs text-[#71717A]">PolyVerses PM Workbench · Governance Layer S1</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {lastFetched && (
            <span className="text-xs text-[#71717A] flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatDate(lastFetched.toISOString())}
            </span>
          )}
          <button
            onClick={() => setRefreshCounter(c => c + 1)}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-[#27272A] rounded-lg text-xs text-[#71717A] hover:text-[#A1A1AA] hover:bg-[#16161A] transition disabled:opacity-50"
          >
            {isLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Refresh
          </button>
        </div>
      </div>

      <div className="flex gap-1 mb-4 border-b border-[#27272A] pb-2">
        {(['budget', 'runs', 'gates'] as ViewMode[]).map(mode => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition capitalize ${viewMode === mode ? 'bg-[#00A3FF]/10 text-[#00A3FF] border-b-2 border-[#00A3FF]' : 'text-[#71717A] hover:text-[#A1A1AA]'}`}
          >
            {mode}
          </button>
        ))}
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="flex items-center gap-3 text-[#71717A]">
            <RefreshCw className="w-5 h-5 animate-spin" />
            <span className="text-sm">Loading observability data...</span>
          </div>
        </div>
      )}

      {!isLoading && budget && (
        <>
          {viewMode === 'budget' && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              <div className={`p-4 rounded-xl border ${budget.circuitBreakerLevel !== 'none' ? 'border-red-500/30 bg-red-500/5' : 'border-[#27272A] bg-[#121215]/80'}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {budget.circuitBreakerLevel !== 'none' ? (
                      <AlertTriangle className="w-5 h-5 text-red-400" />
                    ) : (
                      <Shield className="w-5 h-5 text-[#10B981]" />
                    )}
                    <span className="text-sm font-semibold text-[#E4E4E7]">Circuit Breaker</span>
                  </div>
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${getBreakerColor(budget.circuitBreakerLevel)}`}>
                    {budget.circuitBreakerLevel.toUpperCase()}
                  </span>
                </div>
                <p className="text-sm text-[#A1A1AA]">{getBreakerLabel(budget.circuitBreakerLevel)}</p>
              </div>

              <BudgetCard
                icon={Zap}
                title="Session Budget"
                subtitle="100K tokens"
                used={budget.sessionUsed}
                total={budget.sessionBudget}
                remaining={budget.sessionRemaining}
                percentUsed={budget.sessionPercentUsed}
                lowThreshold={10000}
                midThreshold={50000}
              />

              <BudgetCard
                icon={Clock}
                title="Weekly Budget"
                subtitle="500K tokens / week"
                used={budget.weeklyUsed}
                total={budget.weeklyBudget}
                remaining={budget.weeklyRemaining}
                percentUsed={budget.weeklyPercentUsed}
                lowThreshold={50000}
                midThreshold={250000}
              />

              <div className="p-4 bg-[#121215]/80 border border-[#27272A] rounded-xl">
                <div className="flex items-center gap-2 mb-3">
                  <GitBranch className="w-4 h-4 text-[#00A3FF]" />
                  <h3 className="text-sm font-semibold text-[#E4E4E7]">Per-Agent Budget Usage</h3>
                </div>
                <div className="space-y-2">
                  {Object.entries(budget.perAgent).map(([agentId, u]) => (
                    <div key={agentId} className="flex items-center gap-3">
                      <span className="text-xs font-mono text-[#A1A1AA] w-10 shrink-0">{agentId}</span>
                      <div className={`flex-1 h-2 bg-[#1A1A1E] rounded-full overflow-hidden ${u.percentUsed > 80 ? 'ring-1 ring-red-500/30' : ''}`}>
                        <div className={`h-full rounded-full transition-all duration-500 ${u.percentUsed > 80 ? 'bg-[#EF4444]' : u.percentUsed > 50 ? 'bg-[#F59E0B]' : 'bg-[#00A3FF]'}`}
                          style={{ width: `${Math.min(100, u.percentUsed)}%` }} />
                      </div>
                      <span className="text-xs text-[#71717A] font-mono w-16 text-right shrink-0">
                        {u.used.toFixed(0)}/{u.budget.toFixed(0)} ({u.percentUsed.toFixed(0)}%)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {viewMode === 'runs' && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-3"
            >
              <div className="p-4 bg-[#121215]/80 border border-[#27272A] rounded-xl">
                <div className="flex items-center gap-2 mb-3">
                  <Database className="w-4 h-4 text-[#00A3FF]" />
                  <h3 className="text-sm font-semibold text-[#E4E4E7]">Recent Agent Runs</h3>
                  <span className="text-xs text-[#71717A]">{runs.length} total</span>
                </div>
                {stats && (
                  <div className="grid grid-cols-3 gap-3 mb-4 p-3 bg-[#0C0C0E] rounded-lg">
                    <StatItem label="Total runs" value={stats.totalRuns} />
                    <StatItem label="Tokens used" value={formatTokens(stats.totalTokensUsed)} />
                    <StatItem label="Avg / run" value={stats.averageTokensPerRun.toFixed(0)} />
                  </div>
                )}
                <div className="space-y-2 max-h-[500px] overflow-y-auto">
                  {runs.length === 0 ? (
                    <div className="text-center py-6 text-[#71717A] text-sm">
                      <Activity className="w-6 h-6 mx-auto mb-2 text-[#27272A]" />
                      <p>No runs recorded yet.</p>
                    </div>
                  ) : (
                    runs.map((run) => (
                      <div key={run.id} className="p-3 bg-[#121215]/60 border border-[#27272A] rounded-lg hover:bg-[#121215]/90 transition">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <div className="w-5 h-5 rounded bg-[#00A3FF]/10 flex items-center justify-center text-[#00A3FF] text-xs font-bold">
                              {run.agentId}
                            </div>
                            <span className="text-sm font-medium text-[#E4E4E7]">{run.agentId}</span>
                            <span className="text-xs text-[#71717A]">· {run.modelTier}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-[#71717A]">{formatDate(run.timestamp)}</span>
                            {run.decisionGateTriggered && (
                              <span className="flex items-center gap-1 px-1.5 py-0.5 bg-[#F59E0B]/10 border border-[#F59E0B]/30 rounded text-[#F59E0B]">
                                <Shield className="w-3 h-3" />
                                Gate
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-[#71717A]">
                          <span>Intent: {run.intent}</span>
                          <span>In: {formatTokens(run.inputTokens)}</span>
                          <span>Out: {formatTokens(run.outputTokens)}</span>
                          <span className="truncate max-w-[300px]">{run.outcome.slice(0, 60)}...</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {viewMode === 'gates' && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-3"
            >
              <div className="p-4 bg-[#121215]/80 border border-[#27272A] rounded-xl">
                <div className="flex items-center gap-2 mb-3">
                  <Shield className="w-4 h-4 text-[#00A3FF]" />
                  <h3 className="text-sm font-semibold text-[#E4E4E7]">Decision Gate Activity</h3>
                  {stats && (
                    <span className="text-xs text-[#71717A]">
                      Gate rate: {(stats.decisionGateRate * 100).toFixed(1)}%
                    </span>
                  )}
                </div>
                {stats && (
                  <div className="grid grid-cols-2 gap-3 mb-4 p-3 bg-[#0C0C0E] rounded-lg">
                    <StatItem label="Gate rate" value={(stats.decisionGateRate * 100).toFixed(1) + '%'} highlight color="text-[#F59E0B]" />
                    <StatItem label="Total runs" value={stats.totalRuns} />
                  </div>
                )}
                <div className="space-y-2">
                  {runs.filter(r => r.decisionGateTriggered).length === 0 ? (
                    <div className="text-center py-6 text-[#71717A] text-sm">
                      <CheckCircle2 className="w-6 h-6 mx-auto mb-2 text-[#10B981]" />
                      <p>No decision gates triggered yet.</p>
                      <p className="text-xs mt-1">Gates fire when an agent's response requires human approval before action.</p>
                    </div>
                  ) : (
                    runs.filter(r => r.decisionGateTriggered).map((run) => (
                      <div key={run.id} className="p-3 bg-[#F59E0B]/5 border border-[#F59E0B]/20 rounded-lg">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <Shield className="w-4 h-4 text-[#F59E0B]" />
                            <span className="text-sm font-medium text-[#E4E4E7]">{run.agentId}</span>
                          </div>
                          <span className="text-xs text-[#71717A]">{formatDate(run.timestamp)}</span>
                        </div>
                        <p className="text-xs text-[#A1A1AA] truncate">{run.outcome.slice(0, 120)}...</p>
                        <div className="mt-2 flex items-center gap-3 text-xs text-[#71717A]">
                          <span>Intent: {run.intent}</span>
                          <span>Tokens: {formatTokens(run.inputTokens + run.outputTokens)}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </>
      )}
    </div>
  );
}
