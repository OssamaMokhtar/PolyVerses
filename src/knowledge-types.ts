/**
 * PolyVerses Knowledge Types — data structures for the three-layer pipeline.
 *
 * Layer 1 (Capture & Index)   → Note, NoteMetadata, IndexEntry, Entity, Relationship
 * Layer 2 (Retrieve & Assemble) → RetrievalStrategies, AssembledContext
 * Layer 3 (Reason & Act)      → AgentRun, AgentBudget, DecisionGate, DistillationRun
 */

// ─── Capture & Index ────────────────────────────────────────────────

/** A single captured note — the atomic unit of the second brain */
export interface Note {
  id: string;
  userId: string;
  text: string;                    // verbatim text, preserved as-is
  summaries: NoteSummary[];        // progressive summarization levels
  entities: EntityReference[];     // extracted entities
  relationships: RelationshipRef[]; // links to other notes
  metadata: NoteMetadata;
  capturedAt: string;              // ISO timestamp
  source: NoteSource;
}

/** Progressive summarization levels per Tiago Forte PARA method */
export interface NoteSummary {
  level: 1 | 2 | 3 | 4;
  /** Level 1 — verbatim excerpt. Level 2 — gist in own words. Level 3 — summary. Level 4 — principle. */
  text: string;
  createdBy: string;               // agent ID or 'manual'
  createdAt: string;
}

/** Where the note came from */
export type NoteSource =
  | { kind: 'manual'; context: string }
  | { kind: 'agentCapture'; agent: string; trigger: string }
  | { kind: 'extracted'; parentNoteId: string; extractAgent: string }
  | { kind: 'imported'; origin: string };

/** Searchable metadata attached to every note */
export interface NoteMetadata {
  title: string;
  tags: string[];                  // user-assigned tags
  entities: string[];              // named entities (people, projects, products)
  para: 'project' | 'area' | 'resource' | 'archive';  // PARA placement
  projectName?: string;            // 프로젝트 anchor if para=project
  areaName?: string;               // 관심사 anchor if para=area
  resourceName?: string;           // 자원 anchor if para=resource
  archiveReason?: string;          // why archived if para=archive
  capturedBy: string;              // agent or user who captured
  language: string;                // BCP-47 tag, default 'ko'
  sensitivity: 'personal' | 'internal' | 'public';
}

/** An extracted entity (person, project, product, concept) */
export interface Entity {
  id: string;
  name: string;
  type: 'person' | 'project' | 'product' | 'company' | 'concept' | 'skill' | 'tool';
  aliases: string[];               // alternate names / spellings
  description: string;             // short descriptor
  firstSeenInNote: string;         // note ID where first extracted
  lastSeenInNote: string;
  notesCount: number;              // how many notes reference this entity
}

/** A typed relationship between two notes */
export interface Relationship {
  id: string;
  sourceNoteId: string;
  targetNoteId: string;
  kind: 'references' | 'contradicts' | 'buildsOn' | 'isPartOf' | 'summarizes' | 'derivesFrom';
  strength: number;                // 0–1, computed from co-occurrence + explicit link
  labeledBy: string;               // agent or user
  labeledAt: string;
}

// ─── Index ──────────────────────────────────────────────────────────

/** An entry in the search index — what retrieval queries against */
export interface IndexEntry {
  id: string;                      // note ID
  userId: string;
  text: string;                    // searchable text (title + all summary levels + entities)
  embedding: number[];             // vector embedding for semantic search
  metadata: NoteMetadata;
  entities: EntityReference[];
  indexedAt: string;
  /** Manual boost — user can pin important notes to surface higher */
  boost: number;                   // 1.0 default, >1.0 to promote
}

export interface EntityReference {
  entityId: string;
  entityName: string;
  entityType: Entity['type'];
}

// ─── Retrieve & Assemble ────────────────────────────────────────────

/** Which retrieval strategy to use for a query */
export type RetrievalStrategy =
  | { kind: 'semantic'; query: string; topK: number; filter?: SearchFilter }
  | { kind: 'keyword'; query: string; topK: number; defaultField?: string }
  | { kind: 'hybrid'; semantic: { query: string; topK: number }; keyword: { query: string; topK: number }; rrfK?: number }
  | { kind: 'entity'; entityId: string; traversalDepth?: number }
  | { kind: 'fullText'; noteId: string }
  | { kind: 'project';
  } | { kind: 'project'; projectName: string; includeArchived?: boolean }
  | { kind: 'entity'; entityId: string; traversalDepth?: number }
  | { kind: 'recent'; userId: string; limit: number; withinLastDays?: number };

