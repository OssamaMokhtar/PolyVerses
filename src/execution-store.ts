/**
 * ExecutionStore - in-memory store for pipeline orchestrations and agent runs.
 *
 * Tracks multi-step orchestrations: query -> retrieve -> assemble -> reason -> act.
 * Provides cancellation, lookup, and history capabilities for the PolyVerses PM workbench.
 */

import { AGENTS, sessionBudget, notesStore, gateQueue, recentRuns } from './server';

// In-memory execution store: execId -> execution record
type ExecutionStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

interface StepRecord {
  step: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'skipped';
  noteIds?: string[];
  error?: string;
  timestamp: number;
  [key: string]: unknown;
}

interface PipelineResult {
  query: string;
  filter?: Record<string, unknown>;
  steps: StepRecord[];
  finalOutput: string;
  actionsExecuted: unknown[];
  tokensUsed: number;
  retrievedNoteCount: number;
  assembledContextSize: number;
}

interface ExecutionRecord {
  execId: string;
  userId: string;
  status: ExecutionStatus;
  pipeline: string;
  startedAt: number;
  completedAt?: number;
  cancelledAt?: number;
  steps: StepRecord[];
  result?: PipelineResult;
}

// Module-level state
const executions = new Map<string, ExecutionRecord>();

function generateExecId(): string {
  const ts = Date.now().toString(36).slice(-6);
  const rand = Math.random().toString(36).slice(2, 8);
  return `exec_${ts}_${rand}`;
}

function now(): number {
  return Date.now();
}

