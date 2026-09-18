/**
 * ThinkSurface — PolyVerses PM Workbench Query Interface
 *
 * Central query surface for the PM workbench: submit a product question,
 * see the orchestrator's routing decision, review the agent's response,
 * and trigger the human gate for any decision that requires approval.
 *
 * API: POST /api/orchestrate { query, context? }
 * API: POST /api/route { query } — routing preview
 * API: GET  /api/observability — budget + run history
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Sparkles, Brain, ArrowRight, Shield, Loader2, CheckCircle2,
  AlertTriangle, Copy, ChevronDown, ChevronUp,
  Clock, Zap, BarChart3, GitBranch, MessageSquare
} from 'lucide-react';

interface RoutingDecision {
  primaryAgent: string;
  primaryAgentName: string;
  rationale: string;
  secondaryAgents?: string[];
  intent: string;
  confidence: number;
  requiresGate?: boolean;
}

interface OrchestrateResult {
  success: boolean;
  data?: {
    routing: RoutingDecision;
    agentId: string;
    agentName: string;
    modelTier: string;
    inputTokens: number;
    outputTokens: number;
    output: string;
    requiresGate: boolean;
    budget: {
      sessionUsed: number;
      sessionRemaining: number;
      weeklyUsed: number;
      weeklyRemaining: number;
    };
  };
  error?: string;
}

const QUICK_PROMPTS = [
  { label: 'Write user stories for a new onboarding flow', icon: GitBranch },
  { label: 'Prioritize these 3 features using RICE', icon: BarChart3 },
  { label: 'Identify risks for launching v2 next month', icon: AlertTriangle },
  { label: 'Draft a release plan for the mobile app', icon: GitBranch },
  { label: 'Research assumptions for a pricing change', icon: Sparkles },
  { label: 'Create a change communication draft', icon: MessageSquare },
];

interface ThinkSurfaceProps {
  className?: string;
}

export function ThinkSurface({ className }: ThinkSurfaceProps) {
  const [query, setQuery] = useState('');
  const [context, setContext] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<OrchestrateResult | null>(null);
  const [routingOnly, setRoutingOnly] = useState<RoutingDecision | null>(null);
  const [routingOnlyLoading, setRoutingOnlyLoading] = useState(false);
  const [selectedPrompt, setSelectedPrompt] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<'compose' | 'history'>('compose');
  const [history, setHistory] = useState<Array<{ query: string; agentId: string; agentName: string; timestamp: string; requiresGate: boolean }>>([]);
  const [budget, setBudget] = useState<{ sessionUsed: number; sessionRemaining: number; weeklyUsed: number; weeklyRemaining: number; circuitBreakerLevel: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showOutput, setShowOutput] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const obsRes = await fetch('/api/observability');
        if (obsRes.ok) {
          const obs = await obsRes.json();
          if (obs.success && obs.data) {
            setBudget({
              sessionUsed: obs.data.budget.sessionUsed,
              sessionRemaining: obs.data.budget.sessionRemaining,
              weeklyUsed: obs.data.budget.weeklyUsed,
              weeklyRemaining: obs.data.budget.weeklyRemaining,
              circuitBreakerLevel: obs.data.budget.circuitBreakerLevel || 'none',
            });
            const recent = (obs.data.runs || []).slice(0, 20).map(r => ({
              query: r.outcome.slice(0, 100),
              agentId: r.agentId,
              agentName: r.agentId,
              timestamp: r.timestamp,
              requiresGate: r.decisionGateTriggered,
            }));
            setHistory(recent);
          }
        }
      } catch {}
    };
    fetchData();
  }, []);

  const handleOrchestrate = async () => {
    if (!query.trim()) return;
    setIsRunning(true);
    setError(null);
    setResult(null);
    setShowOutput(false);
    try {
      const body = { query, context: context.trim() || undefined };
      const res = await fetch('/api/orchestrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setResult(data);
      if (data.success && data.data) {
        setHistory(prev => [{
          query: query.slice(0, 100),
          agentId: data.data.agentId,
          agentName: data.data.agentName,
          timestamp: new Date().toISOString(),
          requiresGate: data.data.requiresGate,
        }, ...prev.slice(0, 19)]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setIsRunning(false);
    }
  };

  const handleRouteOnly = async () => {
    if (!query.trim()) return;
    setRoutingOnlyLoading(true);
    setRoutingOnly(null);
    try {
      const res = await fetch('/api/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      const data = await res.json();
      if (data.success && data.data?.routing) {
        setRoutingOnly(data.data.routing);
      }
    } catch {}
    finally {
      setRoutingOnlyLoading(false);
    }
  };

  const copyOutput = () => {
    if (result?.data?.output) {
      navigator.clipboard.writeText(result.data.output);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className={className}>
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-[#00A3FF]/10 rounded-lg">
          <Brain className="w-5 h-5 text-[#00A3FF]" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-[#E4E4E7]">ThinkSurface</h2>
          <p className="text-xs text-[#71717A]">PolyVerses PM Workbench — query, route, decide</p>
        </div>
      </div>

      {budget && (
        <div className="mb-4 p-3 bg-[#121215]/80 border border-[#27272A] rounded-lg flex items-center gap-4 text-xs flex-wrap">
          <div className="flex items-center gap-1.5 text-[#71717A]">
            <Zap className="w-3.5 h-3.5" />
            <span>Session</span>
          </div>
          <div className="flex-1 h-2 bg-[#1A1A1E] rounded-full overflow-hidden min-w-[80px]">
            <div className={`h-full rounded-full transition-all duration-500 ${budget.sessionRemaining < 20000 ? 'bg-[#EF4444]' : budget.sessionRemaining < 50000 ? 'bg-[#F59E0B]' : 'bg-[#00A3FF]'}`}
              style={{ width: `${Math.min(100, (budget.sessionUsed / (budget.sessionRemaining + budget.sessionUsed)) * 100)}%` }} />
          </div>
          <span className="text-[#A1A1AA] font-mono">{Math.round(budget.sessionUsed / 1000)}K / {Math.round((budget.sessionRemaining + budget.sessionUsed) / 1000)}K</span>
          <div className="flex items-center gap-1.5 text-[#71717A]">
            <Clock className="w-3.5 h-3.5" />
            <span>Weekly</span>
          </div>
          <div className="flex-1 h-2 bg-[#1A1A1E] rounded-full overflow-hidden min-w-[80px]">
            <div className={`h-full rounded-full transition-all duration-500 ${budget.weeklyRemaining < 50000 ? 'bg-[#F59E0B]' : 'bg-[#00A3FF]'}`}
              style={{ width: `${Math.min(100, (budget.weeklyUsed / (budget.weeklyRemaining + budget.weeklyUsed)) * 100)}%` }} />
          </div>
          <span className="text-[#A1A1AA] font-mono">{Math.round(budget.weeklyUsed / 1000)}K / {Math.round((budget.weeklyRemaining + budget.weeklyUsed) / 1000)}K</span>
          {budget.circuitBreakerLevel !== 'none' && (
            <div className="flex items-center gap-1 text-[#EF4444]">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span className="text-xs font-medium">{budget.circuitBreakerLevel} breaker</span>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-1 mb-4 border-b border-[#27272A] pb-2">
        <button
          onClick={() => setTab('compose')}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg transition ${tab === 'compose' ? 'bg-[#00A3FF]/10 text-[#00A3FF] border-b-2 border-[#00A3FF]' : 'text-[#71717A] hover:text-[#A1A1AA]'}`}
        >
          Compose
        </button>
        <button
          onClick={() => setTab('history')}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg transition ${tab === 'history' ? 'bg-[#00A3FF]/10 text-[#00A3FF] border-b-2 border-[#00A3FF]' : 'text-[#71717A] hover:text-[#A1A1AA]'}`}
        >
          History ({history.length})
        </button>
      </div>

      <AnimatePresence mode="wait">
        {tab === 'compose' ? (
          <motion.div
            key="compose"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-4"
          >
            <div className="flex flex-wrap gap-2">
              {QUICK_PROMPTS.map((p, i) => (
                <button
                  key={i}
                  onClick={() => { setQuery(p.label); setSelectedPrompt(p.label); setContext(''); }}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[#27272A] bg-[#121215]/60 hover:bg-[#16161A] hover:border-[#3f3f46] text-xs text-[#A1A1AA] hover:text-[#E4E4E7] transition text-left"
                >
                  <p.icon className="w-3.5 h-3.5 text-[#71717A]" />
                  {p.label}
                </button>
              ))}
            </div>

            <textarea
              value={query}
              onChange={e => { setQuery(e.target.value); setSelectedPrompt(null); }}
              placeholder="Ask the PM workbench anything — e.g. 'Write user stories for a new onboarding flow', 'Prioritize these features using RICE', 'Identify risks for the v2 launch'..."
              className="w-full h-28 px-4 py-3 bg-[#0C0C0E] border border-[#27272A] rounded-xl text-[#E4E4E7] placeholder-[#52525B] text-sm resize-none focus:outline-none focus:border-[#00A3FF]/50 focus:ring-1 focus:ring-[#00A3FF]/20 transition"
            />
            {selectedPrompt && (
              <div className="absolute top-2 right-2 flex items-center gap-1.5 px-2 py-1 bg-[#00A3FF]/10 rounded text-xs text-[#00A3FF]">
                Prompt selected
              </div>
            )}

            <div className="flex items-center gap-2">
              <input
                value={context}
                onChange={e => setContext(e.target.value)}
                placeholder="Context (optional) — paste background, requirements, or constraints..."
                className="flex-1 h-10 px-4 bg-[#0C0C0E] border border-[#27272A] rounded-lg text-sm text-[#A1A1AA] placeholder-[#52525B] focus:outline-none focus:border-[#00A3FF]/50"
              />
              <button
                onClick={() => setContext('')}
                className="px-3 py-2 text-xs text-[#71717A] hover:text-[#A1A1AA] border border-[#27272A] rounded-lg hover:bg-[#16161A] transition"
              >
                Clear
              </button>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleRouteOnly}
                disabled={!query.trim() || routingOnlyLoading}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[#27272A] bg-[#121215]/80 text-[#A1A1AA] hover:bg-[#16161A] hover:text-[#E4E4E7] text-sm disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {routingOnlyLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <GitBranch className="w-4 h-4" />}
                Preview routing
              </button>
              <button
                onClick={handleOrchestrate}
                disabled={!query.trim() || isRunning}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#00A3FF] hover:bg-[#0090D1] text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition flex-1"
              >
                {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {isRunning ? 'Thinking...' : 'Run query'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            <AnimatePresence>
              {routingOnly && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="p-4 bg-[#121215]/90 border border-[#27272A] rounded-xl"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <GitBranch className="w-4 h-4 text-[#00A3FF]" />
                    <h3 className="text-sm font-semibold text-[#E4E4E7]">Routing Preview</h3>
                    <span className="text-xs text-[#71717A]">· F00 Orchestrator</span>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-[#71717A]">Primary agent</span>
                      <span className="text-[#E4E4E7] font-medium">{routingOnly.primaryAgent} — {routingOnly.primaryAgentName}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[#71717A]">Intent</span>
                      <span className="text-[#A1A1AA]">{routingOnly.intent}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[#71717A]">Confidence</span>
                      <span className="text-[#A1A1AA]">{routingOnly.confidence.toFixed(2)}</span>
                    </div>
                    {routingOnly.requiresGate && (
                      <div className="flex items-center gap-2 text-[#F59E0B] bg-[#F59E0B]/10 px-3 py-1.5 rounded-lg mt-2">
                        <Shield className="w-4 h-4" />
                        <span className="text-xs font-medium">Human gate required before action</span>
                      </div>
                    )}
                    <div className="pt-2 border-t border-[#27272A]">
                      <p className="text-[#A1A1AA] text-xs leading-relaxed">{routingOnly.rationale}</p>
                    </div>
                    {routingOnly.secondaryAgents && routingOnly.secondaryAgents.length > 0 && (
                      <div className="pt-2">
                        <span className="text-xs text-[#71717A] block mb-1">Secondary agents</span>
                        <div className="flex flex-wrap gap-1.5">
                          {routingOnly.secondaryAgents.map(id => (
                            <span key={id} className="px-2 py-0.5 bg-[#1A1A1E] border border-[#27272A] rounded text-xs text-[#A1A1AA]">{id}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}

            <AnimatePresence>
              {result && result.data && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="space-y-3"
                >
                  <div className="flex items-center justify-between p-3 bg-[#121215]/90 border border-[#27272A] rounded-xl">
                    <div className="flex items-center gap-3">
                      <div className="p-1.5 bg-[#00A3FF]/10 rounded-lg">
                        <Zap className="w-4 h-4 text-[#00A3FF]" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-[#E4E4E7]">{result.data.agentName}</div>
                        <div className="text-xs text-[#71717A]">
                          {result.data.agentId} · {result.data.modelTier} · {result.data.inputTokens + result.data.outputTokens} tokens
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {result.data.requiresGate && (
                        <div className="flex items-center gap-1 px-2 py-1 bg-[#F59E0B]/10 border border-[#F59E0B]/30 rounded-lg">
                          <Shield className="w-3.5 h-3.5 text-[#F59E0B]" />
                          <span className="text-xs font-medium text-[#F59E0B]">Gate</span>
                        </div>
                      )}
                      <button
                        onClick={copyOutput}
                        className="p-2 border border-[#27272A] rounded-lg hover:bg-[#16161A] text-[#71717A] hover:text-[#A1A1AA] transition"
                        title="Copy output"
                      >
                        {copied ? <CheckCircle2 className="w-4 h-4 text-[#10B981]" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="text-xs text-[#71717A] space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[#52525B]">Routing:</span>
                      <span className="text-[#A1A1AA]">{result.data.routing.primaryAgent} → {result.data.routing.primaryAgentName}</span>
                      {result.data.routing.confidence > 0.7 && <span className="text-[#10B981] text-xs">high confidence</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[#52525B]">Rationale:</span>
                      <span className="text-[#A1A1AA] truncate max-w-[400px]">{result.data.routing.rationale}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => setShowOutput(!showOutput)}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-[#71717A] hover:text-[#A1A1AA] border border-[#27272A] rounded-lg hover:bg-[#16161A] transition"
                  >
                    {showOutput ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    {showOutput ? 'Hide' : 'Show'} response ({result.data.outputTokens} tokens)
                  </button>

                  <AnimatePresence>
                    {showOutput && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="p-4 bg-[#0C0C0E] border border-[#27272A] rounded-xl text-sm text-[#E4E4E7] leading-relaxed whitespace-pre-wrap max-h-[400px] overflow-y-auto font-mono text-xs">
                          {result.data.output}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {result.data.budget && (
                    <div className="flex items-center gap-4 text-xs text-[#71717A] p-3 bg-[#121215]/60 rounded-lg border border-[#27272A]">
                      <span>Session: {Math.round(result.data.budget.sessionUsed / 1000)}K used, {Math.round(result.data.budget.sessionRemaining / 1000)}K remaining</span>
                      <span className="text-[#A1A1AA]">|</span>
                      <span>Weekly: {Math.round(result.data.budget.weeklyUsed / 1000)}K used, {Math.round(result.data.budget.weeklyRemaining / 1000)}K remaining</span>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ) : (
          <motion.div
            key="history"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-3"
          >
            {history.length === 0 ? (
              <div className="p-8 text-center text-[#71717A] text-sm">
                <Brain className="w-8 h-8 mx-auto mb-3 text-[#27272A]" />
                <p>No queries yet. Compose a question to see the orchestrator in action.</p>
              </div>
            ) : (
              history.map((item, i) => (
                <div key={i} className="p-3 bg-[#121215]/60 border border-[#27272A] rounded-xl hover:bg-[#121215]/90 transition cursor-pointer">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded bg-[#00A3FF]/10 flex items-center justify-center text-[#00A3FF] text-xs font-bold">
                        {item.agentId}
                      </div>
                      <span className="text-sm font-medium text-[#E4E4E7]">{item.agentName}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      {item.requiresGate && (
                        <span className="flex items-center gap-1 px-2 py-0.5 bg-[#F59E0B]/10 border border-[#F59E0B]/30 rounded text-[#F59E0B]">
                          <Shield className="w-3 h-3" />
                          Gate
                        </span>
                      )}
                      <span className="text-[#71717A]">
                        {new Date(item.timestamp).toLocaleString()}
                      </span>
                    </div>
                  </div>
                  <p className="text-sm text-[#A1A1AA] truncate">{item.query}</p>
                </div>
              ))
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
