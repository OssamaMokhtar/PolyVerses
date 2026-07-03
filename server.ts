import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Instantiate Gemini API Client safely on the server side
  let ai: GoogleGenAI | null = null;
  const key = process.env.GEMINI_API_KEY;

  if (key && key !== "MY_GEMINI_API_KEY") {
    try {
      ai = new GoogleGenAI({
        apiKey: key,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });
      console.log("Server: Gemini API initialized successfully.");
    } catch (e) {
      console.error("Server: Failed to prepare GoogleGenAI client:", e);
    }
  } else {
    console.warn("Server: GEMINI_API_KEY is not defined in the environment. Sandbox fallback will be active.");
  }

  // --- API ROUTE FOR AGENT WORKFLOW EVALUATIONS ---
  app.post("/api/evaluate", async (req: express.Request, res: express.Response): Promise<void> => {
    const { prompt, priority, role, agentType, userContext } = req.body;

    const actualPriority = priority || "Medium";
    const actualRole = role || "PM";
    const inputPrompt = prompt || "Build structured Slack Integration feature";

    // In case API Key is missing, generate high-fidelity simulated outputs so the app remains pristine
    if (!ai) {
      const sandboxResponse = generateSandboxResponse(agentType, inputPrompt, actualPriority, actualRole, userContext);
      res.json({ text: sandboxResponse, sandbox: true });
      return;
    }

    try {
      let systemInstruction = "";
      let modelPrompt = "";

      if (agentType === "opportunity") {
        systemInstruction = "You are the specialized Opportunity Planning Agent of PolyVerses v3.1. Master of RICE prioritization (Reach, Impact, Confidence, Effort). Analyze the product concept and output a clean Markdown summary containing a comparative RICE scorecard (scoring Reach, Impact scale 1-3, Confidence percentage, Effort in months, and final rounded RICE Score). Present it in a sleek markdown table followed by a 2-bullet point strategic recommendation. Keep it within 300 words.";
        modelPrompt = `Evaluate this product idea: "${inputPrompt}". Role requested: ${actualRole}. Priority setting: ${actualPriority}. Construct the math metrics based on realistic product estimates.`;
      } else if (agentType === "compliance") {
        systemInstruction = "You are the automated Compliance Auditor Agent of PolyVerses v3.1. Expert in GDPR, CCPA, and global client-PII safeguards. Analyze the requested product concept and check for critical data handling compliance concerns. Output a Markdown document with three sections: 1. STRENGTHS (any compliance-positive structures), 2. WARNINGS (specific CCPA/GDPR/HIPAA telemetry or consent vulnerabilities found), and 3. DETAILED ACTIONABLE REMEDIATIONS (numbered steps to resolve, including Neo4j delete evictions and Pinecone text-hashing). Keep it highly professional and concise (under 300 words).";
        modelPrompt = `Scrub compliance safeguards on this product request: "${inputPrompt}". User parameters: [Role: ${actualRole}, Priority: ${actualPriority}].`;
      } else if (agentType === "prd") {
        systemInstruction = "You are the advanced PRD Generation Agent of PolyVerses v3.1. You author exhaustive, production-grade Product Requirements Documents. Output an elegant, highly structured markdown PRD containing: 1. Executive goals, 2. Target Audiences (PM, Eng, Ops), 3. Success telemetry Metrics (with precise targets), 4. Architectural requirements (EKS microservices, Redis priority streams), and 5. Precise Service Level Agreements (SLAs on multi-region RTO/RPO limits). Do not use placeholders. Write actual concrete metrics and logic matching the concept. Keep it under 500 words.";
        modelPrompt = `Generate the ultimate technical PRD for this concept: "${inputPrompt}". Active Role: ${actualRole}. Target priority weight: ${actualPriority}. Include robust engineering specifications.`;
      } else if (agentType === "rollback") {
        systemInstruction = "You are the critical Rollback Orchestrator Agent of PolyVerses v3.1. Monitor the performance matrix of the active deployment. Based on the user prompt, render a structured Markdown report highlighting simulated SRE telemetry health checks, error rates, p95 latencies, and explicit status representing whether the deployment is safe, at risk, or if an automated rollback workflow has been triggered. Keep it action-oriented and under 250 words.";
        modelPrompt = `Perform release error budget analysis on the concept: "${inputPrompt}" running on Active US-East cloud instances.`;
      } else {
        // Default Router Orchestrator
        systemInstruction = "You are the primary PolyVerses v3.1 Orchestrator Router. Guide the product leader on the multi-agent execution pipeline. Synthesize proactive insights regarding the input request and list how the 23-agent network will split duties to deliver. Mention the primary active-passive failover state for the database replica in us-east-1 and wewest-1. Keep it professional, motivating, and clean. Under 300 words.";
        modelPrompt = `Analyze the initial signals for this idea: "${inputPrompt}". State how the PolyVerses second-brain starts the orchestration.`;
      }

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: modelPrompt,
        config: {
          systemInstruction: systemInstruction,
          temperature: 0.7,
        }
      });

      const responseText = response.text || "Failed to retrieve generated response.";
      res.json({ text: responseText, sandbox: false });
    } catch (err: any) {
      console.error("Gemini invocation error, reverting to sandbox generator:", err);
      const fallback = generateSandboxResponse(agentType, inputPrompt, actualPriority, actualRole, userContext);
      res.json({ text: fallback, error: err.message, sandbox: true });
    }
  });

  // Serve static assets in production, hook dev server tools in development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: express.Request, res: express.Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server standing by on port ${PORT}`);
  });
}

