import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Play, ShieldAlert, Cpu, CheckCircle2, AlertCircle, Hourglass, 
  HelpCircle, Sparkles, RefreshCw, ChevronRight, Lock, Save, Edit, Ban, RotateCcw, Terminal,
  Activity, Zap, Clock, ShieldCheck, X, AlertTriangle
} from 'lucide-react';
import { Agent, WorkflowStep, HumanGate, ConflictResolution } from '../types';
import { AgentNetworkDiagram } from './AgentNetworkDiagram';
import { RechartsHeatmap } from './RechartsHeatmap';
import { auth, db } from '../firebase';
import { collection, query, orderBy, onSnapshot, doc, deleteDoc } from 'firebase/firestore';

interface SavedDocument {
  id: string;
  userId: string;
  title: string;
  prompt: string;
  agentType: string;
  content: string;
  createdAt: any;
}

interface OrchestrationConsoleProps {
  productName: string;
  productDescription: string;
  activeRole: string;
}

interface HeatmapAgent {
  id: string;
  name: string;
  role: string;
  load: number;         // 0 to 100
  successRate: number;  // 80 to 100
  latency: number;      // ms
}

const HEATMAP_AGENTS_INITIAL: HeatmapAgent[] = [
  { id: 'A01', name: 'Rollback Orchestrator', role: 'SRE Monitor', load: 12, successRate: 100, latency: 85 },
  { id: 'A02', name: 'Execution Monitor', role: 'SRE Monitor', load: 34, successRate: 99.8, latency: 120 },
  { id: 'A03', name: 'Opportunity Planner', role: 'Strategic Ranker', load: 20, successRate: 100, latency: 450 },
  { id: 'A04', name: 'Compliance Auditor', role: 'Legal Scanner', load: 45, successRate: 99.1, latency: 310 },
  { id: 'A05', name: 'PRD Creator', role: 'Requirement Architect', load: 15, successRate: 100, latency: 950 },
  { id: 'A06', name: 'Beta Program Agent', role: 'Signal Harvester', load: 28, successRate: 98.6, latency: 210 },
  { id: 'A07', name: 'Signal Harvester', role: 'Insight Collector', load: 8, successRate: 100, latency: 130 },
  { id: 'A08', name: 'PII Key Scrubber', role: 'Security Guard', load: 55, successRate: 99.9, latency: 75 },
  { id: 'A09', name: 'Consent Gatekeeper', role: 'Compliance Officer', load: 22, successRate: 100, latency: 60 },
  { id: 'A10', name: 'Vector Store Syncer', role: 'Memory Broker', load: 68, successRate: 99.4, latency: 180 },
  { id: 'A11', name: 'Model Routing Agent', role: 'AI Broker', load: 82, successRate: 98.1, latency: 140 },
  { id: 'A12', name: 'SLA Target Validator', role: 'Testing Engineer', load: 18, successRate: 100, latency: 95 },
  { id: 'A13', name: 'Relational Schema Builder', role: 'Structure Architect', load: 30, successRate: 99.5, latency: 620 },
  { id: 'A14', name: 'API Gateway Broker', role: 'Proxy Server', load: 50, successRate: 100, latency: 50 },
  { id: 'A15', name: 'OAuth Connection Proxy', role: 'Identity Provider', load: 14, successRate: 97.4, latency: 480 },
  { id: 'A16', name: 'Thread Limit Scoper', role: 'SRE Monitor', load: 40, successRate: 100, latency: 110 },
  { id: 'A17', name: 'Performance Profiler', role: 'Diagnostics Engine', load: 60, successRate: 99.2, latency: 340 },
  { id: 'A18', name: 'Security Threat Auditor', role: 'SecOps Shield', load: 25, successRate: 100, latency: 160 },
  { id: 'A19', name: 'Memory Limit Guard', role: 'Container Cop', load: 48, successRate: 100, latency: 90 },
  { id: 'A20', name: 'Container Scale Master', role: 'Cloud Scaling Advisor', load: 62, successRate: 99.0, latency: 280 },
  { id: 'A21', name: 'DNS Route53 Monitor', role: 'Network Auditor', load: 10, successRate: 100, latency: 70 },
  { id: 'A22', name: 'Exception Alert Dispatcher', role: 'SRE Communications', load: 5, successRate: 100, latency: 100 },
  { id: 'A23', name: 'Consensus Engine Agent', role: 'Decentralized Voter', load: 74, successRate: 98.9, latency: 540 }
];

const AGENT_INTELEMENTS_DETAILS: Record<string, { tools: string[]; purpose: string }> = {
  A01: { tools: ['OTel Stream Analyzer', 'EKS Kill Switch API', 'Prometheus SDK'], purpose: 'Automates rollback triggers against live telemetry SLI exceptions.' },
  A02: { tools: ['K8s Metrics API', 'Route53 Link Healthcheck', 'CloudWatch DB'], purpose: 'Traces runtime limits, CPU pressure, and system connection gates.' },
  A03: { tools: ['Neo4j Relation Mapper', 'RICE Formula Matrix', 'GCP Cost API'], purpose: 'Calculates development scoring models to structure release tracks.' },
  A04: { tools: ['Regex Key Scrubber', 'Data Purge Assessor', 'Compliance Rule DB'], purpose: 'Validates workspace specifications for European compliance rules.' },
  A05: { tools: ['Gemini 2.5 Flash SDK', 'SLA Target Formatter'], purpose: 'Drafts functional PRDs using deep model prompt chains.' },
  A06: { tools: ['Slack Connector', 'Release Telemetry Sync'], purpose: 'Pushes features to sandbox environments and logs telemetry ratios.' },
  A07: { tools: ['Jira OAuth Sync', 'Text Summarizer Service'], purpose: 'Monitors external signals and alerts squad members of high priorities.' },
  A08: { tools: ['KMS Keyring Decryptor', 'SHA-256 Validator'], purpose: 'Scrubs raw credentials inside active runtime queues or DB indexes.' },
  A09: { tools: ['Auth0 SSO Gateway', 'JWT Scoper'], purpose: 'Enforces permissions maps across CPO, PMs, and Auditor accounts.' },
  A10: { tools: ['Neo4j Graph Database', 'Pinecone Vector Index'], purpose: 'Coordinates memory nodes during prompt synthesis sessions.' },
  A11: { tools: ['Gemini Model Hub', 'Semantic Router'], purpose: 'Switches system loads between small and ultra-deep expert pipelines.' },
  A12: { tools: ['Web Vitals API', 'Sentry Stream Listener'], purpose: 'Confirms technical SLAs before launching final pipeline phases.' },
  A13: { tools: ['Drizzle Schema Translator', 'Prisma DB Engine'], purpose: 'Translates functional maps to secure database blueprints.' },
  A14: { tools: ['Nginx Proxy Layer', 'Redis Throttle Manager'], purpose: 'Balances internal API requests and prevents thread starvation.' },
  A15: { tools: ['OAuth2 PKCE Provider', 'Jira JWT Exchange'], purpose: 'Authenticates external workspace applications securely.' },
  A16: { tools: ['K8s Thread Assessor', 'CPU Scheduler'], purpose: 'Tracks runtime threads across multi-agent workspace nodes.' },
  A17: { tools: ['V8 Profiler Core', 'OpenTelemetry Trace'], purpose: 'Audits memory retention or system leakage during pipeline executions.' },
  A18: { tools: ['OAuth Scope Scanner', 'CVE Patch Inspector'], purpose: 'Validates packages and connection pools against threat indices.' },
  A19: { tools: ['Docker Cgroups Limits', 'K8s Pods Monitor'], purpose: 'Enforces extreme limits and terminates deadlocked routines.' },
  A20: { tools: ['AWS AutoScaling API', 'GKE Horizontal Autoscaler'], purpose: 'Spawns more nodes into active lanes when high priority is selected.' },
  A21: { tools: ['Route53 DNS API', 'Cloudflare Proxy Sync'], purpose: 'Traces network resolutions and manages traffic gates.' },
  A22: { tools: ['PagerDuty Router', 'Slack Alert Hook'], purpose: 'Flags heavy issues to humans when SRE metrics break limits.' },
  A23: { tools: ['Raft Cluster Controller', 'Neo4j Lock Matrix'], purpose: 'Syncs consensus opinions when priority calculations diverge.' },
  CORE: { tools: ['PolyVerses Kernel', 'gRPC Router Mesh'], purpose: 'Consolidates live telemetry and controls all 23 autonomous routines.' }
};

const INITIAL_AGENT_LOGS: Record<string, string[]> = {
  A01: [
    "[18:02:10] [A01-INFO] Initializing OTel stream socket listener on segment #94",
    "[18:02:11] [A01-INFO] Querying live telemetry parameters via Grafana agent endpoints",
    "[18:02:13] [A01-WARN] SLA budget drift detected in downstream API loadbalancer. Drift: +11.4ms",
    "[18:02:15] [A01-SUCCESS] Rollback triggers validated. System status in healthy boundaries."
  ],
  A02: [
    "[18:02:00] [A02-INFO] Subscribing to Kubernetes Core Metrics API on cluster region west-1a",
    "[18:02:02] [A02-INFO] CPU usage telemetry successfully parsed. Mean workload: 34.2%",
    "[18:02:10] [A02-INFO] Pinging Route53 check nodes. Target latency verified under 150ms"
  ],
  A03: [
    "[18:01:45] [A03-INFO] Connecting to Strategic planning database Neo4j workspace",
    "[18:01:48] [A03-INFO] Fetching RICE scores and product priorities",
    "[18:02:00] [A03-SUCCESS] Prioritization matrix finalized and saved. 14 items updated."
  ],
  A04: [
    "[18:01:20] [A04-INFO] Triggering compliance audit loop over PRD code snippets",
    "[18:01:25] [A04-WARN] CCPA section 4 scanner found 1 potential unencrypted metadata tag",
    "[18:01:30] [A04-INFO] Validating with regulatory rule lists from Dec 2025 data standards",
    "[18:01:50] [A04-SUCCESS] Finished workspace analysis with zero critical roadblocks."
  ],
  A05: [
    "[18:00:10] [A05-INFO] Awakening PRD Creator logic frame",
    "[18:00:15] [A05-INFO] Invoking Gemini model endpoints for deep requirements compilation",
    "[18:00:45] [A05-SUCCESS] Product requirements document successfully cached to static repository"
  ],
  A06: [
    "[18:02:11] [A06-INFO] Scanning open beta developer workspaces program telemetry",
    "[18:02:15] [A06-INFO] Synchronized 14 active sandbox configurations",
    "[18:02:22] [A06-SUCCESS] Pushed core release track updates to Slack webhook client"
  ],
  A07: [
    "[18:02:05] [A07-INFO] Triggering scheduled scraping procedures on developer support channel",
    "[18:02:12] [A07-SUCCESS] Extracted 3 critical Jira priority issues and logged summary metrics"
  ],
  A08: [
    "[18:01:59] [A08-INFO] Listening on PostgreSQL active connection thread pool for credentials leak",
    "[18:02:02] [A08-INFO] PII Scrubber triggered over incoming request JSON blocks",
    "[18:02:10] [A08-SUCCESS] Checked 1,240 requests. Compliance index at strict 100.00% standard."
  ],
  A09: [
    "[18:02:14] [A09-INFO] Verifying JWT verification keys against Auth0 SSO public endpoints",
    "[18:02:18] [A09-SUCCESS] Key verification completed. Permission tree aligned."
  ],
  A10: [
    "[18:01:30] [A10-INFO] Synchronizing Drizzle database metadata structures with Pinecone instances",
    "[18:01:59] [A10-WARN] Found 3 mismatched embeddings nodes requiring local rebuilding",
    "[18:02:05] [A10-SUCCESS] Rebuilt nodes. Pinecone vectors matches 100% with relational index metadata."
  ],
  A11: [
    "[18:02:11] [A11-INFO] Directing incoming pipeline prompts to available model routes",
    "[18:02:14] [A11-INFO] Gemini router activated. Selected path: gemini-2.5-flash-large-reasoning",
    "[18:02:15] [A11-WARN] Memory budget spike detected in fallback endpoint workspace",
    "[18:02:18] [A11-SUCCESS] Load balances returned to normal range."
  ],
  A12: [
    "[18:01:50] [A12-INFO] Reading Chrome User Experience telemetry data points",
    "[18:01:55] [A12-SUCCESS] Technical SLA checks succeeded. Next validation scheduled in 300s."
  ],
  A13: [
    "[18:01:02] [A13-INFO] Parsing Drizzle ORM typescript export structures",
    "[18:01:05] [A13-INFO] Generating raw schema migration scripts",
    "[18:01:10] [A13-SUCCESS] Schema translated to target relational syntax models."
  ],
  A14: [
    "[18:02:00] [A14-INFO] Refreshing Nginx endpoint routes list",
    "[18:02:05] [A14-INFO] Validating active TLS certificate states",
    "[18:02:10] [A14-SUCCESS] Gateway status set to 100% operational."
  ],
  A15: [
    "[18:01:55] [A15-INFO] Awakening OAuth connection tunnel",
    "[18:01:57] [A15-WARN] Refreshed token expires in 120s. Initializing secure rotation keys...",
    "[18:01:59] [A15-SUCCESS] Keys rotated. Connection token validated with Google OAuth provider."
  ],
  A16: [
    "[18:02:05] [A16-INFO] Scanning thread count metrics on SRE worker machines",
    "[18:02:10] [A16-SUCCESS] Workloads evenly scheduled. No thread drift detected."
  ],
  A17: [
    "[18:02:01] [A17-INFO] Triggering performance profiling analysis over the active container process",
    "[18:02:06] [A17-SUCCESS] Heap memory analysis completed. Leakage likelihood is zero."
  ],
  A18: [
    "[18:01:45] [A18-INFO] Subscribing to CVE daily feed releases",
    "[18:01:48] [A18-INFO] Scanning imported node_modules package signatures",
    "[18:01:52] [A18-SUCCESS] Checked 382 packages. 0 vulnerabilities found."
  ],
  A19: [
    "[18:02:00] [A19-INFO] Polling Docker Cgroups active memory footprints",
    "[18:02:04] [A19-SUCCESS] No containers exceeded 80% allocation boundaries."
  ],
  A20: [
    "[18:02:05] [A20-INFO] Evaluating current network packet density",
    "[18:02:10] [A20-SUCCESS] Scaler decided to maintain the existing pool of 3 runner workers."
  ],
  A21: [
    "[18:02:11] [A21-INFO] Verifying DNS bindings in AWS Route53 records",
    "[18:02:15] [A21-SUCCESS] Heartbeats successfully recorded. Resolution speed at peak."
  ],
  A22: [
    "[18:02:00] [A22-INFO] Testing active connection to external SRE PagerDuty endpoint",
    "[18:02:05] [A22-SUCCESS] Verified SLA alert pipelines successfully. Endpoint live."
  ],
  A23: [
    "[18:02:08] [A23-INFO] Launching consensus engine vote round with 23 network subnodes",
    "[18:02:12] [A23-SUCCESS] Achieved consensus pool agreement on prioritizations with 98% matrix."
  ],
  CORE: [
    "[18:02:00] [SYSTEM-INFO] PolyVerses router core active on Node 3000.",
    "[18:02:05] [SYSTEM-INFO] Consolidating metrics stream from all 23 autonomous agents.",
    "[18:02:10] [SYSTEM-SUCCESS] Active pipeline check succeeded. 0 critical fail gates."
  ]
};

