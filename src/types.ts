export interface Agent {
  id: string;
  name: string;
  priority: 'High' | 'Medium' | 'Low';
  role: string;
  description: string;
  tools: string[];
  status: 'idle' | 'running' | 'completed' | 'waiting' | 'failed';
}

export interface WorkflowStep {
  id: string;
  agentId: string;
  agentName: string;
  action: string;
  timestamp: string;
  output: string;
  status: 'success' | 'warning' | 'error' | 'pending';
  priority: 'High' | 'Medium' | 'Low';
  confidenceScore?: number;
}

export interface HumanGate {
  id: string;
  agentId: string;
  agentName: string;
  title: string;
  description: string;
  type: 'approve' | 'modify' | 'rerun' | 'pause';
  schema: any;
  agentOutput: any;
  status: 'pending' | 'approved' | 'modified' | 'rerun' | 'paused';
}

export interface ConflictResolution {
  id: string;
  topic: string;
  agentsInvolved: string[];
  recommendations: { agent: string; confidence: number; advice: string }[];
  consolidatedConfidence: number;
  esclatedToHuman: boolean;
  status: 'resolved' | 'escalated';
}

export interface SystemLog {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  source: string;
  message: string;
}

export interface CodeFile {
  path: string;
  name: string;
  language: string;
  category: 'orchestrator' | 'agents-high' | 'agents-medium' | 'agents-low' | 'gates' | 'context' | 'rbac' | 'observability' | 'terraform' | 'k8s' | 'github-workflows' | 'api-docs';
  code: string;
  description: string;
}

export interface MetricSnapshot {
  timestamp: string;
  apiCost: number;
  latencyMs: number;
  cpuPercent: number;
  activeThreads: number;
  humanOverrideRate: number;
  systemHealth: number;
}