async function orchestratePipeline(userId: string, body: Record<string, unknown>): Promise<{ success: boolean; error?: string; data?: unknown }> {
  const uid = userId;
  const { query, filter, options } = body || {};

  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    return { success: false, error: 'Missing or invalid "query" field.' };
  }

  const execId = generateExecId();
  const startedAt = now();

  console.log(`[Orchestrate] UID=${uid} exec=${execId} query=${query.slice(0, 80)}`);

  // Step 1: Retrieve
  const retrieveBody: Record<string, unknown> = { query, filters: filter || {}, limit: 10 };
  const retrieveResult = await handleRetrieve(uid, retrieveBody);
  if (!retrieveResult.success) {
    const completedAt = now();
    executions.set(execId, {
      execId, userId: uid, status: 'failed', pipeline: 'retrieve->assemble->reason->act',
      startedAt, completedAt,
      steps: [{ step: 'retrieve', status: 'failed', error: retrieveResult.error || 'Unknown error', timestamp: now() }],
      result: undefined,
    });
    return { success: false, error: `Pipeline failed at retrieve: ${retrieveResult.error}` };
  }

  const noteIds = (retrieveResult.data as { noteIds?: string[] })?.noteIds || [];
  const retrieveScore = (retrieveResult.data as { scores?: Record<string, number> })?.scores || {};

  // Step 2: Assemble
  const assembleBody: Record<string, unknown> = { noteIds, query };
  const assembleResult = await handleAssemble(uid, assembleBody);
  if (!assembleResult.success) {
    const completedAt = now();
    executions.set(execId, {
      execId, userId: uid, status: 'failed', pipeline: 'retrieve->assemble->reason->act',
      startedAt, completedAt,
      steps: [
        { step: 'retrieve', status: 'completed', noteIds: noteIds.slice(0, 5), timestamp: now() },
        { step: 'assemble', status: 'failed', error: assembleResult.error || 'Unknown error', timestamp: now() },
      ],
      result: undefined,
    });
    return { success: false, error: `Pipeline failed at assemble: ${assembleResult.error}` };
  }

  const assembledText = (assembleResult.data as { assembledText?: string })?.assembledText || '';
  const assembledFrom = (assembleResult.data as { assembledFrom?: string[] })?.assembledFrom || [];
  const tokenEstimate = (assembleResult.data as { tokenEstimate?: number })?.tokenEstimate || 0;

  // Step 3: Reason (invoke Gemini via handleReason)
  const reasonBody: Record<string, unknown> = {
    query,
    assembledContext: assembledText,
    agentId: 'F01', // Default to PM Assistant for synthesis
    intent: options?.intent,
  };
  const reasonResult = await handleReason(uid, reasonBody);
  if (!reasonResult.success) {
    const completedAt = now();
    executions.set(execId, {
      execId, userId: uid, status: 'failed', pipeline: 'retrieve->assemble->reason->act',
      startedAt, completedAt,
      steps: [
        { step: 'retrieve', status: 'completed', noteIds: noteIds.slice(0, 5), timestamp: now() },
        { step: 'assemble', status: 'completed', noteIds: assembledFrom.slice(0, 5), timestamp: now() },
        { step: 'reason', status: 'failed', error: reasonResult.error || 'Unknown error', timestamp: now() },
      ],
      result: undefined,
    });
    return { success: false, error: `Pipeline failed at reason: ${reasonResult.error}` };
  }

  const output = (reasonResult.data as { output?: string })?.output || '';
  const inputTokens = (reasonResult.data as { inputTokens?: number })?.inputTokens || 0;
  const outputTokens = (reasonResult.data as { outputTokens?: number })?.outputTokens || 0;
  const runId = (reasonResult.data as { runId?: string })?.runId || '';

  // Step 4: Execute any resulting actions (notes, links, etc.)
  const actions = parseAgentOutputForActions(output, uid);
  const actionResults: unknown[] = [];
  for (const action of actions) {
    const result = await executeAct(uid, action);
    actionResults.push(result);
  }

  const completedAt = now();
  const durationMs = completedAt - startedAt;

  const pipelineResult: PipelineResult = {
    query,
    filter: filter || undefined,
    steps: [
      { step: 'retrieve', status: 'completed', noteIds: noteIds.slice(0, 5), timestamp: now() },
      { step: 'assemble', status: 'completed', noteIds: assembledFrom.slice(0, 5), timestamp: now() },
      { step: 'reason', status: 'completed', timestamp: now() },
      { step: 'act', status: actions.length > 0 ? 'completed' : 'skipped', timestamp: now() },
    ],
    finalOutput: output,
    actionsExecuted: actionResults,
    tokensUsed: outputTokens,
    retrievedNoteCount: noteIds.length,
    assembledContextSize: assembledText.length,
  };

  const record: ExecutionRecord = {
    execId,
    userId: uid,
    status: 'completed',
    pipeline: 'retrieve->assemble->reason->act',
    startedAt,
    completedAt,
    steps: pipelineResult.steps,
    result: pipelineResult,
  };

  executions.set(execId, record);
  recentRuns.unshift({
    id: runId || execId,
    agentId: 'F01',
    agentName: 'PM Assistant',
    modelTier: 'flash',
    inputTokens,
    outputTokens,
    contextNoteIds: noteIds,
    intent: (query || '').slice(0, 100),
    outcome: output.slice(0, 500),
    decisionGateTriggered: false,
    timestamp: now(),
    userId: uid,
  });

  console.log(`[Orchestrate] UID=${uid} exec=${execId} completed in ${durationMs}ms, ${noteIds.length} notes retrieved, ${outputTokens} tokens output`);

  return {
    success: true,
    data: {
      execId,
      status: 'completed' as const,
      query,
      filter: filter || undefined,
      pipeline: 'retrieve->assemble->reason->act',
      finalOutput: output,
      actionsExecuted: actionResults,
      stepsSummary: {
        retrieve: { noteIds: noteIds.slice(0, 10), count: noteIds.length },
        assemble: { noteIds: assembledFrom.slice(0, 10), contextSize: assembledText.length },
        reason: { outputLength: output.length, tokens: outputTokens },
        act: { count: actions.length, results: actionResults },
      },
      timestamps: { startedAt, completedAt, durationMs },
    },
  };
}