const INITIAL_AGENT_ERRORS: Record<string, string[]> = {
  A01: [],
  A02: [],
  A03: [],
  A04: [
    "COMPLIANCE_WARNING_04: CCM/CCPA unencrypted metadata node signature discovered inside staging package metadata."
  ],
  A05: [],
  A06: [
    "RELEASE_WARN_06: Sandbox target webhook connection periodically returning HTTP 429 Rate Exceeded."
  ],
  A07: [],
  A08: [],
  A09: [],
  A10: [],
  A11: [
    "ROUTER_SLA_SPIKE: High reasoning pathway latency exceeded 1200ms default threshold."
  ],
  A12: [],
  A13: [],
  A14: [],
  A15: [
    "OAUTH_TOKEN_ROT_WARN: Stale refresh window for Jira connector connection proxy."
  ],
  A16: [],
  A17: [],
  A18: [],
  A19: [],
  A20: [],
  A21: [],
  A22: [],
  A23: [],
  CORE: []
};

// Heatmap metric translation styling functions
const getLoadStyle = (load: number) => {
  if (load < 30) return { bg: 'bg-[#00A3FF]/10 text-[#60C5FF]', border: 'border-[#00A3FF]/20' };
  if (load < 60) return { bg: 'bg-[#00A3FF]/25 text-[#E4E4E7]', border: 'border-[#00A3FF]/40' };
  if (load < 80) return { bg: 'bg-[#00A3FF]/45 text-[#E4E4E7]', border: 'border-[#00A3FF]/60 font-semibold' };
  return { bg: 'bg-[#00A3FF] text-black font-bold', border: 'border-white/30 shadow-[0_0_12px_rgba(0,163,255,0.4)]' };
};

const getSuccessStyle = (rate: number) => {
  if (rate >= 99.5) return { bg: 'bg-[#10B981]/15 text-[#10B981]', border: 'border-[#10B981]/30' };
  if (rate >= 98.0) return { bg: 'bg-[#10B981]/30 text-[#E4E4E7]', border: 'border-[#10B981]/50' };
  if (rate >= 95.0) return { bg: 'bg-[#F59E0B]/15 text-[#F59E0B]', border: 'border-[#F59E0B]/30' };
  return { bg: 'bg-[#EF4444]/25 text-[#FF8A8A]', border: 'border-[#EF4444]/45 animate-pulse' };
};

const getLatencyStyle = (ms: number) => {
  if (ms < 150) return { bg: 'bg-[#10B981]/15 text-[#10B981]', border: 'border-[#10B981]/30' };
  if (ms < 400) return { bg: 'bg-[#00A3FF]/15 text-[#60C5FF]', border: 'border-[#00A3FF]/30' };
  if (ms < 850) return { bg: 'bg-[#F59E0B]/15 text-[#F59E0B]', border: 'border-[#F59E0B]/30' };
  return { bg: 'text-rose-400 bg-rose-500/10', border: 'border-rose-500/30' };
};

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

const INITIAL_AGENTS: Agent[] = [
  // High Priority
  { id: 'rollback_orchestrator', name: 'Rollback Orchestrator', priority: 'High', role: 'SRE Monitor', description: 'Triggers auto-rollbacks against telemetry budget exceptions.', tools: ['OTel Stream Analyzer', 'EKS Kill Switch API'], status: 'idle' },
  { id: 'execution_monitor', name: 'Execution Monitor', priority: 'High', role: 'SRE Monitor', description: 'Monitors container memory scales and thread limits.', tools: ['K8s Metrics API', 'Route53 Link Healthcheck'], status: 'idle' },
  
  // Medium Priority
  { id: 'opportunity_planning', name: 'Opportunity Planner', priority: 'Medium', role: 'Strategic Ranker', description: 'Arranges product priorities using mathematical RICE calculations.', tools: ['Neo4j Relationship Mapper', 'RICE Formula Matrix'], status: 'idle' },
  { id: 'compliance', name: 'Compliance Auditor', priority: 'Medium', role: 'Legal Scanner', description: 'Audits product features on CCPA, GDPR, and privacy terms.', tools: ['Regex Key Scrubber', 'Data Purge Assessor'], status: 'idle' },
  { id: 'prd_generation', name: 'PRD Creator', priority: 'Medium', role: 'Requirement Architect', description: 'Generates engineering-ready Product Requirements Documents.', tools: ['Gemini GPT-4o Allocator', 'SLA Target Formatter'], status: 'idle' },
  { id: 'beta_program', name: 'Beta Program Agent', priority: 'Medium', role: 'Signal Harvester', description: 'Triggers feature flags on alpha pools and monitors exceptions.', tools: ['Slack Connector', 'Release Telemetry Sync'], status: 'idle' },

  // Low Priority
  { id: 'signal_harvester', name: 'Signal Harvester', priority: 'Low', role: 'Insight Collector', description: 'Summarizes Slack threads and Jira feedback lists.', tools: ['Jira OAuth Sync', 'Text Summarizer'], status: 'idle' },
];

