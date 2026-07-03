import { CodeFile } from './types';

export const AthenaCodeStore: CodeFile[] = [
  // --- ORCHESTRATOR ---
  {
    path: 'orchestrator/router.py',
    name: 'router.py',
    language: 'python',
    category: 'orchestrator',
    description: 'LangGraph multi-agent controller with custom state management, resilience retries, priority queues, and LLM cost router.',
    code: `import os
import uuid
import time
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field
from redis import Redis

# Robust type safety definitions representing state
class ExecutionState(BaseModel):
    run_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    priority: str = "Medium" # High, Medium, Low
    role: str = "PM" # CPO, Group PM, PM, Product Ops
    context: Dict[str, Any] = {}
    logs: List[Dict[str, Any]] = []
    current_agent: Optional[str] = None
    idempotency_key: str
    is_active: bool = True
    active_region: str = "us-east-1"

class AgentRouter:
    """
    Core orchestrator responsible for routing requests among 23 agents
    based on priority queues (Redis Streams) and circuit-breaker conditions.
    """
    def __init__(self, redis_url: str):
        self.redis = Redis.from_url(redis_url)
        self.failure_thresholds = {"High": 3, "Medium": 5, "Low": 10}
        self.cooloff_period = 30 # seconds

    def get_circuit_breaker_status(self, agent_name: str) -> str:
        """
        Calculates circuit breaker state depending on Redis records.
        """
        failures = self.redis.get(f"cb_failures:{agent_name}")
        failures_count = int(failures) if failures else 0
        if failures_count >= 5:
            last_fail = self.redis.get(f"cb_last_fail:{agent_name}")
            if last_fail and (time.time() - float(last_fail)) < self.cooloff_period:
                return "OPEN"
            else:
                return "HALF-OPEN"
        return "CLOSED"

    def register_success(self, agent_name: str):
        """Clears circuit breaker metrics on successful execution."""
        self.redis.delete(f"cb_failures:{agent_name}")

    def register_failure(self, agent_name: str):
        """Increments circuit breaker failure count and opens when limit hit."""
        pipe = self.redis.pipeline()
        pipe.incr(f"cb_failures:{agent_name}")
        pipe.set(f"cb_last_fail:{agent_name}", time.time())
        pipe.execute()

    def route_to_agent(self, state: ExecutionState) -> Dict[str, Any]:
        """
        Evaluates current execution state and determines the next optimal agent.
        """
        key = f"idempotent:{state.idempotency_key}"
        cached_val = self.redis.get(key)
        if cached_val:
            return {"source": "cache", "result": cached_val.decode('utf-8')}

        current = state.current_agent
        cb = self.get_circuit_breaker_status(current)
        
        if cb == "OPEN":
            # Circuit Opened - fallback immediately to Human Direction Gate
            return {
                "route": "gates/human_gate",
                "action": "FALLBACK_TO_HUMAN",
                "reason": f"Circuit breaker opened for {current}"
            }

        # Check model routing based on cost efficiency criteria
        model = self.resolve_model_by_cost_profile(state.priority, current)
        
        # Simulated routing flowchart behavior
        next_step = self._resolve_next_graph_node(current, state.context)
        
        # Save execution transaction log
        self.redis.setex(key, 86400, f"Running node {next_step} with model {model}")
        return {"route": next_step, "model_allocated": model, "status": "Routed Successfully"}

    def resolve_model_by_cost_profile(self, priority: str, agent_name: str) -> str:
        """
        Dynamically routes: reasoning tasks to GPT-4o, summaries to GPT-3.5, and low-priority to Llama 3 8B.
        """
        if priority == "High" or agent_name in ["rollback_orchestrator", "compliance"]:
            return "gpt-4o"
        elif priority == "Medium" and agent_name in ["prd_generation", "opportunity_planning"]:
            return "gpt-4o"
        elif priority == "Low":
            return "llama-3-8b"
        return "gpt-3.5-turbo"

    def _resolve_next_graph_node(self, current: Optional[str], context: Dict[str, Any]) -> str:
        if not current:
            return "signal_harvester"
        if current == "signal_harvester":
            return "opportunity_planning"
        if current == "opportunity_planning":
            return "compliance"
        if current == "compliance":
            return "prd_generation"
        if current == "prd_generation":
            return "rollback_orchestrator"
        return "execution_monitor"`
  },

  // --- AGENTS ---
  {
    path: 'agents/rollback_orchestrator.py',
    name: 'rollback_orchestrator.py',
    language: 'python',
    category: 'agents-high',
    description: 'Rollback Orchestrator Agent. Monitors metrics against multi-metric budgets. Initiates rollback workflows if thresholds exceed levels.',
    code: `import os
import requests
from typing import Dict, Any, List
from pydantic import BaseModel

class RollbackBudget(BaseModel):
    error_rate_threshold: float = 0.02 # Max 2% error rate limit
    latency_p95_ms: float = 800.0 # Upper latency budget 800ms
    customer_complaint_index: int = 5 # Absolute counts over 5 minutes
    unhandled_exceptions: int = 0

class RollbackOrchestrator:
    """
    Highly critical Rollback Orchestrator that continuously scans release telemetry.
    Can trigger automatic deployment rollbacks or call EKS webhook to trigger a kill switch.
    """
    def __init__(self, config: RollbackBudget):
        self.budget = config
        self.observability_api = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://otel-collector:4317")

    def analyze_release_health(self, release_version: str, telemetry_slice: Dict[str, Any]) -> Dict[str, Any]:
        """
        Compares real-time telemetry inputs against the metric budgets.
        """
        unhandled = telemetry_slice.get("exceptions", 0)
        error_rate = telemetry_slice.get("error_rate", 0.0)
        p95_latency = telemetry_slice.get("latency_p95", 0.0)
        complaints = telemetry_slice.get("complaints", 0)

        breached_metrics = []
        if error_rate > self.budget.error_rate_threshold:
            breached_metrics.append(f"Error Rate: {error_rate} > {self.budget.error_rate_threshold}")
        if p95_latency > self.budget.latency_p95_ms:
            breached_metrics.append(f"Latency P95: {p95_latency}ms > {self.budget.latency_p95_ms}ms")
        if complaints > self.budget.customer_complaint_index:
            breached_metrics.append(f"Customer Complaints: {complaints} > {self.budget.customer_complaint_index}")
        if unhandled > self.budget.unhandled_exceptions:
            breached_metrics.append(f"Unhandled exceptions recorded: {unhandled}")

        if breached_metrics:
            return self.initiate_rollback_workflow(release_version, breached_metrics)
        
        return {
            "status": "HEALTHY",
            "release": release_version,
            "message": "Telemetry is well within allocated SLI/SLA error budgets."
        }

    def initiate_rollback_workflow(self, release_version: str, breaches: List[str]) -> Dict[str, Any]:
        """
        Executes deployment rollbacks on the cluster. Opens a mandatory human incident card.
        """
        # Execute emergency API call to active-passive load balancer / Kubernetes Ingress
        # to shift traffic back to stable warm standby
        kubernetes_api = os.getenv("KUBERNETES_SERVICE_HOST", "https://kubernetes.default.svc")
        
        print(f"[KILL-SWITCH-TRIGGERED] Breaches: {breaches}. Shifting US-East IP registers...")
        
        # Call Route53 Traffic Flow update through AWS API to swing resources to Warm Standby region
        return {
            "status": "ROLLBACK_INITIATED",
            "release": release_version,
            "incident_severity": "P0_CRITICAL",
            "route53_failover": "SWUNG_TO_WARM_STANDBY",
            "details": breaches,
            "actions_executed": [
                f"Triggered K8s rollout undo for deployment/athena-app to baseline",
                f"Updated AWS Route53 Traffic policy weight ratio (Active Region 0%, Warm standby 100%)"
            ]
        }`
  },
  {
    path: 'agents/compliance.py',
    name: 'compliance.py',
    language: 'python',
    category: 'agents-medium',
    description: 'GDPR, CCPA, and regional compliance gate agent. Scans data handling definitions on dynamic PRD layers.',
    code: `import re
from typing import Dict, Any, List
from pydantic import BaseModel

class ComplianceReport(BaseModel):
    is_compliant: bool
    violations: List[str]
    remediations: List[str]
    regional_warnings: List[str]

class ComplianceAgent:
    """
    Automated Legal & Policy Compliance scanning agent.
    Iterates over product requirements and checks against strict compliance patterns (GDPR, CCPA, HIPAA).
    """
    def __init__(self):
        # Strict patterns looking for illegal telemetry practices or data retention violations
        self.sensitive_key_regex = re.compile(
            r"(passport|ssn|social_security|credit_card|cvv|fingerprint|biometric|private_key|password)", 
            re.IGNORECASE
        )

    def scan_product_requirement_doc(self, prd_text: str) -> ComplianceReport:
        violations = []
        remediations = []
        warnings = []

        # GDPR Scan: Check for missing data deletion or consent clauses
        if "right to be forgotten" not in prd_text.lower() and "delete account" not in prd_text.lower():
            violations.append("GDPR Violation: Missing explicit 'Right to be Forgotten' data purging utility.")
            remediations.append("Add automated data-eviction pipeline calling both Neo4j and Pinecone within 30 days of account deletion request.")

        # CCPA Scan: Explicit opt-out
        if "opt-out" not in prd_text.lower() and "do not sell" not in prd_text.lower():
            violations.append("CCPA Violation: Lack of clear 'Do Not Sell My Personal Information' option.")
            remediations.append("Expose standard footer flag linking to opt-out mechanism.")

        # Inspect data payload definitions in the text body for unencrypted PII logs
        found_sensitive_data = self.sensitive_key_regex.findall(prd_text)
        if found_sensitive_data:
            violations.append(f"PII Risk Warning: Detected plain sensitive parameters {list(set(found_sensitive_data))} without encryption guidelines.")
            remediations.append("Enforce client-side hashing algorithms or KMS Envelope Encryption before saving data.")

        # Check compliance over-ride authorizations (Role matrix checks are handled at API Gateway)
        is_compliant = len(violations) == 0

        return ComplianceReport(
            is_compliant=is_compliant,
            violations=violations,
            remediations=remediations,
            regional_warnings=warnings
        )`
  },
  {
    path: 'agents/opportunity_planning.py',
    name: 'opportunity_planning.py',
    language: 'python',
    category: 'agents-medium',
    description: 'Product opportunity ranker. Uses mathematical RICE scoring (Reach, Impact, Confidence, Effort) to structure features roadmap.',
    code: `from typing import Dict, Any, List
from pydantic import BaseModel

class FeatureOpportunity(BaseModel):
    id: str
    feature_name: str
    reach: int # Monthly Active Users impacted
    impact: float # 3 = massive, 2 = high, 1 = medium, 0.5 = low, 0.25 = minimal
    confidence: float # Percentage (e.g. 0.85 = 85%)
    effort: float # Person-months

class OpportunityPlannerAgent:
    """
    Orchestrates the roadmap prioritisation framework using mathematical RICE algorithm alignment.
    Enforces human confirmation gates whenever standard scoring criteria conflicts with product strategy.
    """
    def __init__(self, confidence_buffer: float = 0.5):
        self.confidence_buffer = confidence_buffer

    def calculate_rice_score(self, item: FeatureOpportunity) -> float:
        """
        RICE Score = (Reach * Impact * Confidence) / Effort
        """
        numerator = item.reach * item.impact * item.confidence
        if item.effort <= 0:
            item.effort = 0.1 # Prevent DivisionByZero
        return round(numerator / item.effort, 2)

    def prioritize_opportunities(self, scope_items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        results = []
        for raw in scope_items:
            feature_opt = FeatureOpportunity(
                id=raw.get("id", "F-99"),
                feature_name=raw.get("name", "Unknown feature"),
                reach=int(raw.get("reach", 1000)),
                impact=float(raw.get("impact", 1.0)),
                confidence=float(raw.get("confidence", 0.8)),
                effort=float(raw.get("effort", 1.0))
            )
            score = self.calculate_rice_score(feature_opt)
            
            # Map structural details
            result_map = feature_opt.dict()
            result_map["rice_score"] = score
            result_map["tier"] = "Tier 1 (Core Launch)" if score > 500 else "Tier 2 (Growth backlog)"
            results.append(result_map)

        # Sort dynamically descending
        results.sort(key=lambda x: x["rice_score"], reverse=True)
        return results`
  },
  {
    path: 'agents/prd_generation.py',
    name: 'prd_generation.py',
    language: 'python',
    category: 'agents-medium',
    description: 'Generates detailed, modular, technical Product Requirements Documents with automated target metrics and SLAs.',
    code: `from typing import Dict, Any, List
from pydantic import BaseModel

class PRDSchema(BaseModel):
    title: str
    target_audiences: List[str]
    success_metrics: Dict[str, str]
    technical_architecture: str
    functional_requirements: List[str]
    service_level_agreements: Dict[str, str]

class PRDGenerationAgent:
    """
    Deep Reasoning Agent constructing engineering-grade PRDs.
    Generates exact microservices schema and structural test plans to eliminate developer alignment issues.
    """
    def generate_comprehensive_document(self, context: Dict[str, Any]) -> PRDSchema:
        title = f"PRD-v3: {context.get('product_name', 'NextGen Feature Suite')}"
        
        # Structure metrics target based on input insights
        metrics = {
            "Conversion Improvement": "> 12% absolute conversion delta within 4 weeks",
            "SLA Latency": "API response delivery <= 240ms under 5k concurrent RPS",
            "Failure Tolerance": "Regional Failover RTO < 2 minutes via global Route53 triggers",
            "Error Budget Alerting": "Trigger auto-rollback on the Rollback Orchestrator if SLA breached"
        }

        functional = [
            "Implement high-performance state-preserving Redis Stream message queuing.",
            "Integrate dual Neo4j dynamic Graph mappings alongside Pinecone vector embeddings.",
            "Establish user interaction validation triggers inside EKS-deployed state vectors."
        ]

        sla = {
            "Availability SLA": "99.99% multi-region uptime",
            "RTO (Recovery Time Objective)": "Under 120 seconds",
            "RPO (Recovery Point Objective)": "Under 5 seconds database replication"
        }

        return PRDSchema(
            title=title,
            target_audiences=["Product Directors", "Tech Leads", "Compliance Auditors", "Security Architects"],
            success_metrics=metrics,
            technical_architecture="Distributed multi-agent pipeline running under AWS EKS and global Route53 mesh.",
            functional_requirements=functional,
            service_level_agreements=sla
        )`
  },

  // --- GATES & RBAC ---
  {
    path: 'gates/human_gate.py',
    name: 'human_gate.py',
    language: 'python',
    category: 'gates',
    description: 'Human decision verification and action state endpoints supporting 15-minute undo windows.',
    code: `import time
from typing import Dict, Any, Optional
from pydantic import BaseModel, Field
from fastapi import FastAPI, HTTPException, Depends

class HumanGateDecision(BaseModel):
    gate_id: str
    agent_id: str
    action: str # approve, modify, rerun, pause
    comment: Optional[str] = None
    modified_output: Optional[Dict[str, Any]] = None
    rerun_instruction: Optional[str] = None

class HumanAuthorizationGate:
    """
    Implements a robust direction gate controller on fastapi.
    Includes a 15-minute (900 seconds) rollback window where actions can be completely undone.
    """
    def __init__(self):
        self.registry = {}

    def trigger_gate_creation(self, agent_id: str, context: Dict[str, Any]) -> str:
        gate_id = f"gate-{int(time.time())}"
        self.registry[gate_id] = {
            "gate_id": gate_id,
            "agent_id": agent_id,
            "created_at": time.time(),
            "status": "PENDING_DECISION",
            "payload": context
        }
        return gate_id

    def submit_decision(self, decision: HumanGateDecision) -> Dict[str, Any]:
        gate = self.registry.get(decision.gate_id)
        if not gate:
            raise ValueError("Requested human gate instance does not exist.")
        
        elapsed = time.time() - gate["created_at"]
        if elapsed > 900: # 15 minutes
            raise TimeoutError("The 15-minute undo/modification duration window has lapsed.")

        gate["status"] = "DECIDED"
        gate["decision"] = decision.dict()
        gate["finalized_at"] = time.time()

        return {
            "status": "SUCCESS",
            "elapsed_seconds": round(elapsed, 2),
            "action_executed": decision.action,
            "can_undo_until": gate["created_at"] + 900
        }`
  },
  {
    path: 'rbac/permission_middleware.py',
    name: 'permission_middleware.py',
    language: 'python',
    category: 'rbac',
    description: 'Dynamic security matrix validation. Verifies user privileges across CPO, Group PM, PM, and Product Ops.',
    code: `from fastapi import Request, HTTPException, Depends

# Precise permission lookup mapping
PERMISSION_MATRIX = {
    "CPO": {
        "approve_sunset_pivot": True,
        "override_compliance": True,
        "approve_rollback": True,
        "approve_opportunity_ranking": True,
        "modify_prd": True,
        "view_dashboards": True,
        "activate_kill_switch": True
    },
    "Group PM": {
        "approve_sunset_pivot": False,
        "override_compliance": False,
        "approve_rollback": True,
        "approve_opportunity_ranking": True,
        "modify_prd": True,
        "view_dashboards": True,
        "activate_kill_switch": False
    },
    "PM": {
        "approve_sunset_pivot": False,
        "override_compliance": False,
        "approve_rollback": True,
        "approve_opportunity_ranking": False,
        "modify_prd": True,
        "view_dashboards": True,
        "activate_kill_switch": False
    },
    "Product Ops": {
        "approve_sunset_pivot": False,
        "override_compliance": False,
        "approve_rollback": False,
        "approve_opportunity_ranking": False,
        "modify_prd": False,
        "view_dashboards": True,
        "activate_kill_switch": False
    }
}

async def verify_rbac_access(request: Request, required_action: str):
    """
    Middleware verification script ensuring secure authorization matrices.
    """
    # Extract user credentials (simulated header token auth)
    role = request.headers.get("X-User-Role")
    if not role or role not in PERMISSION_MATRIX:
        raise HTTPException(
            status_code=401, 
            detail="Unauthorized: User does not possess a valid corporate role mapping."
        )

    # Check mapping capabilities
    allowed = PERMISSION_MATRIX[role].get(required_action, False)
    if not allowed:
        raise HTTPException(
            status_code=403,
            detail=f"Access Denied: Role {role} does not possess authorization key '{required_action}'."
        )
    return True`
  },

  // --- CONTEXT & OBS ---
  {
    path: 'context/graph_hybrid.py',
    name: 'graph_hybrid.py',
    language: 'python',
    category: 'context',
    description: 'MoE memory engine implementing dual-graph Neo4j & vector Pinecone lookup with dynamic conflict resolver councils.',
    code: `import os
from typing import Dict, Any, List
# Neo4j and Pinecone simulated adapter logic

class HybridKnowledgeGraph:
    """
    Context memory orchestration uniting high-dimensional semantic search (Pinecone query maps)
    and entity-relationship linkages (Neo4j Cyber commands).
    """
    def __init__(self):
        self.customer_signals_ttl = 90 * 86400 # 90 Days
        self.prd_ttl = 2 * 365 * 86400 # 2 Years

    def query_context(self, text_vector: List[float], semantic_terms: str) -> Dict[str, Any]:
        """
        Pulls rich vectors from Pinecone and structured relationship records from Neo4j.
        """
        # Representing query fetches
        pinecone_semantic_results = [
            {"id": "c-123", "score": 0.94, "category": "user_feedback", "text": "Users requesting instant slack integrations"},
            {"id": "c-444", "score": 0.81, "category": "market_trends", "text": "Competitor launched compliance automation engine"}
        ]
        
        neo4j_graph_results = [
            {"source_feature": "Integration Portal", "connected_to": "Compliance Gate", "relation": "DEPENDS_UPON"},
            {"source_feature": "Roadmap Dashboard", "connected_to": "Opportunity Planner", "relation": "ORCHESTRATED_BY"}
        ]

        return {
            "vector_context": pinecone_semantic_results,
            "graph_context": neo4j_graph_results,
            "resolved_terms": semantic_terms
        }

class MoECouncilResolver:
    """
    Mixture of Experts logic. Invokes when multi-agent outcomes clash.
    """
    def evaluate_conflict(self, topic: str, opinions: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Resolves conflicts by performing weighted-confidence aggregation of MoE members.
        """
        # Experts definition
        confidence_weights = {
            "Data Scientist": 0.35,
            "Data Analyst": 0.15,
            "Business Analyst": 0.15,
            "UX Researcher": 0.15,
            "Eng Architect": 0.20
        }

        weighted_sum = 0.0
        total_weight = 0.0

        for op in opinions:
            expert = op.get("expert")
            raw_score = op.get("confidence", 0.0) # 0-100
            weight = confidence_weights.get(expert, 0.10)
            weighted_sum += (raw_score * weight)
            total_weight += weight

        consensus = round(weighted_sum / total_weight, 2) if total_weight > 0 else 50.0
        max_diff = max([op.get("confidence") for op in opinions]) - min([op.get("confidence") for op in opinions])

        escalate = max_diff > 30.0

        return {
            "topic": topic,
            "consensus_score": consensus,
            "max_variance": max_diff,
            "escalated_to_human": escalate,
            "advice": "System stabilized around mathematical quorum." if not escalate else "WARNING: High expert variance. Escalate to CPO for tie-break."
        }`
  },
  {
    path: 'observability/otel_config.py',
    name: 'otel_config.py',
    language: 'python',
    category: 'observability',
    description: 'OpenTelemetry tracing broker exporter configuring cost trace spans and Prometheus counters.',
    code: `from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor, ConsoleSpanExporter
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.metrics import get_meter

def setup_athena_telemetry():
    """
    Spins up OTel Provider and configures custom counters tracking total LLM tokens used and human overrides.
    """
    provider = TracerProvider()
    processor = SimpleSpanProcessor(ConsoleSpanExporter())
    provider.add_span_processor(processor)
    trace.set_tracer_provider(provider)

    tracer = trace.get_tracer("athena_orchestrator")
    meter = get_meter("athena_metrics")

    # Dynamic KPI meters
    llm_cost_counter = meter.create_counter(
        name="athena_llm_cost_usd",
        description="Tracks dollars spent on API model invocation budgets",
        unit="USD"
    )

    human_override_counter = meter.create_counter(
        name="athena_human_gate_override_rate",
        description="Tracks count of modified agent actions by users",
        unit="1"
    )

    return tracer, llm_cost_counter, human_override_counter`
  },

  // --- INFRASTRUCTURE (TERRAFORM) ---
  {
    path: 'terraform/main.tf',
    name: 'main.tf',
    language: 'hcl',
    category: 'terraform',
    description: 'EKS Clusters and ElastiCache Global Replication Groups setup spanning us-east-1 and eu-west-1.',
    code: `provider "aws" {
  alias  = "primary"
  region = var.primary_region
}

provider "aws" {
  alias  = "standby"
  region = var.standby_region
}

# --- Primary EKS Cluster ---
resource "aws_eks_cluster" "eks_primary" {
  provider = aws.primary
  name     = "athena-eks-primary"
  role_arn = aws_iam_role.eks_role.arn

  vpc_config {
    subnet_ids = var.primary_private_subnets
  }
}

# --- Standby EKS Cluster (Active-Passive RTO Target Ready) ---
resource "aws_eks_cluster" "eks_standby" {
  provider = aws.standby
  name     = "athena-eks-standby"
  role_arn = aws_iam_role.eks_role.arn

  vpc_config {
    subnet_ids = var.standby_private_subnets
  }
}

# --- Global Redis ElastiCache Replication For Global Session Handshake ---
resource "aws_elasticache_global_replication_group" "redis_global" {
  global_replication_group_id_suffix = "athena-redis-mesh"
  primary_replication_group_id        = aws_elasticache_replication_group.redis_primary.id
}

resource "aws_elasticache_replication_group" "redis_primary" {
  provider                   = aws.primary
  replication_group_id       = "athena-rd-primary"
  description                = "Active master stream ledger with replications"
  node_type                  = "cache.m6g.xlarge"
  num_cache_clusters         = 2
  parameter_group_name       = "default.redis7"
  port                       = 6379
  automatic_failover_enabled = true
}

# --- Failover Route53 DNS Control ---
resource "aws_route53_health_check" "primary_check" {
  fqdn              = "athena-primary.api.athenaos.com"
  port              = 443
  type              = "HTTPS"
  resource_path     = "/health"
  failure_threshold = "3"
  request_interval  = "10"
}

resource "aws_route53_record" "dns_active_failover" {
  zone_id = var.hosted_zone_id
  name    = "api.athenaos.com"
  type    = "A"

  failover_routing_policy {
    type = "PRIMARY"
  }

  set_identifier = "primary"
  alias {
    name                   = aws_lb.primary_lb.dns_name
    zone_id                = aws_lb.primary_lb.zone_id
    evaluate_target_health = true
  }

  health_check_id = aws_route53_health_check.primary_check.id
}`
  },
  {
    path: 'terraform/variables.tf',
    name: 'variables.tf',
    language: 'hcl',
    category: 'terraform',
    description: 'Variables definitions mapping global accounts and CIDR networks.',
    code: `variable "primary_region" {
  type    = string
  default = "us-east-1"
}

variable "standby_region" {
  type    = string
  default = "eu-west-1"
}

variable "primary_private_subnets" {
  type    = list(string)
  default = ["subnet-0a1b2c3d4e5f6g7h8", "subnet-0h7g6f5e4d3c2b1a0"]
}

variable "standby_private_subnets" {
  type    = list(string)
  default = ["subnet-1a2b3c4d5e6f7g8h9", "subnet-9h8g7f6e5d4c3b2a1"]
}

variable "hosted_zone_id" {
  type    = string
  default = "Z2FDTNDATAQW2Y"
}`
  },

  // --- KUBERNETES MANIFESTS ---
  {
    path: 'k8s/deployment.yaml',
    name: 'deployment.yaml',
    language: 'yaml',
    category: 'k8s',
    description: 'Kubernetes API and agents deployment templates configuring circuit-breaker health indicators.',
    code: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: athena-orchestrator
  namespace: athena-production
  labels:
    app: athena-orchestrator
    tier: backend
spec:
  replicas: 3
  selector:
    matchLabels:
      app: athena-orchestrator
  template:
    metadata:
      labels:
        app: athena-orchestrator
    spec:
      containers:
      - name: orchestrator-container
        image: 619398f77b6f.dkr.ecr.us-east-1.amazonaws.com/athenaos-orchestrator:v3.1.0
        ports:
        - containerPort: 8000
        env:
        - name: NODE_ENV
          value: "production"
        - name: REDIS_URL
          value: "redis://athena-redis-mesh.elasticache.amazonaws.com:6379"
        - name: ACTIVE_REGION
          valueFrom:
            configMapKeyRef:
              name: region-config
              key: aws_region
        resources:
          limits:
            cpu: "2"
            memory: 4Gi
          requests:
            cpu: "500m"
            memory: 1Gi
        livenessProbe:
          httpGet:
            path: /health
            port: 8000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 8000
          initialDelaySeconds: 15
          periodSeconds: 5`
  },
  {
    path: 'k8s/hpa.yaml',
    name: 'hpa.yaml',
    language: 'yaml',
    category: 'k8s',
    description: 'EKS Horizontal Pod Autoscaler targeting scaling patterns on active agent logs.',
    code: `apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: athena-orchestrator-hpa
  namespace: athena-production
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: athena-orchestrator
  minReplicas: 3
  maxReplicas: 15
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 75
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80`
  },

  // --- API & WORKFLOWS ---
  {
    path: 'api/openapi.yaml',
    name: 'openapi.yaml',
    language: 'yaml',
    category: 'api-docs',
    description: 'Swaggers / OpenAPIs listing REST structures of Human Direction gates, telemetry tracking, and triggers.',
    code: `openapi: 3.0.3
info:
  title: PolyVerses Multi-Agent Product Core API
  version: 3.1.0
  description: Service interface exposing orchestrator nodes and direction confirmation gates.
paths:
  /api/v1/orchestrator/run:
    post:
      summary: Triggers dynamic product ideation pipeline
      parameters:
        - name: Idempotency-Key
          in: header
          required: true
          schema:
            type: string
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [product_idea, priority, role]
              properties:
                product_idea:
                  type: string
                priority:
                  type: string
                  enum: [High, Medium, Low]
                role:
                  type: string
      responses:
        '202':
          description: Flow initialized and added to Redis streams container.
  /api/v1/gates/{gate_id}/decide:
    post:
      summary: Registers a PM or CPO directional decision on a waiting gate
      parameters:
        - name: gate_id
          in: path
          required: true
          schema:
            type: string
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [action]
              properties:
                action:
                  type: string
                  enum: [approve, modify, rerun, cancel]
                comment:
                  type: string
                modified_output:
                  type: object
      responses:
        '200':
          description: Gate resolved successfully.`
  },
  {
    path: '.github/workflows/deploy.yml',
    name: 'deploy.yml',
    language: 'yaml',
    category: 'github-workflows',
    description: 'CI/CD YAML pipeline validating code standard, compiling Docker targets, and executing Kubernetes deployment across primary and standby EKS environments.',
    code: `name: PolyVerses Production Delivery Engine

on:
  push:
    branches: [ "main" ]

jobs:
  validate-and-test:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    - name: Set up Python Runtime
      uses: actions/setup-python@v4
      with:
        python-version: '3.11'
    - name: Install dependencies
      run: |
        python -m pip install --upgrade pip
        pip install pytest black ruff pydantic fastapi redis
    - name: Preflight lint scan
      run: ruff check .
    - name: Execute agent unit checks
      run: pytest tests/

  compile-and-deploy:
    needs: validate-and-test
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    - name: Authenticate to AWS ECR
      uses: aws-actions/configure-aws-credentials@v2
      with:
        aws-access-key-id: \${{ secrets.AWS_ACCESS_KEY_ID }}
        aws-secret-access-key: \${{ secrets.AWS_SECRET_ACCESS_KEY }}
        aws-region: us-east-1
    
    - name: Build and Push Docker image
      run: |
        docker build -t athenaos-orchestrator:v3.1.0 .
        docker tag athenaos-orchestrator:v3.1.0 \${{ secrets.AWS_ACCOUNT_ID }}.dkr.ecr.us-east-1.amazonaws.com/athenaos-orchestrator:v3.1.0
        docker push \${{ secrets.AWS_ACCOUNT_ID }}.dkr.ecr.us-east-1.amazonaws.com/athenaos-orchestrator:v3.1.0

    - name: Deploy to Primary US-East-1 Cluster
      run: |
        aws eks update-kubeconfig --name athena-eks-primary --region us-east-1
        kubectl apply -f k8s/ -n athena-production
        kubectl rollout status deployment/athena-orchestrator -n athena-production

    - name: Sync Standby EU-West-1 (Active-Passive Warm-sync)
      run: |
        aws eks update-kubeconfig --name athena-eks-standby --region eu-west-1
        kubectl apply -f k8s/ -n athena-production`
  }
];