/** Filters applied to retrieval */
export interface SearchFilter {
  tags?: string[];
  para?: NoteMetadata['para'];
  projectName?: string;
  entityIds?: string[];
  dateAfter?: string;
  dateBefore?: string;
  excludeArchive?: boolean;
  sensitivity?: NoteMetadata['sensitivity'];
}

/** The assembled context bundle sent to a specialist agent */
export interface AssembledContext {
  query: string;
  strategy: RetrievalStrategy;
  retrieved: RetrievedNote[];
  /** Per-strategy breakdown for transparency */
  retrievalBreakdown: RetrievalBreakdown;
  assembledAt: string;
  assemblyAgent: string;
}

export interface RetrievedNote {
  note: Note;
  score: number;                   // relevance score, higher = more relevant
  strategyMatch: string;           // which strategy matched and why
  rank: number;
}

export interface RetrievalBreakdown {
  semantic?: { retrieved: number; avgScore: number };
  keyword?: { retrieved: number; avgScore: number };
  entity?: { retrieved: number; avgScore: number };
  fullText?: { retrieved: number };
  project?: { retrieved: number };
  recent?: { retrieved: number };
}

// ─── Reason & Act ───────────────────────────────────────────────────

/** A single agent execution in the mesh */
export interface AgentRun {
  id: string;
  agentId: string;                 // F00–F11
  agentName: string;
  task: string;                    // what the agent was asked to do
  modelTier: ModelTier;
  inputContextId?: string;         // assembled context ID if retrieval was used
  status: 'queued' | 'running' | 'completed' | 'failed' | 'blocked';
  startedAt: string;
  finishedAt?: string;
  output: AgentOutput;
  /** Tokens consumed by this run (approximate) */
  tokensUsed: number;
  /** Budget consumed from agent's monthly allowance */
  budgetUsed: number;
  /** Whether output passed through human gate */
  gateStatus: 'auto' | 'pending' | 'approved' | 'rejected' | 'escalated';
  gateDecision?: string;           // free-text reason from human
  gateDecisionAt?: string;
  /** References to notes this run created or modified */
  noteReferences: string[];
  /** Trace for observability — what the agent did step by step */
  trace: AgentTraceEvent[];
}

export interface AgentOutput {
  text: string;                    // primary output text
  proposedActions: ProposedAction[];
  /** Notes this agent wants to create/modify */
  noteChanges: NoteChange[];
  /** Updated entities or relationships discovered */
  entityChanges: EntityChange[];
  /** Relation to other agent runs in this mesh execution */
  dependsOnRunIds: string[];
  /** Confidence / quality signals */
  confidence: number;              // 0–1
  qualitySignals: QualitySignal[];
}

export interface ProposedAction {
  id: string;
  action: 'createNote' | 'updateNote' | 'createEntity' | 'updateEntity' | 'createRelationship' | 'sendNotification' | 'scheduleDistillation' | 'custom';
  target?: string;                 // note ID, entity ID, etc.
  description: string;             // human-readable what/why
  data?: Record<string, unknown>;  // payload for the action
}

export interface NoteChange {
  kind: 'create' | 'update' | 'archive' | 'delete';
  note: Partial<Note>;
  reason: string;
}

export interface EntityChange {
  kind: 'create' | 'update' | 'merge' | 'delete';
  entity: Partial<Entity>;
  reason: string;
}

export interface QualitySignal {
  kind: 'relevant' | 'stale' | 'conflicting' | 'needsVerification' | 'highConfidence' | 'lowConfidence';
  note?: string;
  detail?: string;
}

export interface AgentTraceEvent {
  step: number;
  agent: string;
  action: string;                  // what was done
  detail?: string;
  timestamp: string;
}

/** Agent budget tracking */
export interface AgentBudget {
  agentId: string;
  tier: ModelTier;
  monthlyAllowanceTokens: number;
  monthlyUsedTokens: number;
  sessionUsedTokens: number;
  /** When the agent should stop (budget exhausted) */
  hardStopRemainingTokens: number;
  /** Soft warning threshold (percentage of monthly allowance remaining) */
  warningThresholdPercent: number;
  lastReset: string;               // month start
}

/** A decision gate — human approval required before agent actions are committed */
export interface DecisionGate {
  id: string;
  runId: string;
  agentId: string;
  gateType: 'actionApproval' | 'noteReview' | 'entityReview' | 'escalation';
  status: 'pending' | 'approved' | 'rejected' | 'escalated' | 'dismissed';
  requestedAt: string;
  decidedAt?: string;
  decidedBy?: string;
  decisionReason?: string;
  /** The proposed actions awaiting approval */
  proposedActions: ProposedAction[];
  /** Follow-up actions if rejected */
  rejectNextSteps?: string[];
}

// ─── Distillation ───────────────────────────────────────────────────