// Sandbox high-fidelity response generator for backup / key-less runs
function generateSandboxResponse(type: string, prompt: string, priority: string, role: string, userContext: any): string {
  const brand = userContext?.productName || "PolyVerses Suite";
  
  if (type === "opportunity") {
    return `### 📊 Simulated Opportunity Analysis for "${prompt}"
*Generated by the PolyVerses Opportunity Planning Agent v3.1*

The RICE scoring framework has been applied to evaluate the potential impact of integrating **${prompt}** into **${brand}**.

| Feature Scope | Reach (Monthly) | Impact (Scale 1-3) | Confidence (%) | Effort (Person-Mo) | RICE Score |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Unified Integration Engine** | 120,000 | 2.5 (High) | 85% | 3.0 | **85,000** |
| **Real-time Slack Notification Rail** | 80,000 | 2.0 (Medium)| 90% | 1.5 | **96,000** |
| **Visual Node Flow Manager** | 50,000 | 1.5 (Medium)| 80% | 2.0 | **30,000** |

#### 💡 Agent Observations & Strategic Recommendations:
1. **Prioritize Real-time Slack Rails first**: The incredibly low effort (1.5 person-months) relative to a high reach yields a superior RICE efficiency index.
2. **Commit Unified Engine to Next Sprint**: Scale requirements suggest a high reach. PM approval is recommended before deployment.
3. **Execution Routing**: Run via **GPT-4o Reasoning API** to analyze complex configuration models before shipping.`;
  }

  if (type === "compliance") {
    return `### 🛡️ Compliance & Safety Audit Report for "${prompt}"
*Generated by the Compliance & GDPR Audit Agent v3.1*

The system has audited data transaction maps for **${prompt}** within **${brand}**'s core EKS deployment.

#### 🟢 Strengths Identified:
- Explicit data structures enforce regional isolation (Active US-East-1 db tables and warm passive replication to EU-West-1 are distinct).
- AES-256 state ledger configurations prevent unauthorized read/writes.

#### ⚠️ compliance Warnings & Vulnerabilities:
1. **GDPR Account Erasure Risk**: The architecture lacks a declared pipeline to remove historical log streams in Redis within the 30-day CCPA/GDPR erasure requirement window.
2. **Vague Data Masking Constraints**: The API payload contains elements where plain corporate credentials or slack tokens may accidentally trace to Prometheus performance telemetry logs.

#### 🔧 Actionable Remediation Steps:
1. **Configure Neo4j Eviction Jobs**: Establish a cron script to run every 24 hours to scrub node relationships associated with deleted users.
2. **Apply SHA-256 Hashing**: Mask all slack tokens on the client edge prior to EKS queue admission.
3. **Authorize Legal Exceptions**: Ensure only the **CPO (Chief Product Officer)** role can bypass or override compliance warnings.`;
  }

  if (type === "prd") {
    return `# 📄 Product Requirements Document: ${prompt}
## PolyVerses v3.1 Enterprise Standard Document

**Target Model Allocated**: GPT-4o  
**Assigned Owner**: ${role} (Enforced via RBAC)  
**Priority Classification**: ${priority} Queue Target  

---

## 1. Executive Intent & Goals
The objective is to deploy a scalable **${prompt}** inside **${brand}** that increases product velocity, ensures flawless system compliance, and maintains active-passive failover state-safeguards.

## 2. Dynamic Telemetry Success Targets
- **User Activity Index**: Increase monthly user feature activation metrics by **> 14%** within the first 6 weeks of release.
- **Latency Standard**: Ensure end-to-end API roundtrip delays remain **<= 180ms** under high concurrent thread cycles on the AWS EKS instance.
- **Failover SLA**: Maintain flawless active-passive Route53 failover capability, recovering database states to warm standbys in **< 120 seconds**.

## 3. Recommended Core Architecture Requirements
- **Queue Layer**: Manage processing loads on Redis priority streams with separate lanes for High, Medium, and Low workloads.
- **Context Engines**: Route unstructured context queries to Pinecone vector indices, mapping complex feature linkages in Neo4j graph nodes.
- **Circuit Breakers**: Enforce automated fallback logic (3 retries, exponential backoff) with automatic alerts escalated to human-PMs on failure.

## 4. Legal Compliance & Purging Rules
- Enforce GDPR compliance routines checking data handling specifications to prevent plain PII outputs.
- Retain detailed execution transaction audit logs safe for up to 10 years to adhere to standard enterprise compliance policies.`;
  }

  if (type === "rollback") {
    return `### 📉 SRE Rollback Budget Telemetry Checklist
*Deployment Health Analysis for ${prompt}*

Our monitoring agents have analyzed live Kubernetes runtime performance telemetry:

- **Deployment Image**: \`athenaos-orchestrator:${priority.toLowerCase()}-v3\`
- **Pod Latency (p95)**: 145ms *(Target Budget: 800ms) - OK*
- **Request Failure Rate**: 0.08% *(Max Safe Margin: 2.0%) - OK*
- **Redis Lock Key Sync**: 100% synchronized in 4.2ms - *OK*
- **Route53 Active Link**: US-East-1 Active (Primary)  

**Status**: 🟢 **HEALTHY**. Standard performance metrics are well within the safe operational error budget margins. Automatic rollback trigger is idle. No action is required.`;
  }

  return `### 🧠 PolyVerses v3.1 Synthesized Executive Insight
*For concept: "${prompt}"*

Our product agent network has evaluated the initial parameters for **${prompt}**:
- **Active User Role Account**: ${role} authorization verified.
- **Routing Lane Allocated**: Priority stream **${priority}** (Redis Stream worker allocated).
- **Core Recommendation**: Start with **Opportunity Prioritization Scopes** and perform compliance scrubbing immediately.
- **Multi-region Synchronization Link**: Global datastore active. Passive standby stands by in eu-west-1.`;
}

startServer();