export function OrchestrationConsole({ productName, productDescription, activeRole }: OrchestrationConsoleProps) {
  const [agents, setAgents] = useState<Agent[]>(INITIAL_AGENTS);
  const [savedDocs, setSavedDocs] = useState<SavedDocument[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);

  useEffect(() => {
    if (!auth.currentUser) {
      setSavedDocs([]);
      return;
    }
    setLoadingDocs(true);
    const docsQuery = query(
      collection(db, 'users', auth.currentUser.uid, 'documents'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(docsQuery, (snapshot) => {
      const docsList: SavedDocument[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        docsList.push({
          id: docSnap.id,
          userId: data.userId,
          title: data.title || 'Untitled Document',
          prompt: data.prompt || '',
          agentType: data.agentType || 'prd',
          content: data.content || '',
          createdAt: data.createdAt,
        });
      });
      setSavedDocs(docsList);
      setLoadingDocs(false);
    }, (error) => {
      console.error("Failed to fetch saved documents: ", error);
      setLoadingDocs(false);
    });

    return () => unsubscribe();
  }, []);

  const handleDeleteDoc = async (docId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!auth.currentUser) return;
    if (confirm("Are you sure you want to delete this saved deliverable from Firestore?")) {
      try {
        const docRef = doc(db, 'users', auth.currentUser.uid, 'documents', docId);
        await deleteDoc(docRef);
        addLog(`[Ledger] Deleted saved document (id: ${docId})`);
      } catch (err) {
        console.error("Failed to delete document:", err);
      }
    }
  };

  const [promptInput, setPromptInput] = useState('Connect real-time Slack and Jira sync boards to trace compliance checks automatically');
  const [prioritySetting, setPrioritySetting] = useState<'High' | 'Medium' | 'Low'>('Medium');
  const [roleSetting, setRoleSetting] = useState<string>(activeRole);
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [systemLogs, setSystemLogs] = useState<string[]>([]);
  const [activeGate, setActiveGate] = useState<HumanGate | null>(null);
  const [activeConflict, setActiveConflict] = useState<ConflictResolution | null>(null);
  const [evaluationResult, setEvaluationResult] = useState<string | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  
  // Undo feature states
  const [undoHistory, setUndoHistory] = useState<{ gateId: string; priorState: any }[]>([]);
  const [showUndoBanner, setShowUndoBanner] = useState(false);

  // Editable Gate values for "Modify" action
  const [modifiedReach, setModifiedReach] = useState<number>(120000);
  const [modifiedEffort, setModifiedEffort] = useState<number>(3);
  const [modifiedGoal, setModifiedGoal] = useState<string>('');
  const [isModifyingOutput, setIsModifyingOutput] = useState(false);

  // Real-time 23 agents heatmaps state
  const [heatmapAgents, setHeatmapAgents] = useState<HeatmapAgent[]>(HEATMAP_AGENTS_INITIAL);
  const [selectedMetric, setSelectedMetric] = useState<'load' | 'successRate' | 'latency'>('load');
  const [viewMode, setViewMode] = useState<'grid' | 'topology' | 'heatmap'>('grid');
  const [hoveredAgentId, setHoveredAgentId] = useState<string | null>(null);

  // SLA Threshold limits, stress test, and warning triggers
  const [latencyLimit, setLatencyLimit] = useState<number>(500); // default limit in ms
  const [isStressActive, setIsStressActive] = useState<boolean>(false);
  const [alerts, setAlerts] = useState<TelemetryAlert[]>([]);

  // Heatmap interactive modal states
  const [selectedModalAgentId, setSelectedModalAgentId] = useState<string | null>(null);
  const [isRerunningAgent, setIsRerunningAgent] = useState(false);
  const [modalLogs, setModalLogs] = useState<Record<string, string[]>>(INITIAL_AGENT_LOGS);
  const [modalErrors, setModalErrors] = useState<Record<string, string[]>>(INITIAL_AGENT_ERRORS);

  const handleRerunModalAgent = (agentId: string) => {
    if (isRerunningAgent) return;
    setIsRerunningAgent(true);
    
    // Add real system log
    const agentName = agentId === 'CORE' ? 'PolyVerses Core' : (heatmapAgents.find(a => a.id === agentId)?.name || 'Autonomous Node');
    addLog(`[RECALIBRATION] Commenced manual cluster rerun for node ${agentId} (${agentName})`);

    setTimeout(() => {
      // Clear warnings / errors
      setModalErrors(prev => ({
        ...prev,
        [agentId]: []
      }));

      // Append success indicator statement to logs
      const timestamp = new Date().toLocaleTimeString();
      setModalLogs(prev => ({
        ...prev,
        [agentId]: [
          ...(prev[agentId] || []),
          `[${timestamp}] [RECALIBRATION-SYSTEM] Diagnostic probe completed. Realigned internal thread structures.`,
          `[${timestamp}] [RECALIBRATION-SUCCESS] Node state returned to 100% SRE compliant. All diagnostic codes cleared.`
        ]
      }));

      // Set agent metrics to an optimal state
      if (agentId !== 'CORE') {
        setHeatmapAgents(prev => 
          prev.map(agent => 
            agent.id === agentId 
              ? { ...agent, load: Math.max(10, Math.round(agent.load * 0.5)), successRate: 100, latency: Math.max(25, Math.round(agent.latency * 0.35)) }
              : agent
          )
        );
      }

      // Resolve any active threshold notifications/alerts registered on this agent segment
      setAlerts(prev => prev.map(a => a.agentId === agentId ? { ...a, resolved: true } : a));

      setIsRerunningAgent(false);
      addLog(`[COMPLIANT] Recalibrated node ${agentId} is now safe and performing correctly.`);
    }, 1800);
  };

  useEffect(() => {
    const timer = setInterval(() => {
      let newlyTriggeredLogs: string[] = [];
      let currentDiscoveredViolations: TelemetryAlert[] = [];

      setHeatmapAgents((prev) =>
        prev.map((agent) => {
          const loadDelta = (Math.random() - 0.5) * 8; // load fluctuates ±4%
          
          // Stress parameters
          const minSuccess = isStressActive ? 70 : 85;
          const maxLatency = isStressActive ? 1200 : 700;
          
          let successDelta = (Math.random() - 0.5) * 0.4; // successRate fluctuates ±0.2%
          let latencyDelta = (Math.random() - 0.5) * 30; // latency fluctuates ±15ms

          if (isStressActive && Math.random() < 0.2) {
            successDelta = -Math.random() * 4;
            latencyDelta = Math.random() * 120;
          }

          const newLoad = Math.max(5, Math.min(98, Math.round(agent.load + loadDelta)));
          const newSuccessRate = Math.max(minSuccess, Math.min(100, Number((agent.successRate + successDelta).toFixed(2))));
          const newLatency = Math.max(40, Math.min(maxLatency, Math.round(agent.latency + latencyDelta)));

          // Check if latency violates current configured threshold
          if (newLatency > latencyLimit) {
            currentDiscoveredViolations.push({
              id: `${agent.id}-latency-${Date.now()}-${Math.random()}`,
              agentId: agent.id,
              agentName: agent.name,
              metric: 'latency',
              value: newLatency,
              limit: latencyLimit,
              timestamp: new Date().toLocaleTimeString(),
              resolved: false,
            });
          }

          // Check if success SLA drops underneath standard 80% boundary
          if (newSuccessRate < 80) {
            currentDiscoveredViolations.push({
              id: `${agent.id}-success-${Date.now()}-${Math.random()}`,
              agentId: agent.id,
              agentName: agent.name,
              metric: 'successRate',
              value: newSuccessRate,
              limit: 80,
              timestamp: new Date().toLocaleTimeString(),
              resolved: false,
            });
          }

          return {
            ...agent,
            load: newLoad,
            successRate: newSuccessRate,
            latency: newLatency,
          };
        })
      );

      // Save alert indices and log to main console standard stream
      if (currentDiscoveredViolations.length > 0) {
        setAlerts((currAlerts) => {
          let nextAlerts = [...currAlerts];
          currentDiscoveredViolations.forEach((newAlert) => {
            const hasExisting = nextAlerts.some(
              (x) => x.agentId === newAlert.agentId && x.metric === newAlert.metric && !x.resolved
            );
            if (!hasExisting) {
              nextAlerts.unshift(newAlert);
              const limitMsg = newAlert.metric === 'latency'
                ? `Latency exceeded configured limit of ${newAlert.limit}ms (Recorded: ${newAlert.value}ms)`
                : `Success Rate fell below standard 80% SLA (Recorded: ${newAlert.value}%)`;
              newlyTriggeredLogs.push(`[SLA-BREACH] Node [${newAlert.agentId}] ${newAlert.agentName}: ${limitMsg}`);
            }
          });
          return nextAlerts;
        });
      }

      newlyTriggeredLogs.forEach(logLine => addLog(logLine));

    }, 2500);

    return () => clearInterval(timer);
  }, [latencyLimit, isStressActive]);

  const coreLoad = Math.round(heatmapAgents.reduce((sum, a) => sum + a.load, 0) / heatmapAgents.length);
  const coreSuccessRate = Number((heatmapAgents.reduce((sum, a) => sum + a.successRate, 0) / heatmapAgents.length).toFixed(2));
  const coreLatency = Math.round(heatmapAgents.reduce((sum, a) => sum + a.latency, 0) / heatmapAgents.length);

  const hoveredAgent = hoveredAgentId === 'CORE' 
    ? { id: 'CORE', name: 'PolyVerses Master Router', role: 'Microservice Router Core', load: coreLoad, successRate: coreSuccessRate, latency: coreLatency }
    : heatmapAgents.find(a => a.id === hoveredAgentId) || null;

  const inspectAgent = hoveredAgent || { id: 'CORE', name: 'PolyVerses Master Router', role: 'Microservice Router Core', load: coreLoad, successRate: coreSuccessRate, latency: coreLatency };

  const modalAgent = selectedModalAgentId 
    ? (selectedModalAgentId === 'CORE'
      ? { id: 'CORE', name: 'PolyVerses Master Router', role: 'Microservice Router Core', load: coreLoad, successRate: coreSuccessRate, latency: coreLatency, purpose: AGENT_INTELEMENTS_DETAILS['CORE'].purpose, tools: AGENT_INTELEMENTS_DETAILS['CORE'].tools }
      : (() => {
          const a = heatmapAgents.find(x => x.id === selectedModalAgentId);
          return a ? { ...a, purpose: AGENT_INTELEMENTS_DETAILS[a.id]?.purpose || '', tools: AGENT_INTELEMENTS_DETAILS[a.id]?.tools || [] } : null;
        })())
    : null;

  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [systemLogs, steps]);

  const addLog = (msg: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setSystemLogs((prev) => [...prev, `[${timestamp}] ${msg}`]);
  };

  const updateAgentStatus = (id: string, status: Agent['status']) => {
    setAgents((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
  };

  // Main Orchestrator Execution Trigger
  const handleStartWorkflow = async () => {
    if (isRunning) return;
    setIsRunning(true);
    setEvaluationResult(null);
    setActiveGate(null);
    setActiveConflict(null);
    setSteps([]);
    setSystemLogs([]);
    setAgents(INITIAL_AGENTS.map((a) => ({ ...a, status: 'idle' })));
    
    addLog(`INITIALIZING ATHENAOS RUN V3.1. Idempotency Check triggered.`);
    addLog(`Active product segment selected: ${productName}`);
    addLog(`User verification completed. Certified Role: ${roleSetting}`);
    
    // Step 1: Signal Harvester
    await delay(1200);
    updateAgentStatus('signal_harvester', 'running');
    addLog('[Signal Harvester] Scanning active Slack threads & Jira boards...');
    setSteps((prev) => [
      ...prev,
      {
        id: 'step-1',
        agentId: 'signal_harvester',
        agentName: 'Signal Harvester',
        action: 'HARVEST_PRODUCT_SIGNALS',
        timestamp: new Date().toLocaleTimeString(),
        output: 'Discovered high user interest in slack compliance sync rules in #product-release-signals.',
        status: 'success',
        priority: 'Low',
      },
    ]);
    updateAgentStatus('signal_harvester', 'completed');

    // Step 2: Opportunity Planner
    await delay(1200);
    updateAgentStatus('opportunity_planning', 'running');
    addLog('[Opportunity Planner] Synthesizing scorecards via Neo4j relations...');
    setSteps((prev) => [
      ...prev,
      {
        id: 'step-2',
        agentId: 'opportunity_planning',
        agentName: 'Opportunity Planner',
        action: 'CALCULATE_RICE_ALIGNMENT',
        timestamp: new Date().toLocaleTimeString(),
        output: 'Proposed RICE index calculated: (Reach 120,000 * Impact 2.5 * Confidence 85%) / Effort 3mo.',
        status: 'success',
        priority: 'Medium',
        confidenceScore: 92,
      },
    ]);
    updateAgentStatus('opportunity_planning', 'completed');

    // TRIGGER INDEPENDENT CONFLICT: Mixture of Experts Council Evaluates Priority!
    await delay(1000);
    addLog('[MoE Council] Conflict flagged: Strategic priority alignment metrics exhibit minor expert variance (>15%). Calling MoE council...');
    setActiveConflict({
      id: 'conflict-1',
      topic: 'Optimal Release Order Index',
      agentsInvolved: ['Opportunity Planner', 'Compliance Auditor'],
      recommendations: [
        { agent: 'Data Scientist', confidence: 95, advice: 'Massive reach indicates immediate scheduling' },
        { agent: 'UX Researcher', confidence: 70, advice: 'Double-check consent dialogue placements before building sync' },
        { agent: 'Eng Architect', confidence: 85, advice: 'Ensure Redis queue constraints support slack API limit ratios' }
      ],
      consolidatedConfidence: 83.3,
      esclatedToHuman: false,
      status: 'resolved'
    });
    addLog('[MoE Council] Consolidated Opinion stabilized: consensus target 83.3%. Continuing graph sequence.');

    // Step 3: Compliance Auditor
    await delay(1500);
    updateAgentStatus('compliance', 'running');
    addLog('[Compliance Auditor] Running GDPR / CCPA pattern keys scans on telemetry specifications...');
    setSteps((prev) => [
      ...prev,
      {
        id: 'step-3',
        agentId: 'compliance',
        agentName: 'Compliance Auditor',
        action: 'PII_TELEMETRY_SCRUB',
        timestamp: new Date().toLocaleTimeString(),
        output: 'WARNING: Standard Slack OAuth access token requires explicit encryption protocols to pass CCPA requirements.',
        status: 'warning',
        priority: 'Medium',
        confidenceScore: 98,
      },
    ]);
    updateAgentStatus('compliance', 'waiting');

    // TRIPPING HUMAN DIRECTION GATE
    addLog('[GATE-TRIGGERED] Redirecting sequence to PM/CPO Authorized Gate. Awaiting human decision.');
    setActiveGate({
      id: 'gate-prd-consent',
      agentId: 'compliance',
      agentName: 'Compliance Auditor',
      title: 'GDPR / CCPA Token Guard Approval',
      description: 'The Compliance Agent detected plaintext token handling in Slack transaction definitions. Confirm remediations or override warning.',
      type: 'approve',
      schema: { action: ['approve', 'modify', 'rerun', 'pause'] },
      agentOutput: {
        detected_risk: 'Plain Slack integration parameters cached in Redis tables without cryptographic layers.',
        recommended_action: 'Configure SHA-256 Envelope KMS Encryption for the storage bucket.',
        override_allowed_for: 'CPO only'
      },
      status: 'pending',
    });
  };

  const handleGateAction = async (action: 'approve' | 'modify' | 'rerun' | 'pause') => {
    if (!activeGate) return;
    
    setIsEvaluating(true);
    addLog(`[Gate] Human submitted decision: ${action.toUpperCase()}`);
    
    // Save history for potential undo operation
    setUndoHistory((prev) => [...prev, { gateId: activeGate.id, priorState: activeGate }]);
    
    let finalPromptAddition = "";
    if (action === 'modify') {
      finalPromptAddition = ` REMEDIATION PARAMETERS UPDATED: Reach=${modifiedReach}, Effort person-months=${modifiedEffort}. Ensure strict SHA-256 Token Encryption is activated.`;
      addLog(`[Gate] Modifying data definitions: Reach override = ${modifiedReach}, Effort = ${modifiedEffort} Person-Months.`);
    } else if (action === 'rerun') {
      finalPromptAddition = ` RERUN WITH SPECIAL INSTRUCTION: Focus intensely on solving the client data retention policy concerns.`;
      addLog('[Gate] Workflow scheduled for restart with special specifications.');
    }

    setActiveGate((prev) => prev ? { ...prev, status: action === 'approve' ? 'approved' : action === 'modify' ? 'modified' : action === 'rerun' ? 'rerun' : 'paused' } : null);
    
    // Trigger real server-side evaluation via our Express backend endpoint!
    addLog('[PRD Creator] Spawning reasoning prompt onto GPT-4o backend pipeline...');
    updateAgentStatus('compliance', 'completed');
    updateAgentStatus('prd_generation', 'running');
    
    try {
      const response = await fetch('/api/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: promptInput + finalPromptAddition,
          priority: prioritySetting,
          role: roleSetting,
          agentType: 'prd',
          userContext: { productName, productDescription }
        })
      });

      const data = await response.json();
      setEvaluationResult(data.text);
      updateAgentStatus('prd_generation', 'completed');

      // Auto-save generated PRD to Firebase Firestore
      if (auth.currentUser) {
        try {
          const { setDoc, serverTimestamp } = await import('firebase/firestore');
          const docId = `prd-${Date.now()}`;
          const docRef = doc(db, 'users', auth.currentUser.uid, 'documents', docId);
          await setDoc(docRef, {
            id: docId,
            userId: auth.currentUser.uid,
            title: `PRD: ${promptInput.split(' ').slice(0, 5).join(' ')}...`,
            prompt: promptInput + finalPromptAddition,
            agentType: 'prd',
            content: data.text,
            createdAt: serverTimestamp(),
          });
          addLog(`[Ledger] PRD deliverable successfully saved to Firestore.`);
        } catch (firebaseErr) {
          console.error("Firebase save error:", firebaseErr);
        }
      }

      // Step 4: SRE Rollback Monitor
      await delay(1000);
      updateAgentStatus('rollback_orchestrator', 'running');
      addLog('[Rollback Orchestrator] Validating error budgets in target US-East active networks...');
      
      const rollbackResponse = await fetch('/api/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: promptInput,
          priority: prioritySetting,
          role: roleSetting,
          agentType: 'rollback',
          userContext: { productName }
        })
      });
      const rollbackData = await rollbackResponse.json();
      
      setSteps((prev) => [
        ...prev,
        {
          id: 'step-4',
          agentId: 'prd_generation',
          agentName: 'PRD Creator',
          action: 'GENERATE_TECHNICAL_PRD',
          timestamp: new Date().toLocaleTimeString(),
          output: 'PRD Generated and synced with corporate workspace index tables.',
          status: 'success',
          priority: 'Medium',
        },
        {
          id: 'step-5',
          agentId: 'rollback_orchestrator',
          agentName: 'Rollback Orchestrator',
          action: 'PERFORM_ERR_BUDGET_SCAN',
          timestamp: new Date().toLocaleTimeString(),
          output: 'SRE preflight deployment safe checks completed. Uptime index stable.',
          status: 'success',
          priority: 'High',
        }
      ]);
      
      updateAgentStatus('rollback_orchestrator', 'completed');
      addLog('🚀 ATHENAOS MULTI-AGENT PIPELINE EXECUTION SUCCESSFUL. Final outputs loaded below.');
      
      // Trigger Undo Banner reminder
      setShowUndoBanner(true);
      setTimeout(() => setShowUndoBanner(false), 20000); // Expose banner for 20 seconds
      
    } catch (err: any) {
      addLog(`[Error] Evaluation failed: ${err.message}`);
    } finally {
      setIsEvaluating(false);
      setIsRunning(false);
      setActiveGate(null);
    }
  };

  const executeUndoAction = () => {
    if (undoHistory.length === 0) return;
    const lastAction = undoHistory[undoHistory.length - 1];
    setActiveGate(lastAction.priorState);
    setUndoHistory((prev) => prev.slice(0, -1));
    setEvaluationResult(null);
    setIsRunning(true);
    addLog(`[UNDO ACTIVATED] Reverting previous decisions. Re-opening gate: ${lastAction.gateId} within the 15-minute SLA.`);
    setShowUndoBanner(false);
  };

  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  // Determine if active user possesses authorization based on RBAC criteria
  const isCPO = roleSetting === 'CPO';
  const isPMorGroupPM = roleSetting === 'CPO' || roleSetting === 'Group PM' || roleSetting === 'PM';

  return (
    <div className="space-y-8">
      
      {/* Undo Banner Toast notifier */}
      <AnimatePresence>
        {showUndoBanner && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-[#121215] border border-[#00A3FF]/45 rounded-xl p-4 flex items-center justify-between text-[#E4E4E7] shadow-2xl relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#00A3FF]/5 blur-3xl rounded-full pointer-events-none" />
            <div className="flex items-center space-x-3">
              <RotateCcw className="w-5 h-5 text-[#00A3FF] animate-spin [animation-duration:10s]" />
              <div>
                <span className="font-semibold text-sm block text-[#F4F4F5]">Gate Decisions Locked - 15m Undo Window Active</span>
                <p className="text-xs text-[#71717A] leading-relaxed">You have 15 minutes to rollback these agentic instructions or modify variables.</p>
              </div>
            </div>
            <button
              onClick={executeUndoAction}
              className="px-3.5 py-1.5 bg-[#00A3FF]/10 hover:bg-[#00A3FF]/20 text-[#60C5FF] border border-[#00A3FF]/30 rounded-lg text-xs font-mono font-medium transition cursor-pointer"
            >
              Undo Action
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Corporate Product Metadata Segment Card */}
      <div className="bg-gradient-to-br from-[#16161A] to-[#0F0F12] border border-[#27272A] rounded-2xl p-6 relative overflow-hidden shadow-xl">
        <div className="absolute top-0 right-0 w-32 h-32 bg-[#00A3FF]/5 blur-3xl rounded-full pointer-events-none" />
        <span className="text-[10px] font-mono tracking-wider text-[#00A3FF] bg-[#00A3FF]/10 px-2 py-0.5 border border-[#00A3FF]/25 rounded uppercase font-medium">PolyVerses Memory Segment</span>
        <h2 className="text-2xl font-sans font-bold tracking-tight mt-3 text-[#F4F4F5]">{productName}</h2>
        <p className="text-sm text-[#A1A1AA] mt-2 leading-relaxed max-w-3xl">{productDescription}</p>
      </div>

      {/* Dynamic Grid for Workspace Operations */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column (2 Span) - Command Desk Console */}
        <div className="lg:col-span-2">
          <div className="bg-[#121215]/85 border border-[#27272A] rounded-2xl p-6 shadow-lg h-full">
            <h3 className="text-lg font-sans font-bold text-[#F4F4F5] mb-4 flex items-center space-x-2">
              <Terminal className="w-5 h-5 text-[#00A3FF]" />
              <span>Command Desk Console</span>
            </h3>

            <div className="space-y-5">
              <div>
                <label className="block text-[10px] font-mono text-[#71717A] uppercase tracking-wider mb-2 font-semibold">Feature Idea / Problem Signal Input</label>
                <textarea
                  rows={3}
                  value={promptInput}
                  onChange={(e) => setPromptInput(e.target.value)}
                  className="w-full bg-[#0C0C0E] border border-[#27272A] rounded-xl px-4 py-3 text-[#E4E4E7] text-sm leading-relaxed focus:outline-none focus:ring-1 focus:ring-[#00A3FF] focus:border-[#00A3FF] transition"
                  placeholder="e.g. Map out custom compliance rules on Firestore, and sync outputs with Jira backlegs..."
                  disabled={isRunning || isEvaluating}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Priority Settings */}
                <div>
                  <label className="block text-[10px] font-mono text-[#71717A] uppercase tracking-wider mb-2 font-semibold">Priority Execution Lane</label>
                  <div className="flex bg-[#0C0C0E] p-1 rounded-lg border border-[#27272A]">
                    {(['Low', 'Medium', 'High'] as const).map((p) => (
                      <button
                        key={p}
                        onClick={() => setPrioritySetting(p)}
                        className={`flex-1 py-1.5 text-xs font-semibold rounded uppercase tracking-wider transition duration-150 cursor-pointer ${
                          prioritySetting === p ? 'bg-[#00A3FF] text-black font-bold h-full' : 'text-[#71717A] hover:text-[#E4E4E7]'
                        }`}
                        disabled={isRunning || isEvaluating}
                      >
                        {p} Lane
                      </button>
                    ))}
                  </div>
                </div>

                {/* Impersonated role matrix */}
                <div>
                  <label className="block text-[10px] font-mono text-[#71717A] uppercase tracking-wider mb-2 font-semibold">Impersonated Role (RBAC Testing)</label>
                  <select
                    value={roleSetting}
                    onChange={(e) => setRoleSetting(e.target.value)}
                    className="w-full bg-[#0C0C0E] border border-[#27272A] rounded-lg px-3 py-2 text-xs text-[#E4E4E7] focus:outline-none focus:ring-1 focus:ring-[#00A3FF] cursor-pointer"
                    disabled={isRunning || isEvaluating}
                  >
                    <option value="CPO">Chief Product Officer (CPO) [All Overrides]</option>
                    <option value="Group PM">Group PM [Medium-High Overrides]</option>
                    <option value="PM">Product Manager (PM) [Standard Ops]</option>
                    <option value="Product Ops">Product Operations [Auditor View Only]</option>
                  </select>
                </div>

                {/* Launch button */}
                <div className="flex items-end">
                  <button
                    onClick={handleStartWorkflow}
                    disabled={isRunning || isEvaluating || !promptInput.trim()}
                    className="w-full h-10 bg-[#00A3FF] hover:bg-[#00A3FF]/90 disabled:opacity-50 text-black font-bold uppercase tracking-wider rounded-lg text-xs transition flex items-center justify-center space-x-2 shadow-lg shadow-[#00A3FF]/10 cursor-pointer"
                  >
                    {isRunning ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Orchestrating...</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 text-black fill-current" />
                        <span>Run Multi-Agent Lane</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column (1 Span) - Saved Deliverables Ledger */}
        <div className="lg:col-span-1">
          <div className="bg-[#121215]/85 border border-[#27272A] rounded-2xl p-6 shadow-lg flex flex-col h-full justify-between">
            <div>
              <h3 className="text-lg font-sans font-bold text-[#F4F4F5] mb-4 flex items-center space-x-2">
                <Save className="w-5 h-5 text-[#00A3FF]" />
                <span>Deliverables Ledger</span>
              </h3>

              {savedDocs.length === 0 ? (
                <div className="py-12 px-4 text-center text-xs text-[#71717A] border border-dashed border-[#27272A] rounded-xl bg-[#0C0C0E]/50">
                  <Hourglass className="w-6 h-6 mx-auto mb-2 text-[#71717A]/60 animate-pulse" />
                  <p className="font-semibold text-[#E4E4E7] mb-1">No saved specs yet</p>
                  <p className="text-[10px] text-[#71717A] leading-relaxed">Run a multi-agent lane to automatically save your generated PRDs to Firestore.</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[160px] overflow-y-auto pr-1">
                  {savedDocs.map((doc) => (
                    <div
                      key={doc.id}
                      onClick={() => {
                        setEvaluationResult(doc.content);
                        setPromptInput(doc.prompt || '');
                        addLog(`[Ledger] Loaded saved deliverable: ${doc.title}`);
                      }}
                      className="p-3 bg-[#0C0C0E] hover:bg-[#16161A] border border-[#27272A] hover:border-[#00A3FF]/45 rounded-xl cursor-pointer transition flex items-start justify-between group"
                    >
                      <div className="space-y-1">
                        <h4 className="text-xs font-semibold text-[#F4F4F5] group-hover:text-[#00A3FF] transition line-clamp-1 pr-2 text-left">
                          {doc.title}
                        </h4>
                        <div className="flex items-center space-x-2 text-[9px] font-mono text-[#71717A]">
                          <span className="px-1 bg-[#00A3FF]/10 text-[#60C5FF] rounded uppercase text-[8px]">
                            {doc.agentType}
                          </span>
                          <span>
                            {doc.createdAt?.seconds 
                              ? new Date(doc.createdAt.seconds * 1000).toLocaleDateString()
                              : 'Just now'
                            }
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={(e) => handleDeleteDoc(doc.id, e)}
                        className="text-[#71717A] hover:text-[#EF4444] p-1 rounded hover:bg-[#EF4444]/10 transition cursor-pointer"
                        title="Delete Deliverable"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="mt-4 pt-4 border-t border-[#27272A] text-[10px] font-mono text-[#71717A] flex items-center justify-between">
              <span>Cloud State: Verified</span>
              <span className="text-[#10B981]">● Active</span>
            </div>
          </div>
        </div>

      </div>

      {/* Dual Grid: Execution Status & Real-time Terminal Log */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Visual Graph Area */}
        <div className="lg:col-span-7 bg-[#121215]/85 border border-[#27272A] rounded-2xl p-5 flex flex-col justify-between shadow-md">
          <div>
            <h4 className="text-xs font-mono tracking-wider text-[#A1A1AA] uppercase mb-4 font-semibold">Active Agent State Maps</h4>
            
            {/* Visual Agent Cards Grid representation */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {agents.map((agent) => {
                const isAgentRunning = agent.status === 'running';
                const isAgentComplete = agent.status === 'completed';
                const isAgentWaiting = agent.status === 'waiting';

                return (
                  <div
                    key={agent.id}
                    className={`p-3.5 rounded-xl border transition-all duration-300 relative ${
                      isAgentRunning
                        ? 'border-[#00A3FF] bg-[#00A3FF]/5 ring-1 ring-[#00A3FF]/30 shadow-md shadow-[#00A3FF]/5'
                        : isAgentComplete
                        ? 'border-[#10B981]/30 bg-[#10B981]/5'
                        : isAgentWaiting
                        ? 'border-[#F59E0B]/40 bg-[#F59E0B]/10'
                        : 'border-[#27272A] bg-gradient-to-br from-[#16161A] to-[#0F0F12]'
                    }`}
                  >
                    {/* Status Dot */}
                    <div className="absolute top-3.5 right-3.5">
                      {isAgentRunning && <RefreshCw className="w-3.5 h-3.5 text-[#00A3FF] animate-spin" />}
                      {isAgentComplete && <CheckCircle2 className="w-3.5 h-3.5 text-[#10B981]" />}
                      {isAgentWaiting && <Hourglass className="w-3.5 h-3.5 text-[#F59E0B] animate-pulse" />}
                      {agent.status === 'idle' && <div className="w-2 h-2 rounded-full bg-[#3F3F46]" />}
                    </div>

                    <span className={`text-[9px] font-mono tracking-wider uppercase block ${
                      agent.priority === 'High' ? 'text-rose-400' : agent.priority === 'Medium' ? 'text-[#00A3FF]' : 'text-[#71717A]'
                    }`}>
                      {agent.priority} Priority / {agent.role}
                    </span>
                    <h5 className="font-bold text-[13px] text-[#F4F4F5] mt-1">{agent.name}</h5>
                    <p className="text-[11px] text-[#A1A1AA] mt-1 line-clamp-1">{agent.description}</p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-[#27272A] text-[10px] text-[#71717A] flex items-center justify-between font-mono uppercase tracking-wider">
            <span>Graph Registry: 23 Nodes loaded</span>
            <div className="flex items-center space-x-3">
              <span className="flex items-center space-x-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#EF4444] shrink-0" />
                <span>High</span>
              </span>
              <span className="flex items-center space-x-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00A3FF] shrink-0" />
                <span>Medium</span>
              </span>
              <span className="flex items-center space-x-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#71717A] shrink-0" />
                <span>Low</span>
              </span>
            </div>
          </div>
        </div>

        {/* Live Step Logger / Terminal logs container */}
        <div className="lg:col-span-5 bg-[#0C0C0E] border border-[#27272A] rounded-2xl p-5 flex flex-col h-[400px]">
          <span className="text-xs font-mono tracking-wider text-[#71717A] uppercase mb-3 block font-semibold">Active Run Logs</span>
          
          <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar text-[11px] leading-relaxed font-mono">
            {systemLogs.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center text-[#71717A] space-y-2">
                <Cpu className="w-6 h-6 shrink-0 text-[#27272A]" />
                <span className="text-[10px] uppercase tracking-wider">Awaiting execution request trigger...</span>
              </div>
            )}
            {systemLogs.map((log, index) => (
              <div
                key={index}
                className={`${
                  log.includes('[GATE-TRIGGERED]')
                    ? 'text-[#F59E0B] font-semibold'
                    : log.includes('[Error]')
                    ? 'text-rose-400 font-semibold'
                    : log.includes('SUCCESSFUL')
                    ? 'text-[#10B981] font-bold'
                    : 'text-[#A1A1AA]'
                }`}
              >
                {log}
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* 23 Agents Live Telemetry Heatmap Section */}
      <div className="bg-[#121215]/85 border border-[#27272A] rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-48 h-48 bg-[#00A3FF]/5 blur-3xl rounded-full pointer-events-none" />
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 mb-6 border-b border-[#27272A]">
          <div>
            <div className="flex items-center space-x-2">
              <Activity className="w-5 h-5 text-[#00A3FF] animate-pulse" />
              <h3 className="text-lg font-sans font-bold text-[#F4F4F5]">Live Network Telemetry Matrix</h3>
            </div>
            <p className="text-xs text-[#71717A] mt-1 leading-relaxed">
              Real-time load balancing, packet delivery, and routing latency values for all 23 active nodes.
            </p>
          </div>
          
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            {/* View Mode Switcher */}
            <div className="flex bg-[#0C0C0E] border border-[#27272A] p-1 rounded-xl shrink-0">
              <button
                onClick={() => setViewMode('grid')}
                className={`flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition duration-150 cursor-pointer ${
                  viewMode === 'grid'
                    ? 'bg-[#27272A] text-white font-bold border border-zinc-700'
                    : 'text-[#71717A] hover:text-[#E4E4E7]'
                }`}
              >
                <span>Telemetry Grid</span>
              </button>
              <button
                onClick={() => setViewMode('topology')}
                className={`flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition duration-150 cursor-pointer ${
                  viewMode === 'topology'
                    ? 'bg-[#27272A] text-white font-bold border border-zinc-700'
                    : 'text-[#71717A] hover:text-[#E4E4E7]'
                }`}
              >
                <span>Network Topology</span>
              </button>
              <button
                onClick={() => setViewMode('heatmap')}
                className={`flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition duration-150 cursor-pointer ${
                  viewMode === 'heatmap'
                    ? 'bg-[#27272A] text-white font-bold border border-zinc-700'
                    : 'text-[#71717A] hover:text-[#E4E4E7]'
                }`}
              >
                <span>Distribution Heatmap</span>
              </button>
            </div>

            {/* Metrics Tab Selector */}
            {viewMode === 'grid' && (
              <div className="flex bg-[#0C0C0E] border border-[#27272A] p-1 rounded-xl shrink-0">
                <button
                  onClick={() => setSelectedMetric('load')}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition duration-150 cursor-pointer ${
                    selectedMetric === 'load'
                      ? 'bg-[#00A3FF] text-black font-bold'
                      : 'text-[#71717A] hover:text-[#E4E4E7]'
                  }`}
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>Workload</span>
                </button>
                <button
                  onClick={() => setSelectedMetric('successRate')}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition duration-150 cursor-pointer ${
                    selectedMetric === 'successRate'
                      ? 'bg-[#00A3FF] text-black font-bold'
                      : 'text-[#71717A] hover:text-[#E4E4E7]'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Success SLA</span>
                </button>
                <button
                  onClick={() => setSelectedMetric('latency')}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition duration-150 cursor-pointer ${
                    selectedMetric === 'latency'
                      ? 'bg-[#00A3FF] text-black font-bold'
                      : 'text-[#71717A] hover:text-[#E4E4E7]'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>Latency</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* SRE Alert Safeguards & Active SLA Streams */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5 mb-6 p-4 bg-[#0C0C0E] border border-[#27272A] rounded-2xl relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-red-500/[0.01] to-transparent pointer-events-none" />
          
          {/* Controls Segment */}
          <div className="md:col-span-7 flex flex-col sm:flex-row gap-5 items-center justify-between">
            {/* Range slider for latency threshold */}
            <div className="w-full flex-1">
              <div className="flex items-center justify-between text-[11px] font-mono mb-2">
                <span className="text-[#A1A1AA] uppercase font-bold flex items-center space-x-1.5">
                  <Clock className="w-3.5 h-3.5 text-[#F59E0B]" />
                  <span>Configured Latency Limit</span>
                </span>
                <span className="text-[#00A3FF] font-black">{latencyLimit}ms</span>
              </div>
              <input
                type="range"
                min="100"
                max="800"
                step="50"
                value={latencyLimit}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setLatencyLimit(val);
                  addLog(`[CONFIG-UPDATE] Predefined SRE Latency Limit calibrated to ${val}ms`);
                }}
                className="w-full accent-[#00A3FF] h-1 bg-[#121215] border border-[#27272A] rounded-lg cursor-pointer"
              />
              <div className="flex justify-between text-[8px] font-mono text-[#71717A] mt-1">
                <span>100ms (High Perf)</span>
                <span>800ms (Bursty Allowed)</span>
              </div>
            </div>

            {/* Standard static SLA limit */}
            <div className="w-full sm:w-auto shrink-0 bg-[#121215] border border-[#27272A] p-2.5 rounded-xl flex items-center space-x-3">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              <div>
                <span className="text-[9px] font-mono text-[#71717A] block uppercase font-bold">Standard SLA</span>
                <span className="text-xs font-mono font-bold text-emerald-400">80.00%</span>
              </div>
            </div>

            {/* Simulated Stress Test trigger */}
            <button
              onClick={() => {
                const nextVal = !isStressActive;
                setIsStressActive(nextVal);
                addLog(nextVal
                  ? '[STRESS-INDUCTED] Live network stress patterns enabled. Generating SLA packet load and latency drift anomalies.'
                  : '[STRESS-DISABLED] Disabling forced stress testing. Calibrating nodes back to standard SRE guidelines.'
                );
              }}
              className={`w-full sm:w-auto text-center shrink-0 px-4 py-2 border rounded-xl text-xs font-mono font-bold uppercase tracking-wider transition duration-150 cursor-pointer flex items-center justify-center space-x-2 ${
                isStressActive
                  ? 'bg-rose-500/20 border-rose-500/50 text-rose-300 hover:bg-rose-500/30'
                  : 'bg-[#121215] border-[#27272A] text-zinc-400 hover:text-white hover:bg-[#1C1C21]'
              }`}
            >
              <AlertTriangle className={`w-4 h-4 ${isStressActive ? 'animate-bounce text-rose-400' : ''}`} />
              <span>{isStressActive ? 'Mute Stress' : 'Trigger SLA Chaos'}</span>
            </button>
          </div>

          {/* SLA Alerts feed stream list */}
          <div className="md:col-span-5 border-t md:border-t-0 md:border-l border-[#27272A] pt-4 md:pt-0 md:pl-5 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono font-black text-rose-400 uppercase tracking-wider flex items-center space-x-1.5">
                <span className={`w-1.5 h-1.5 rounded-full bg-rose-500 ${alerts.filter(a => !a.resolved).length > 0 ? 'animate-ping' : ''}`} />
                <span>Live Alerts Stream ({alerts.filter(a => !a.resolved).length} Unresolved)</span>
              </span>
              {alerts.length > 0 && (
                <button
                  onClick={() => setAlerts([])}
                  className="text-[8px] font-mono text-[#71717A] hover:text-[#E4E4E7] uppercase cursor-pointer underline"
                >
                  Clear history
                </button>
              )}
            </div>
            
            <div className="h-[52px] overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
              {alerts.length === 0 ? (
                <div className="h-full flex items-center justify-center text-center text-[9px] font-mono text-[#71717A] uppercase tracking-wider">
                  Uptime 100% - All thresholds aligned
                </div>
              ) : (
                alerts.map((alert) => (
                  <div
                    key={alert.id}
                    onClick={() => {
                      setSelectedModalAgentId(alert.agentId);
                    }}
                    className={`p-1.5 px-2.5 rounded border transition-all text-[9.5px] cursor-pointer flex items-center justify-between font-mono ${
                      alert.resolved
                        ? 'opacity-40 bg-[#121215]/50 border-[#27272A]'
                        : alert.metric === 'successRate'
                        ? 'bg-rose-500/10 border-rose-500/35 text-rose-300 hover:bg-rose-500/15'
                        : 'bg-amber-500/10 border-amber-500/35 text-amber-300 hover:bg-amber-500/15'
                    }`}
                  >
                    <div className="flex items-center space-x-1.5 truncate">
                      <span className="font-bold shrink-0">[{alert.agentId}]</span>
                      <span className="truncate">{alert.metric === 'successRate' ? 'SLA Loss < 80%' : `Latency > ${alert.limit}ms`}</span>
                      <span className="opacity-75 font-semibold">({alert.value}{alert.metric === 'successRate' ? '%' : 'ms'})</span>
                    </div>
                    <div className="flex items-center space-x-1 shrink-0 text-[8px] opacity-75">
                      <span>{alert.timestamp}</span>
                      {alert.resolved ? (
                        <span className="text-emerald-400 font-bold">● CLOSED</span>
                      ) : (
                        <span className="text-rose-400 font-black animate-pulse">▲ ACTIVE</span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Heatmap Layout with Side Inspect Panel */}
        {viewMode === 'grid' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Heatmap Grid on Left */}
          <div className="lg:col-span-8 flex flex-col justify-between">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              
              {/* Core Master Router Node Cell (Block 1) */}
              {(() => {
                const hasUnresolvedCoreAlert = alerts.some((al) => al.agentId === 'CORE' && !al.resolved);
                return (
                  <div
                    onClick={() => setSelectedModalAgentId('CORE')}
                    onMouseEnter={() => setHoveredAgentId('CORE')}
                    onMouseLeave={() => setHoveredAgentId(null)}
                    className={`p-3 rounded-xl border transition-all duration-200 cursor-pointer text-left relative overflow-hidden group hover:scale-[1.03] active:scale-[0.98] ${
                      hoveredAgentId === 'CORE' ? 'ring-2 ring-white/25 scale-[1.03]' : ''
                    } ${
                      hasUnresolvedCoreAlert
                        ? 'border-rose-500/80 bg-rose-500/10 shadow-[0_0_15px_rgba(239,68,68,0.35)] animate-pulse'
                        : selectedMetric === 'load'
                        ? getLoadStyle(coreLoad).bg + ' ' + getLoadStyle(coreLoad).border
                        : selectedMetric === 'successRate'
                        ? getSuccessStyle(coreSuccessRate).bg + ' ' + getSuccessStyle(coreSuccessRate).border
                        : getLatencyStyle(coreLatency).bg + ' ' + getLatencyStyle(coreLatency).border
                    }`}
                  >
                    <div className="absolute top-1 right-1 flex items-center space-x-1">
                      {hasUnresolvedCoreAlert && (
                        <span className="flex h-1.5 w-1.5 relative">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-rose-500"></span>
                        </span>
                      )}
                      <div className="px-1 bg-black/40 border border-white/10 rounded text-[8px] font-bold tracking-wider opacity-85">
                        CORE
                      </div>
                    </div>
                    <div className="text-[8px] font-mono tracking-wider opacity-75">MASTER SYSTEM</div>
                    <div className="font-sans font-black text-xs tracking-tight mt-1 group-hover:underline">
                      PolyVerses Core
                    </div>
                    <div className="text-xs font-mono font-medium mt-2.5 flex items-center space-x-1">
                      {selectedMetric === 'load' ? (
                        <>
                          <Zap className="w-3 h-3 text-current shrink-0" />
                          <span>{coreLoad}%</span>
                        </>
                      ) : selectedMetric === 'successRate' ? (
                        <>
                          <ShieldCheck className="w-3 h-3 text-current shrink-0" />
                          <span>{coreSuccessRate}%</span>
                        </>
                      ) : (
                        <>
                          <Clock className="w-3 h-3 text-current shrink-0" />
                          <span>{coreLatency}ms</span>
                        </>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* 23 Agent Nodes */}
              {heatmapAgents.map((agent) => {
                const isHovered = hoveredAgentId === agent.id;
                const loadStyle = getLoadStyle(agent.load);
                const successStyle = getSuccessStyle(agent.successRate);
                const latencyStyle = getLatencyStyle(agent.latency);

                const activeStyle = 
                  selectedMetric === 'load'
                    ? loadStyle
                    : selectedMetric === 'successRate'
                    ? successStyle
                    : latencyStyle;

                // Simple short name
                const shortName = agent.name.split(' ').slice(0, 2).join(' ');
                
                // Identify active unresolved threshold alarms
                const isViolated = alerts.some((al) => al.agentId === agent.id && !al.resolved);

                return (
                  <div
                    key={agent.id}
                    onClick={() => setSelectedModalAgentId(agent.id)}
                    onMouseEnter={() => setHoveredAgentId(agent.id)}
                    onMouseLeave={() => setHoveredAgentId(null)}
                    className={`p-3 rounded-xl border transition-all duration-200 cursor-pointer text-left relative group hover:scale-[1.03] active:scale-[0.98] ${
                      isHovered ? 'ring-2 ring-white/20 scale-[1.03]' : ''
                    } ${
                      isViolated
                        ? 'border-rose-500/80 bg-rose-500/10 text-rose-200 shadow-[0_0_12px_rgba(239,68,68,0.25)] animate-pulse'
                        : `${activeStyle.bg} ${activeStyle.border}`
                    }`}
                  >
                    <div className="absolute top-1 right-1 flex items-center space-x-1">
                      {isViolated && (
                        <span className="flex h-1.5 w-1.5 relative">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-rose-500"></span>
                        </span>
                      )}
                      <div className={`px-1 rounded text-[8px] font-mono ${
                        isViolated
                          ? 'bg-rose-500/30 border border-rose-500/40 text-rose-300 font-bold'
                          : 'bg-black/30 border border-white/5 opacity-60'
                      }`}>
                        {agent.id}
                      </div>
                    </div>
                    <div className="text-[8px] font-mono tracking-wider opacity-60 truncate">{agent.role.toUpperCase()}</div>
                    <h5 className="font-sans font-bold text-xs tracking-tight mt-1 truncate group-hover:underline">
                      {shortName}
                    </h5>
                    
                    <div className="text-xs font-mono font-semibold mt-2.5 flex items-center space-x-1">
                      {selectedMetric === 'load' ? (
                        <>
                          <Zap className="w-3.5 h-3.5 text-current shrink-0 opacity-70" />
                          <span>{agent.load}%</span>
                        </>
                      ) : selectedMetric === 'successRate' ? (
                        <>
                          <ShieldCheck className="w-3.5 h-3.5 text-current shrink-0 opacity-70" />
                          <span>{agent.successRate}%</span>
                        </>
                      ) : (
                        <>
                          <Clock className="w-3.5 h-3.5 text-current shrink-0 opacity-70" />
                          <span>{agent.latency}ms</span>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            
            {/* Heatmap Legend */}
            <div className="mt-5 pt-4 border-t border-[#27272A]/40 flex flex-wrap gap-4 items-center justify-between text-[10px] font-mono text-[#71717A] uppercase tracking-wider">
              <span>Metric colors represent operational thresholds</span>
              <div className="flex flex-wrap items-center gap-3">
                {selectedMetric === 'load' ? (
                  <>
                    <span className="flex items-center space-x-1">
                      <span className="w-2.5 h-2.5 rounded bg-[#00A3FF]/10 border border-[#00A3FF]/20" />
                      <span>Idle (&lt;30%)</span>
                    </span>
                    <span className="flex items-center space-x-1">
                      <span className="w-2.5 h-2.5 rounded bg-[#00A3FF]/25 border border-[#00A3FF]/40" />
                      <span>Normal (30-60%)</span>
                    </span>
                    <span className="flex items-center space-x-1">
                      <span className="w-2.5 h-2.5 rounded bg-[#00A3FF]/45 border border-[#00A3FF]/60" />
                      <span>Active (60-80%)</span>
                    </span>
                    <span className="flex items-center space-x-1">
                      <span className="w-2.5 h-2.5 rounded bg-[#00A3FF] border border-white/20" />
                      <span>Peak (&gt;80%)</span>
                    </span>
                  </>
                ) : selectedMetric === 'successRate' ? (
                  <>
                    <span className="flex items-center space-x-1">
                      <span className="w-2.5 h-2.5 rounded bg-[#10B981]/15 border border-[#10B981]/30" />
                      <span>Sovereign (99.5%+)</span>
                    </span>
                    <span className="flex items-center space-x-1">
                      <span className="w-2.5 h-2.5 rounded bg-[#10B981]/30 border border-[#10B981]/50" />
                      <span>Healthy (98-99.5%)</span>
                    </span>
                    <span className="flex items-center space-x-1">
                      <span className="w-2.5 h-2.5 rounded bg-[#F59E0B]/20 border border-[#F59E0B]/40" />
                      <span>Warning (95-98%)</span>
                    </span>
                    <span className="flex items-center space-x-1">
                      <span className="w-2.5 h-2.5 rounded bg-[#EF4444]/25 border border-[#EF4444]/50" />
                      <span>Faulty (&lt;95%)</span>
                    </span>
                  </>
                ) : (
                  <>
                    <span className="flex items-center space-x-1">
                      <span className="w-2.5 h-2.5 rounded bg-emerald-500/10 border border-emerald-500/25" />
                      <span>Instant (&lt;150ms)</span>
                    </span>
                    <span className="flex items-center space-x-1">
                      <span className="w-2.5 h-2.5 rounded bg-[#00A3FF]/15 border border-[#00A3FF]/30" />
                      <span>Normal (150-400ms)</span>
                    </span>
                    <span className="flex items-center space-x-1">
                      <span className="w-2.5 h-2.5 rounded bg-[#F59E0B]/15 border border-[#F59E0B]/30" />
                      <span>Queued (400-850ms)</span>
                    </span>
                    <span className="flex items-center space-x-1">
                      <span className="w-2.5 h-2.5 rounded bg-rose-500/10 border border-rose-500/30" />
                      <span>Degraded (&gt;850ms)</span>
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Node Inspect Panel on Right */}
          <div className="lg:col-span-4 bg-[#0C0C0E] border border-[#27272A] rounded-xl p-5 flex flex-col justify-between shadow-inner relative overflow-hidden min-h-[300px]">
            <div className="absolute top-0 right-0 w-24 h-24 bg-[#00A3FF]/5 blur-2xl rounded-full pointer-events-none" />
            
            {/* Upper Info */}
            <div>
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-[#27272A]/60">
                <span className="text-[10px] font-mono uppercase tracking-wider text-[#71717A] font-bold">Node Inspector</span>
                <span className="font-mono text-[10px] text-[#00A3FF] px-2 py-0.5 bg-[#00A3FF]/10 border border-[#00A3FF]/20 rounded font-bold uppercase tracking-wider">
                  {inspectAgent.id}
                </span>
              </div>
              
              <h4 className="text-sm font-sans font-bold text-[#F4F4F5]">{inspectAgent.name}</h4>
              <p className="text-[10px] font-mono uppercase text-[#00A3FF] mt-0.5 tracking-wider font-semibold">
                {inspectAgent.role}
              </p>
              
              <p className="text-xs text-[#A1A1AA] mt-3 leading-relaxed">
                {AGENT_INTELEMENTS_DETAILS[inspectAgent.id]?.purpose || 'Calculates autonomous decisions as part of the consensus mesh networks.'}
              </p>

              {/* Progress Gauges */}
              <div className="space-y-4 mt-6">
                
                {/* Gauge 1: Workload */}
                <div>
                  <div className="flex justify-between items-center text-[10px] font-mono text-[#71717A] mb-1.5 uppercase font-bold">
                    <span>Active Workload</span>
                    <span className="text-[#E4E4E7]">{inspectAgent.load}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-[#121215] border border-[#27272A] rounded-full overflow-hidden">
                    <motion.div
                      animate={{ width: `${inspectAgent.load}%` }}
                      transition={{ duration: 0.3 }}
                      className="h-full bg-gradient-to-r from-[#00A3FF]/50 to-[#00A3FF] rounded-full"
                    />
                  </div>
                </div>

                {/* Gauge 2: Success Rate */}
                <div>
                  <div className="flex justify-between items-center text-[10px] font-mono text-[#71717A] mb-1.5 uppercase font-bold">
                    <span>Success SLA</span>
                    <span className="text-[#E4E4E7]">{inspectAgent.successRate}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-[#121215] border border-[#27272A] rounded-full overflow-hidden">
                    <motion.div
                      animate={{ width: `${inspectAgent.successRate}%` }}
                      transition={{ duration: 0.3 }}
                      className={`h-full rounded-full ${
                        inspectAgent.successRate >= 98.5 ? 'bg-[#10B981]' : inspectAgent.successRate >= 95 ? 'bg-[#F59E0B]' : 'bg-[#EF4444]'
                      }`}
                    />
                  </div>
                </div>

                {/* Gauge 3: Latency */}
                <div>
                  <div className="flex justify-between items-center text-[10px] font-mono text-[#71717A] mb-1.5 uppercase font-bold">
                    <span>Connection Latency</span>
                    <span className="text-[#E4E4E7]">{inspectAgent.latency}ms</span>
                  </div>
                  <div className="w-full h-1.5 bg-[#121215] border border-[#27272A] rounded-full overflow-hidden">
                    {(() => {
                      const latPct = Math.max(5, Math.min(100, 100 - (inspectAgent.latency / 1200) * 100));
                      return (
                        <motion.div
                          animate={{ width: `${latPct}%` }}
                          transition={{ duration: 0.3 }}
                          className={`h-full rounded-full ${
                            inspectAgent.latency < 250 ? 'bg-[#00A3FF]' : inspectAgent.latency < 600 ? 'bg-[#F59E0B]' : 'bg-rose-500'
                          }`}
                        />
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>

            {/* Sub-Actions & Tools */}
            <div className="mt-6 pt-4 border-t border-[#27272A]/60">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#71717A] mb-2 block font-bold">Allocated Tools / APIs</span>
              <div className="flex flex-wrap gap-1.5">
                {(AGENT_INTELEMENTS_DETAILS[inspectAgent.id]?.tools || ['Athena Kernel', 'RPC Handler']).map((tool) => (
                  <span
                    key={tool}
                    className="text-[9px] font-mono px-2 py-0.5 bg-[#121215] border border-[#27272A] text-[#A1A1AA] rounded font-semibold uppercase"
                  >
                    {tool}
                  </span>
                ))}
              </div>
            </div>

          </div>

        </div>
        ) : viewMode === 'topology' ? (
          <AgentNetworkDiagram
            heatmapAgents={heatmapAgents}
            coreLoad={coreLoad}
            coreSuccessRate={coreSuccessRate}
            coreLatency={coreLatency}
            alerts={alerts}
            onSelectAgent={(agentId) => {
              setSelectedModalAgentId(agentId);
            }}
          />
        ) : (
          <RechartsHeatmap
            heatmapAgents={heatmapAgents}
            coreLoad={coreLoad}
            coreSuccessRate={coreSuccessRate}
            coreLatency={coreLatency}
            alerts={alerts}
            onSelectAgent={(agentId) => {
              setSelectedModalAgentId(agentId);
            }}
          />
        )}
      </div>

      {/* Mixture of Experts Council opinion popups */}
      {activeConflict && (
        <div className="bg-[#121215]/80 border border-[#27272A] rounded-2xl p-6 relative overflow-hidden shadow-xl">
          <div className="absolute top-0 right-0 w-24 h-24 bg-[#00A3FF]/5 blur-3xl pointer-events-none" />
          <span className="text-[10px] font-mono tracking-wider text-[#60C5FF] uppercase font-semibold block">Auto-Flagged Conflict Resolver: MoE council active</span>
          <h4 className="text-base font-sans font-bold text-[#F4F4F5] mt-1.5 mb-2">Topic: {activeConflict.topic}</h4>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            {activeConflict.recommendations.map((rec) => (
              <div key={rec.agent} className="p-3 bg-[#0C0C0E] border border-[#27272A] rounded-lg">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-mono font-bold text-[#E4E4E7]">{rec.agent}</span>
                  <span className="text-[9px] font-mono text-[#60C5FF] px-1.5 py-0.2 bg-[#00A3FF]/10 rounded border border-[#00A3FF]/20">
                    {rec.confidence}% conf
                  </span>
                </div>
                <p className="text-xs text-[#A1A1AA] italic leading-relaxed">"{rec.advice}"</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Human gate confirmation trigger popup card */}
      <AnimatePresence>
        {activeGate && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="bg-gradient-to-br from-[#16161A] to-[#0F0F12] border border-[#F59E0B]/30 rounded-2xl p-6 shadow-2xl relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#F59E0B]/5 blur-3xl pointer-events-none" />
            
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-3 mb-4">
                <div className="p-2 bg-[#F59E0B]/10 text-[#F59E0B] rounded-xl shrink-0 border border-[#F59E0B]/25">
                  <ShieldAlert className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <span className="text-xs font-mono text-[#F59E0B] uppercase font-bold tracking-wider">Security / Compliance Authorized Gate</span>
                  <h3 className="text-lg font-sans font-bold text-[#F4F4F5] mt-0.5">{activeGate.title}</h3>
                </div>
              </div>
              <div className="text-[9px] font-mono px-2.5 py-1 bg-black text-[#F59E0B] border border-[#F59E0B]/20 rounded uppercase tracking-wider shrink-0">
                Awaiting Gate Decision
              </div>
            </div>

            <p className="text-sm text-[#A1A1AA] leading-relaxed mb-4">{activeGate.description}</p>

            <div className="bg-[#0C0C0E] border border-[#27272A] rounded-xl p-4 mb-5 space-y-1.5 text-xs shadow-inner">
              <div className="flex justify-between border-b border-[#27272A]/40 pb-1.5">
                <span className="text-[#71717A] font-mono">Agent Diagnostic Warning:</span>
                <span className="text-[#E4E4E7] text-right max-w-md">{activeGate.agentOutput.detected_risk}</span>
              </div>
              <div className="flex justify-between pt-1.5">
                <span className="text-[#71717A] font-mono">Proposed Automation Fix:</span>
                <span className="text-[#60C5FF] text-right max-w-md font-bold">{activeGate.agentOutput.recommended_action}</span>
              </div>
            </div>

            {/* Dynamic Modify parameters adjustment form */}
            {isModifyingOutput && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                className="bg-[#0C0C0E] border border-[#27272A] rounded-xl p-4 mb-5 space-y-4 overflow-hidden"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-mono text-[#71717A] mb-1.5 uppercase font-semibold">Target Monthly Reach (Users)</label>
                    <input
                      type="number"
                      value={modifiedReach}
                      onChange={(e) => setModifiedReach(Number(e.target.value))}
                      className="w-full bg-[#121215] border border-[#27272A] rounded-lg px-3 py-1.5 text-xs text-[#E4E4E7] focus:outline-none focus:ring-1 focus:ring-[#00A3FF]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono text-[#71717A] mb-1.5 uppercase font-semibold">Target Effort Estimate (Person-Months)</label>
                    <input
                      type="number"
                      value={modifiedEffort}
                      onChange={(e) => setModifiedEffort(Number(e.target.value))}
                      className="w-full bg-[#121215] border border-[#27272A] rounded-lg px-3 py-1.5 text-xs text-[#E4E4E7] focus:outline-none focus:ring-1 focus:ring-[#00A3FF]"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-mono text-[#71717A] mb-1.5 uppercase font-semibold font-semibold">Custom Guard Instructions</label>
                  <input
                    type="text"
                    value={modifiedGoal}
                    onChange={(e) => setModifiedGoal(e.target.value)}
                    className="w-full bg-[#121215] border border-[#27272A] rounded-lg px-3 py-1.5 text-xs text-[#E4E4E7] focus:outline-none focus:ring-1 focus:ring-[#00A3FF]"
                    placeholder="e.g. Encrypt plaintext tokens inside PostgreSQL / Redis stores key vectors"
                  />
                </div>
              </motion.div>
            )}

            {/* Decision Board Buttons with RBAC protection */}
            <div className="flex flex-wrap gap-3">
              {/* Approve (Only for PMs or higher roles) */}
              <button
                onClick={() => handleGateAction('approve')}
                className="px-5 py-2 hover:bg-[#10B981]/90 bg-[#10B981] text-black font-bold rounded-lg text-xs tracking-wider transition uppercase cursor-pointer"
              >
                Approve & Execute Remediations
              </button>

              {/* Modify parameters */}
              <button
                onClick={() => {
                  setIsModifyingOutput(!isModifyingOutput);
                }}
                className="px-4 py-2 hover:bg-[#00A3FF]/10 hover:text-[#00A3FF] border border-[#00A3FF]/40 text-[#60C5FF] font-bold rounded-lg text-xs tracking-wider transition uppercase flex items-center space-x-1.5 cursor-pointer"
              >
                <Edit className="w-3.5 h-3.5" />
                <span>{isModifyingOutput ? 'Hide Modifiers' : 'Modify Parameters'}</span>
              </button>
              
              {isModifyingOutput && (
                <button
                  onClick={() => handleGateAction('modify')}
                  className="px-4 py-2 bg-[#121215] border border-[#27272A] hover:bg-[#27272A] hover:text-[#00A3FF] font-bold rounded-lg text-xs tracking-wider transition uppercase cursor-pointer"
                >
                  Save & Commit Changes
                </button>
              )}

              {/* Rerun */}
              <button
                onClick={() => handleGateAction('rerun')}
                className="px-4 py-2 hover:bg-[#F59E0B]/20 hover:text-[#F59E0B] border border-[#F59E0B]/30 text-[#F59E0B] font-bold rounded-lg text-xs tracking-wider transition uppercase cursor-pointer"
              >
                Rerun Segment Analysis
              </button>

              {/* Safe Sunset warning (Only CPO possesses rights to bypass compliance or sunset) */}
              {isCPO ? (
                <button
                  onClick={() => handleGateAction('pause')}
                  className="px-4 py-2 border border-[#EF4444] text-[#EF4444] hover:bg-[#EF4444] hover:text-black font-bold rounded-lg text-xs tracking-wider transition uppercase flex items-center space-x-1.5 cursor-pointer ml-auto"
                >
                  <Ban className="w-3.5 h-3.5" />
                  <span>CPO Override Compliance</span>
                </button>
              ) : (
                <div className="flex items-center space-x-1.5 text-[10px] font-mono text-[#EF4444] ml-auto border border-[#EF4444]/20 px-3 py-1.5 bg-[#EF4444]/5 rounded">
                  <Lock className="w-3.5 h-3.5 shrink-0 animate-bounce" />
                  <span>Sunset/Override restricted for PM role</span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* API Generation Output Result Panel (GPT4o reasoning summary) */}
      <AnimatePresence>
        {(evaluationResult || isEvaluating) && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gradient-to-br from-[#16161A] to-[#0F0F12] border border-[#27272A] rounded-2xl p-6 shadow-xl"
          >
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-[#27272A]">
              <div className="flex items-center space-x-2">
                <Sparkles className="w-5 h-5 text-[#00A3FF]" />
                <span className="font-sans font-bold text-[#F4F4F5] uppercase tracking-wider text-xs">PolyVerses Agent Output Stream</span>
              </div>
              <span className="text-[10px] font-mono text-[#71717A]">
                {isEvaluating ? 'Synthesizing through Gemini...' : 'Pipeline resolved successfully'}
              </span>
            </div>

            {isEvaluating ? (
              <div className="py-8 flex flex-col items-center justify-center space-y-3">
                <Cpu className="w-8 h-8 text-[#00A3FF] animate-spin [animation-duration:6s]" />
                <span className="font-mono text-xs text-[#00A3FF]">AI generating microservices schema & success SLAs...</span>
              </div>
            ) : (
              <div className="text-[#E4E4E7] text-sm leading-relaxed whitespace-pre-wrap select-text selection:bg-[#00A3FF]/30 selection:text-white prd-markdown-renderer overflow-x-auto">
                <div className="prose prose-invert max-w-none font-sans">
                  {evaluationResult}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Interactive Telemetry Modal */}
      <AnimatePresence>
        {selectedModalAgentId && modalAgent && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedModalAgentId(null)}
              className="absolute inset-0 bg-[#09090B]/85 backdrop-blur-md"
            />

            {/* Modal Body */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="relative w-full max-w-2xl bg-[#0F0F12] border border-[#27272A] rounded-2xl shadow-2xl p-6 overflow-hidden md:p-8 text-left"
            >
              {/* Sci-fi top glow */}
              <div className="absolute top-0 right-1/4 w-96 h-40 bg-[#00A3FF]/10 blur-3xl rounded-full pointer-events-none" />

              {/* Close Button */}
              <button
                onClick={() => setSelectedModalAgentId(null)}
                className="absolute top-4 right-4 text-[#71717A] hover:text-[#E4E4E7] transition p-1.5 hover:bg-[#1C1C21] rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>

              {/* Header */}
              <div className="flex items-start justify-between border-b border-[#27272A]/80 pb-4 mb-6">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-mono text-xs text-[#00A3FF] bg-[#00A3FF]/10 border border-[#00A3FF]/20 px-2 py-0.5 rounded font-bold uppercase tracking-wider">
                      {modalAgent.id}
                    </span>
                    <span className="text-[10px] font-mono text-[#71717A] uppercase tracking-widest">
                      Active Telemetry Panel
                    </span>
                  </div>
                  <h3 className="text-xl font-sans font-extrabold text-[#F4F4F5] mt-1.5 flex items-center">
                    {modalAgent.name}
                  </h3>
                  <p className="text-xs text-[#71717A] mt-0.5 uppercase tracking-wider font-mono">
                    {modalAgent.role}
                  </p>
                </div>
              </div>

              {/* Purpose & Tools Details */}
              <div className="mb-6 space-y-3">
                <div className="text-xs text-[#A1A1AA] leading-relaxed bg-[#121215] border border-[#27272A]/40 p-3 rounded-xl">
                  <div className="text-[10px] font-mono text-[#71717A] font-bold uppercase mb-1">Functional Purpose</div>
                  {modalAgent.purpose}
                </div>
                
                <div className="flex flex-wrap gap-1.5 items-center">
                  <span className="text-[10px] font-mono text-[#71717A] mr-1 uppercase">Allocated APIs/Tools:</span>
                  {modalAgent.tools.map((tool) => (
                    <span
                      key={tool}
                      className="text-[10px] font-mono px-2 py-0.5 bg-[#1C1C21] border border-[#27272A] text-[#E4E4E7] rounded-md font-semibold"
                    >
                      {tool}
                    </span>
                  ))}
                </div>
              </div>

              {/* Grid Metrics Breakdown */}
              <div className="grid grid-cols-3 gap-3 mb-6">
                <div className="bg-[#121215] border border-[#27272A]/40 p-3.5 rounded-xl text-center">
                  <span className="text-[9px] font-mono text-[#71717A] uppercase block">Workload Load</span>
                  <div className="text-lg font-sans font-black text-[#F4F4F5] mt-1 flex items-center justify-center space-x-1">
                    <Zap className="w-4 h-4 text-[#00A3FF]" />
                    <span>{modalAgent.load}%</span>
                  </div>
                </div>
                <div className="bg-[#121215] border border-[#27272A]/40 p-3.5 rounded-xl text-center">
                  <span className="text-[9px] font-mono text-[#71717A] uppercase block">Success SLA</span>
                  <div className="text-lg font-sans font-black text-[#10B981] mt-1 flex items-center justify-center space-x-1">
                    <ShieldCheck className="w-4 h-4 text-current" />
                    <span>{modalAgent.successRate}%</span>
                  </div>
                </div>
                <div className="bg-[#121215] border border-[#27272A]/40 p-3.5 rounded-xl text-center">
                  <span className="text-[9px] font-mono text-[#71717A] uppercase block">Latency rate</span>
                  <div className="text-lg font-sans font-black text-[#F59E0B] mt-1 flex items-center justify-center space-x-1">
                    <Clock className="w-4 h-4 text-current" />
                    <span>{modalAgent.latency}ms</span>
                  </div>
                </div>
              </div>

              {/* Active Errors Check */}
              <div className="mb-6">
                <span className="text-[10px] font-mono uppercase tracking-wider text-[#71717A] mb-2 block font-bold">Active Errors & Alerts</span>
                {modalErrors[selectedModalAgentId] && modalErrors[selectedModalAgentId].length > 0 ? (
                  <div className="space-y-2">
                    {modalErrors[selectedModalAgentId].map((err, idx) => (
                      <div
                        key={idx}
                        className="bg-rose-500/10 border border-rose-500/40 text-rose-300 text-xs px-3 py-2 rounded-xl flex items-start space-x-2.5"
                      >
                        <AlertTriangle className="w-4 h-4 text-[#EF4444] shrink-0 mt-0.5" />
                        <span className="font-mono">{err}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-[#10B981]/15 border border-[#10B981]/25 text-[#10B981] text-xs px-3 py-2.5 rounded-xl flex items-center space-x-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span className="font-sans font-medium">All telemetry and SLA targets aligned. Zero current active faults.</span>
                  </div>
                )}
              </div>

              {/* Recent Agent Logs */}
              <div className="mb-6">
                <span className="text-[10px] font-mono uppercase tracking-wider text-[#71717A] mb-2 block font-bold">Recent Telemetry Routing Logs</span>
                <div className="h-40 bg-[#0C0C0E] border border-[#27272A] rounded-xl p-3.5 overflow-y-auto space-y-1.5 font-mono text-[11px] text-[#A1A1AA] select-text scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
                  {(modalLogs[selectedModalAgentId] || []).map((log, idx) => (
                    <div key={idx} className="whitespace-pre-wrap leading-relaxed">
                      {log.includes('SUCCESS') ? (
                        <span className="text-[#10B981]">{log}</span>
                      ) : log.includes('WARN') ? (
                        <span className="text-[#F59E0B]">{log}</span>
                      ) : (
                        log
                      )}
                    </div>
                  ))}
                  {isRerunningAgent && (
                    <div className="text-[#00A3FF] animate-pulse flex items-center space-x-1.5">
                      <Terminal className="w-3.5 h-3.5 animate-spin" />
                      <span>Re-evaluating neural routing networks. Pinging SRE health checks...</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Actions Footer */}
              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-[#27272A]/60">
                <button
                  type="button"
                  onClick={() => setSelectedModalAgentId(null)}
                  className="px-4 py-2 bg-[#121215] border border-[#27272A] hover:bg-[#1C1C21] text-xs font-bold text-[#E4E4E7] uppercase tracking-wider rounded-xl transition cursor-pointer"
                >
                  Close Console
                </button>
                <button
                  type="button"
                  disabled={isRerunningAgent}
                  onClick={() => handleRerunModalAgent(selectedModalAgentId)}
                  className={`px-5 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition duration-200 flex items-center space-x-2 cursor-pointer ${
                    isRerunningAgent
                      ? 'bg-[#1C1C21] border border-[#27272A] text-[#71717A]'
                      : 'bg-[#00A3FF] hover:bg-[#38BDF8] text-black shadow-[0_0_12px_rgba(0,163,255,0.2)]'
                  }`}
                >
                  <RotateCcw className={`w-3.5 h-3.5 ${isRerunningAgent ? 'animate-spin' : ''}`} />
                  <span>{isRerunningAgent ? 'Executing Rerun...' : 'Rerun Node Analysis'}</span>
                </button>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Floating SRE Visual Alarm Toast notifications */}
      {(() => {
        const lastUnresolvedAlert = alerts.find((a) => !a.resolved);
        if (!lastUnresolvedAlert) return null;
        return (
          <AnimatePresence>
            <motion.div
              initial={{ opacity: 0, x: 85, y: 15 }}
              animate={{ opacity: 1, x: 0, y: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="fixed bottom-6 right-6 z-50 max-w-sm w-[340px] bg-[#09090B]/98 border border-rose-500/50 rounded-2xl p-4 shadow-[0_15px_35px_rgba(239,68,68,0.22)] backdrop-blur-md select-none"
            >
              <div className="absolute inset-x-0 bottom-0 h-1 bg-rose-500 animate-pulse rounded-b-2xl" />
              <div className="flex items-start space-x-3">
                <div className="p-2 bg-rose-500/15 border border-rose-500/30 rounded-xl text-rose-400 shrink-0">
                  <AlertTriangle className="w-5 h-5 animate-pulse" />
                </div>
                <div className="min-w-0 flex-1 text-left">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-mono text-rose-400 font-black uppercase tracking-widest flex items-center space-x-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping inline-block" />
                      <span>SLA BREACH ALERT</span>
                    </span>
                    <span className="text-[8px] font-mono text-zinc-500">{lastUnresolvedAlert.timestamp}</span>
                  </div>
                  <h4 className="text-xs font-sans font-bold text-[#F4F4F5] mt-1.5 truncate">
                    {lastUnresolvedAlert.agentName} ({lastUnresolvedAlert.agentId})
                  </h4>
                  <p className="text-[10px] font-mono text-rose-300 mt-1 leading-relaxed">
                    {lastUnresolvedAlert.metric === 'successRate'
                      ? `Success rate fell to ${lastUnresolvedAlert.value}% (Must be >= 80.00%)`
                      : `Latency spiked to ${lastUnresolvedAlert.value}ms (Configured threshold: ${lastUnresolvedAlert.limit}ms)`}
                  </p>
                  
                  <div className="flex items-center justify-end space-x-2 mt-4 pt-2 border-t border-zinc-800/50">
                    <button
                      type="button"
                      onClick={() => {
                        setAlerts((prev) =>
                          prev.map((al) => (al.id === lastUnresolvedAlert.id ? { ...al, resolved: true } : al))
                        );
                        addLog(`[SRE] Manually quieted/muted SLA threshold breach on agent ${lastUnresolvedAlert.agentId}`);
                      }}
                      className="px-2.5 py-1 text-[9px] font-mono text-zinc-400 hover:text-white uppercase tracking-wider font-extrabold hover:bg-zinc-800/30 rounded transition cursor-pointer"
                    >
                      Quiet
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedModalAgentId(lastUnresolvedAlert.agentId);
                      }}
                      className="px-3 py-1.5 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 font-sans font-bold rounded-lg text-[9px] uppercase tracking-wider transition cursor-pointer flex items-center space-x-1 ml-1"
                    >
                      Inquire & Repair
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        );
      })()}

    </div>
  );
}