/** A distillation run — synthesizes captured notes into higher-level outputs */
export interface DistillationRun {
  id: string;
  userId: string;
  status: 'scheduled' | 'running' | 'completed' | 'failed' | 'partial';
  scheduledAt: string;
  startedAt?: string;
  finishedAt?: string;
  /** What scope this distillation covered */
  scope: DistillationScope;
  /** Which agents contributed */
  agentsUsed: string[];
  inputs: DistillationInput;
  outputs: DistillationOutput;
  /** Whether this was a full rebuild or incremental update */
  mode: 'full' | 'incremental';
  /** Notes processed in this run */
  notesProcessed: number;
  notesSkipped: number;            // already up-to-date
}

export interface DistillationScope {
  /** Which notes to include */
  include: DistillationFilter;
  /** Time range for incremental distillation */
  since?: string;
  until?: string;
}

export interface DistillationFilter {
  userId?: string;
  projectName?: string;
  areaName?: string;
  tags?: string[];
  entityIds?: string[];
  sensitivity?: NoteMetadata['sensitivity'];
  /** Only notes with at least this many summary levels */
  minSummaryLevels?: number;
  archived?: boolean;
}

export interface DistillationInput {
  notes: Note[];
  /** Pre-assembled context if retrieval was used */
  assembledContext?: AssembledContext;
  userPrompt?: string;             // user's distillation directive
}

export interface DistillationOutput {
  /** Output format — what the user asked for */
  format: DistillationFormat;
  /** The synthesized output */
  result: string | Record<string, unknown>;
  /** References to source notes */
  sourceNoteIds: string[];
  /** Notes that were created as a side effect */
  notesCreated: string[];
  /** Quality flag — is this output reliable? */
  quality: 'high' | 'medium' | 'low';
  /** Follow-up recommendations */
  followUps: string[];
}

export type DistillationFormat =
  | { kind: 'summary'; title: string; level: 1 | 2 | 3 }
  | { kind: 'actionItems'; projectName: string }
  | { kind: 'sprintPlan'; projectName: string; sprintGoal: string }
  | { kind: 'decisionBrief'; title: string; audience: string }
  | { kind: 'prdSection'; section: string; projectName: string }
  | { kind: 'statusReport'; projectName: string; period: string }
  | { kind: 'brainDump'; topic: string }
  | { kind: 'entitySummary'; entityId: string }
  | { kind: 'relationshipMap'; centerNoteId: string }
  | { kind: 'custom'; prompt: string };

// ─── Shared types ───────────────────────────────────────────────────

/** Model tier — determines cost and capability */
export type ModelTier = 'flash' | 'flash-thinking' | 'pro';

/** A work request submitted to the orchestration layer */
export interface WorkRequest {
  userId: string;
  query: string;
  context?: string;                // optional extra context
  /** Which agents to use — undefined means auto-select from mesh */
  agentIds?: string[];
  /** Whether to use retrieval + assembly before reasoning */
  useRetrieval?: boolean;
  /** Retrieval strategy if useRetrieval is true */
  retrievalStrategy?: RetrievalStrategy;
  /** Budget cap for this request (total across all agents) */
  budgetCapTokens?: number;
  /** Whether human gate is required for any proposed actions */
  requireGate?: boolean;
  /** Callback URL for async work (optional) */
  callbackUrl?: string;
  /** Idempotency key — deduplicate duplicate submissions */
  idempotencyKey?: string;
  /** Source of the request (UI, API, scheduled, etc.) */
  source: 'ui' | 'api' | 'scheduled' | 'callback';
}

/** A work response — either immediate or async handle */
export interface WorkResponse {
  requestId: string;
  status: 'accepted' | 'queued' | 'running' | 'completed' | 'failed';
  /** Immediate result if completed synchronously */
  result?: WorkResult;
  /** Error if failed */
  error?: string;
  /** Async handle if queued */
  statusUrl?: string;
  /** Estimated wait time if queued (seconds) */
  etaSeconds?: number;
}

export interface WorkResult {
  /** Which agents ran */
  agentRuns: AgentRun[];
  /** Final assembled output */
  output: string;
  /** Proposed actions requiring gate (if any) */
  pendingActions: ProposedAction[];
  /** Notes created/modified */
  notesChanged: string[];
  /** Entities created/modified */
  entitiesChanged: string[];
  /** Total budget consumed */
  totalTokensUsed: number;
  /** Whether human gate is required */
  gateRequired: boolean;
  gate?: DecisionGate;
  /** Trace of the entire mesh execution */
  trace: AgentTraceEvent[];
}

/** Search result returned to the UI */
export interface SearchResult {
  query: string;
  strategy: RetrievalStrategy;
  results: RetrievedNote[];
  total: number;
  elapsedMs: number;
  breakdown: RetrievalBreakdown;
}

/** API error response */
export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}