async function getExecutionHistory(userId: string, body: Record<string, unknown>): Promise<{ success: boolean; error?: string; data?: unknown }> {
  const uid = userId;
  const { limit = 50, status: filterStatus } = body || {};
  const maxLimit = Math.min(Math.max(Math.floor(limit as number) || 50, 1), 200);
  const results: ExecutionRecord[] = [];

  for (const [execId, record] of executions) {
    if (record.userId !== uid) continue;
    if (filterStatus && record.status !== filterStatus) continue;
    results.push(record);
  }

  results.sort((a, b) => b.startedAt - a.startedAt);
  const sliced = results.slice(0, maxLimit);

  const byStatus: Record<string, number> = {};
  for (const r of results) {
    byStatus[r.status] = (byStatus[r.status] || 0) + 1;
  }

  return {
    success: true,
    data: {
      executions: sliced.map(r => ({
        execId: r.execId,
        status: r.status,
        pipeline: r.pipeline,
        startedAt: r.startedAt,
        completedAt: r.completedAt || null,
        durationMs: r.completedAt ? r.completedAt - r.startedAt : null,
        steps: r.steps,
        result: r.result ? {
          query: r.result.query,
          finalOutputLength: r.result.finalOutput.length,
          actionsExecuted: r.result.actionsExecuted.length,
          retrievedNoteCount: r.result.retrievedNoteCount,
          tokensUsed: r.result.tokensUsed,
        } : null,
      })),
      summary: {
        total: results.length,
        byStatus,
      },
    },
  };
}

async function cancelExecution(userId: string, body: Record<string, unknown>): Promise<{ success: boolean; error?: string; data?: unknown }> {
  const uid = userId;
  const { execId } = body || {};

  if (!execId || typeof execId !== 'string') {
    return { success: false, error: 'Missing or invalid "execId".' };
  }

  const record = executions.get(execId);
  if (!record) {
    return { success: false, error: `Execution not found: ${execId}` };
  }
  if (record.userId !== uid) {
    return { success: false, error: 'Unauthorized: this execution does not belong to you.' };
  }
  if (record.status !== 'queued' && record.status !== 'running') {
    return { success: false, error: `Cannot cancel execution in status "${record.status}".` };
  }

  record.status = 'cancelled';
  record.cancelledAt = now();

  console.log(`[Cancel] UID=${uid} cancelled exec=${execId} (was ${record.status})`);

  return {
    success: true,
    data: {
      execId,
      previousStatus: record.status,
      newStatus: 'cancelled' as const,
      cancelledAt: record.cancelledAt,
    },
  };
}

async function executeInteractiveQuery(userId: string, body: Record<string, unknown>): Promise<{ success: boolean; error?: string; data?: unknown }> {
  const uid = userId;
  const { text, contextId } = body || {};

  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return { success: false, error: 'Missing or empty "text" field.' };
  }

  const query = text.trim();
  const execId = generateExecId();
  const startedAt = now();

  console.log(`[Execute] UID=${uid} exec=${execId} query=${query.slice(0, 80)}`);

  // Quick intent classification (lightweight, no cross-agent call)
  const ql = query.toLowerCase();
  let intent = 'general';
  let agentId = 'F01';
  if (ql.includes('user story') || ql.includes('requirement') || ql.includes('acceptance')) {
    intent = 'requirements-drafting'; agentId = 'F02';
  } else if (ql.includes('architect') || ql.includes('design') || ql.includes('approach') || ql.includes('pattern')) {
    intent = 'technical-design'; agentId = 'F03';
  } else if (ql.includes('release') || ql.includes('launch') || ql.includes('deploy')) {
    intent = 'release-planning'; agentId = 'F05';
  } else if (ql.includes('sprint') || ql.includes('backlog') || ql.includes('prioritize') || ql.includes('rice')) {
    intent = 'prioritization'; agentId = 'F09';
  } else if (ql.includes('risk')) {
    intent = 'risk-analysis'; agentId = 'F07';
  } else if (ql.includes('metric') || ql.includes('kpi') || ql.includes('measure')) {
    intent = 'metrics-definition'; agentId = 'F06';
  } else if (ql.includes('research') || ql.includes('discover') || ql.includes('validate')) {
    intent = 'discovery'; agentId = 'F10';
  } else if (ql.includes('note') || ql.includes('knowledge') || ql.includes('index')) {
    intent = 'knowledge-curation'; agentId = 'F11';
  }

  // Retrieve relevant notes
  const retrieveBody: Record<string, unknown> = { query, filters: {}, limit: 10 };
  const retrieveResult = await handleRetrieve(uid, retrieveBody);
  const noteIds = (retrieveResult.data as { noteIds?: string[] })?.noteIds || [];
  const assembledText = (retrieveResult.data as { assembledText?: string })?.assembledText || '';

  // Assemble context
  const assembleBody: Record<string, unknown> = { noteIds, query };
  const assembleResult = await handleAssemble(uid, assembleBody);
  const fullContext = (assembleResult.data as { assembledText?: string })?.assembledText || assembledText;
  const assembledFrom = (assembleResult.data as { assembledFrom?: string[] })?.assembledFrom || [];

  // Reason with Gemini
  const reasonBody: Record<string, unknown> = {
    query,
    assembledContext: fullContext,
    agentId,
    intent,
  };
  const reasonResult = await handleReason(uid, reasonBody);
  if (!reasonResult.success) {
    const completedAt = now();
    executions.set(execId, {
      execId, userId: uid, status: 'failed', pipeline: 'retrieve->assemble->reason->act',
      startedAt, completedAt,
      steps: [
        { step: 'retrieve', status: 'completed', noteIds: noteIds.slice(0, 5), timestamp: now() },
        { step: 'assemble', status: 'completed', noteIds: assembledFrom.slice(0, 5), timestamp: now() },
        { step: 'reason', status: 'failed', error: reasonResult.error || 'Unknown error', timestamp: now() },
      ],
      result: undefined,
    });
    return { success: false, error: `Reason failed: ${reasonResult.error}` };
  }

  const output = (reasonResult.data as { output?: string })?.output || '';
  const inputTokens = (reasonResult.data as { inputTokens?: number })?.inputTokens || 0;
  const outputTokens = (reasonResult.data as { outputTokens?: number })?.outputTokens || 0;
  const runId = (reasonResult.data as { runId?: string })?.runId || execId;

  // Parse and execute any actions
  const actions = parseAgentOutputForActions(output, uid);
  const actionResults: unknown[] = [];
  for (const action of actions) {
    const result = await executeAct(uid, action);
    actionResults.push(result);
  }

  const completedAt = now();
  const durationMs = completedAt - startedAt;
  const agent = AGENTS[agentId];

  // Record in execution store
  const record: ExecutionRecord = {
    execId,
    userId: uid,
    status: 'completed',
    pipeline: 'retrieve->assemble->reason->act',
    startedAt,
    completedAt,
    steps: [
      { step: 'retrieve', status: 'completed', noteIds: noteIds.slice(0, 5), timestamp: now() },
      { step: 'assemble', status: 'completed', noteIds: assembledFrom.slice(0, 5), timestamp: now() },
      { step: 'reason', status: 'completed', timestamp: now() },
      { step: 'act', status: actions.length > 0 ? 'completed' : 'skipped', timestamp: now() },
    ],
    result: {
      query,
      filter: undefined,
      steps: [],
      finalOutput: output,
      actionsExecuted: actionResults,
      tokensUsed: outputTokens,
      retrievedNoteCount: noteIds.length,
      assembledContextSize: fullContext.length,
    },
  };
  executions.set(execId, record);

  // Record in recent runs
  recentRuns.unshift({
    id: runId,
    agentId,
    agentName: agent?.name || 'Unknown Agent',
    modelTier: agent?.modelTier || 'flash',
    inputTokens,
    outputTokens,
    contextNoteIds: noteIds,
    intent,
    outcome: output.slice(0, 500),
    decisionGateTriggered: agent?.requiresGate || false,
    timestamp: now(),
    userId: uid,
  });

  console.log(`[Execute] UID=${uid} exec=${execId} intent=${intent} agent=${agentId} completed in ${durationMs}ms`);

  return {
    success: true,
    data: {
      runId,
      agentId,
      agentName: agent?.name || 'Unknown Agent',
      intent,
      inputTokens,
      outputTokens,
      output,
      requiresGate: agent?.requiresGate || false,
      contextNoteIds: noteIds,
      assembledContextSize: fullContext.length,
      actionsExecuted: actionResults,
      timestamps: { startedAt, completedAt, durationMs },
      budget: {
        sessionUsed: sessionBudget.sessionUsed,
        sessionRemaining: sessionBudget.sessionBudget - sessionBudget.sessionUsed,
        weeklyUsed: sessionBudget.weeklyUsed,
        weeklyRemaining: sessionBudget.weeklyBudget - sessionBudget.weeklyUsed,
      },
    },
  };
}

export {
  executions,
  generateExecId,
  now,
  orchestratePipeline,
  getExecutionHistory,
  cancelExecution,
  executeInteractiveQuery,
};
