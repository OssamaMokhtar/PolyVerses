import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import { db } from "./src/firebase";
import {
  doc, getDoc, setDoc, serverTimestamp,
  collection, addDoc, query, where, orderBy, getDocs, limit,
  Timestamp
} from "firebase/firestore";
import crypto from "crypto";
import {
  FitnessProfile, WeeklyPlan, WorkoutLogEntry, CheckIn,
  RecoveryAssessment, WorkoutExercise, ExerciseInput, PlanOutput,
  RecoveryInput, ChatRequest, ChatResponse, NutritionRequest,
  NutritionResponse, CheckInInput, HealthDataConsent
} from "./src/types";
import { findExerciseSubstitution, ExerciseLibrary } from "./src/ExerciseLibrary";

dotenv.config();

// Types: user-provided wearable data for recovery analysis
interface WearableInput {
  steps?: number;
  activeCalories?: number;
  sleepDuration?: number;        // minutes
  restingHeartRate?: number;     // bpm
  hrv?: number;                  // ms
  workoutSessions?: { duration: number; type: string; calories: number }[];
}

function requireAuth(req: express.Request, res: express.Response): string | null {
  const uid = req.headers["x-user-id"] as string | undefined;
  if (!uid) {
    res.status(401).json({ error: "Unauthorized: x-user-id header required" });
    return null;
  }
  return uid;
}

async function getProfile(uid: string): Promise<FitnessProfile | null> {
  const snap = await getDoc(doc(db, "users", uid, "profile", "current"));
  if (!snap.exists()) return null;
  return snap.data() as FitnessProfile;
}

async function saveProfile(uid: string, profile: FitnessProfile): Promise<void> {
  await setDoc(doc(db, "users", uid, "profile", "current"), profile as any, { merge: true });
}

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

  // ─── Legacy Fitness Layer (PolySync — separate product, retained for reference) ───

  // F01 — Profile Agent: save fitness profile
  app.post("/api/fitness/profile", async (req, res) => {
    const uid = requireAuth(req, res);
    if (!uid) return;
    try {
      const profile = req.body as Partial<FitnessProfile>;
      if (!profile.goal || !profile.level) {
        res.status(400).json({ error: "goal and level are required" });
        return;
      }
      const full: FitnessProfile = {
        goal: profile.goal,
        level: profile.level,
        injuries: profile.injuries || [],
        equipment: profile.equipment || [],
        daysPerWeek: profile.daysPerWeek || 3,
        sessionDuration: profile.sessionDuration || 45,
        focus: profile.focus || [],
        biometrics: profile.biometrics,
        healthDataConsent: profile.healthDataConsent || false,
        specialMode: profile.specialMode || "none",
        createdAt: profile.createdAt || serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await saveProfile(uid, full);
      res.json({ success: true, profile: full });
    } catch (err) {
      console.error("F01 profile save error:", err);
      res.status(500).json({ error: "Failed to save profile" });
    }
  });

  // F01 — Profile Agent: validate profile (Gemini-powered validation)
  app.post("/api/profile/validate", async (req, res) => {
    const uid = req.headers["x-user-id"] as string | undefined;
    if (!uid) { res.status(401).json({ error: "Unauthorized" }); return; }
    try {
      const profile = req.body as Partial<FitnessProfile>;
      const ai = getGenAI();
      const result = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          { role: "system", parts: [{ text: F01_SYSTEM_PROMPT }] },
          { role: "user", parts: [{ text: JSON.stringify(profile, null, 2) }] },
        ],
        config: { responseMimeType: "application/json" },
      });
      const text = result.text || "{}";
      let parsed: { valid?: boolean; warnings?: string[]; suggestions?: string[]; normalized?: object } = {};
      try { parsed = JSON.parse(text); } catch { parsed = { valid: false, warnings: ["Invalid AI response"], suggestions: ["Profile validation failed — please re-check your inputs"] }; }
      // Always save valid profiles regardless of warnings
      if (parsed.valid !== false || !parsed.warnings?.length) {
        const existing = await getProfile(uid);
        const merged: FitnessProfile = {
          uid, email: profile.email || existing?.email || "", displayName: profile.displayName || existing?.displayName || "",
          goal: profile.goal || existing?.goal || "", level: profile.level || existing?.level || "",
          injuries: profile.injuries || existing?.injuries || [], equipment: profile.equipment || existing?.equipment || [],
          daysPerWeek: profile.daysPerWeek ?? existing?.daysPerWeek ?? 3, sessionDuration: profile.sessionDuration ?? existing?.sessionDuration ?? 45,
          focus: profile.focus || existing?.focus || [], biometrics: profile.biometrics ?? existing?.biometrics ?? undefined,
          healthDataConsent: profile.healthDataConsent ?? existing?.healthDataConsent ?? false, specialMode: profile.specialMode || existing?.specialMode || "none",
          createdAt: existing?.createdAt || serverTimestamp(), updatedAt: serverTimestamp(),
        };
        await saveProfile(uid, merged);
      }
      res.json({ ...parsed, saved: parsed.valid !== false || !parsed.warnings?.length });
    } catch (err) {
      console.error("F01 profile validate error:", err);
      res.status(500).json({ error: "Profile validation failed", details: String(err) });
    }
  });

  // F11 — Compliance Gate: review a workout plan for safety issues
  app.post("/api/compliance/review", async (req, res) => {
    const uid = req.headers["x-user-id"] as string | undefined;
    if (!uid) { res.status(401).json({ error: "Unauthorized" }); return; }
    try {
      const { plan, profile } = req.body as { plan: object; profile?: object };
      if (!plan) { res.status(400).json({ error: "plan is required" }); return; }
      const ai = getGenAI();
      const result = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          { role: "system", parts: [{ text: F11_SYSTEM_PROMPT }] },
          { role: "user", parts: [{ text: `Review this plan for safety:\n\nPROFILE:\n${JSON.stringify(profile || {}, null, 2)}\n\nPLAN:\n${JSON.stringify(plan, null, 2)}` }] },
        ],
        config: { responseMimeType: "application/json" },
      });
      const text = result.text || '{"approved":true,"flags":[],"message":"","disclaimer":"","alternatives":[]}';
      let parsed: { approved?: boolean; flags?: string[]; message?: string; disclaimer?: string; alternatives?: string[] } = {};
      try { parsed = JSON.parse(text); } catch { parsed = { approved: false, flags: ["Compliance review failed"], message: "Please try again", disclaimer: "This is general fitness guidance, not medical advice.", alternatives: [] }; }
      res.json(parsed);
    } catch (err) {
      console.error("F11 compliance review error:", err);
      res.status(500).json({ error: "Compliance review failed", details: String(err) });
    }
  });

  // F01 — Profile Agent: get fitness profile
  app.get("/api/fitness/profile", async (req, res) => {
    const uid = requireAuth(req, res);
    if (!uid) return;
    try {
      const profile = await getProfile(uid);
      if (!profile) {
        res.status(404).json({ error: "Profile not found" });
        return;
      }
      res.json({ profile });
    } catch (err) {
      console.error("F01 profile get error:", err);
      res.status(500).json({ error: "Failed to get profile" });
    }
  });

  // F11 — Compliance Gate: set health data consent
  app.post("/api/fitness/consent", async (req, res) => {
    const uid = requireAuth(req, res);
    if (!uid) return;
    try {
      const { consent } = req.body as { consent: boolean };
      if (typeof consent !== "boolean") {
        res.status(400).json({ error: "consent must be a boolean" });
        return;
      }
      await setDoc(doc(db, "users", uid, "profile", "current"), {
        healthDataConsent: consent,
        updatedAt: serverTimestamp(),
      } as any, { merge: true });
      res.json({ success: true, consent });
    } catch (err) {
      console.error("F11 consent error:", err);
      res.status(500).json({ error: "Failed to set consent" });
    }
  });

  // F02 — Workout Generator: generate weekly plan
  app.post("/api/fitness/generate-plan", async (req, res) => {
    const uid = requireAuth(req, res);
    if (!uid) return;
    try {
      const profile = await getProfile(uid);
      if (!profile) {
        res.status(404).json({ error: "Profile not found. Complete onboarding first." });
        return;
      }

      // Generate plan using Gemini if available, otherwise use deterministic algorithm
      if (ai) {
        try {
          const prompt = buildPlanGenerationPrompt(profile);
          const response = await ai.models.generateContent({
            model: "gemini-3.5-flash",
            contents: prompt,
            config: {
              systemInstruction: F02_SYSTEM_PROMPT,
              temperature: 0.7,
              responseMimeType: "application/json",
            },
          });
          const text = response.text || "{}";
          let plan: WeeklyPlan;
          try {
            plan = JSON.parse(text);
          } catch {
            console.error("Failed to parse Gemini plan response:", text);
            plan = generateDeterministicPlan(profile);
          }
          plan.userId = uid;
          plan.createdAt = serverTimestamp() as any;
          plan.updatedAt = serverTimestamp() as any;
          await savePlan(uid, plan);
          res.json({ plan, generatedBy: "gemini" });
        } catch (geminiErr) {
          console.error("Gemini plan generation failed, using deterministic fallback:", geminiErr);
          const plan = generateDeterministicPlan(profile);
          plan.userId = uid;
          plan.createdAt = serverTimestamp() as any;
          plan.updatedAt = serverTimestamp() as any;
          await savePlan(uid, plan);
          res.json({ plan, generatedBy: "deterministic" });
        }
      } else {
        const plan = generateDeterministicPlan(profile);
        plan.userId = uid;
        plan.createdAt = serverTimestamp() as any;
        plan.updatedAt = serverTimestamp() as any;
        await savePlan(uid, plan);
        res.json({ plan, generatedBy: "deterministic" });
      }
    } catch (err) {
      console.error("F02 plan generation error:", err);
      res.status(500).json({ error: "Failed to generate plan" });
    }
  });

  // F02 — get current week's plan
  app.get("/api/fitness/plan", async (req, res) => {
    const uid = requireAuth(req, res);
    if (!uid) return;
    try {
      const q = query(
        collection(db, "users", uid, "plans"),
        orderBy("createdAt", "desc"),
        limit(1)
      );
      const snap = await getDocs(q);
      if (snap.empty) {
        res.status(404).json({ error: "No plan found. Generate one first." });
        return;
      }
      const plan = snap.docs[0].data() as WeeklyPlan;
      res.json({ plan });
    } catch (err) {
      console.error("F02 get plan error:", err);
      res.status(500).json({ error: "Failed to get plan" });
    }
  });

  // F03 — Exercise Library Agent: find substitution
  app.post("/api/fitness/substitute", async (req, res) => {
    const uid = requireAuth(req, res);
    if (!uid) return;
    try {
      const { exerciseId, reason, preferredEquipment } = req.body as {
        exerciseId: string;
        reason?: string;
        preferredEquipment?: string[];
      };
      if (!exerciseId) {
        res.status(400).json({ error: "exerciseId is required" });
        return;
      }
      const substitutes = findExerciseSubstitution(exerciseId, preferredEquipment);
      res.json({ substitutes });
    } catch (err) {
      console.error("F03 substitute error:", err);
      res.status(500).json({ error: "Failed to find substitution" });
    }
  });

  // F09 — Motivation Coach: submit check-in
  app.post("/api/fitness/checkin", async (req, res) => {
    const uid = requireAuth(req, res);
    if (!uid) return;
    try {
      const input = req.body as CheckInInput;
      if (!input.energyLevel && input.energyLevel !== 0) {
        res.status(400).json({ error: "energyLevel is required" });
        return;
      }
      const checkIn: CheckIn = {
        date: serverTimestamp() as any,
        workoutId: input.workoutId,
        energyLevel: input.energyLevel,
        mood: input.mood,
        painOrIssues: input.painOrIssues,
        sleepQuality: input.sleepQuality,
        sleepDuration: input.sleepDuration,
        motivationLevel: input.motivationLevel,
        workoutCompleted: input.workoutCompleted,
        notes: input.notes,
        createdAt: serverTimestamp(),
      };
      await addDoc(collection(db, "users", uid, "checkIns"), checkIn as any);
      res.json({ success: true, checkIn });
    } catch (err) {
      console.error("F09 checkin error:", err);
      res.status(500).json({ error: "Failed to save check-in" });
    }
  });

  // F05 — Log workout
  app.post("/api/fitness/log-workout", async (req, res) => {
    const uid = requireAuth(req, res);
    if (!uid) return;
    try {
      const workout = req.body as WorkoutLogEntry;
      if (!workout.planId || !workout.exercises || workout.exercises.length === 0) {
        res.status(400).json({ error: "planId and exercises are required" });
        return;
      }
      workout.userId = uid;
      workout.completed = workout.completed ?? true;
      workout.createdAt = serverTimestamp();
      const snap = await addDoc(collection(db, "users", uid, "workouts"), workout as any);

      // Trigger adaptation
      try {
        const adaptedPlan = await generateAdaptation(uid, workout);
        res.json({ success: true, workoutId: snap.id, adaptedPlan });
      } catch (adaptErr) {
        console.error("Adaptation failed:", adaptErr);
        res.json({ success: true, workoutId: snap.id, adaptedPlan: null });
      }
    } catch (err) {
      console.error("F05 log workout error:", err);
      res.status(500).json({ error: "Failed to log workout" });
    }
  });

  // F04 — Recovery Analyst: compute recovery score
  app.post("/api/fitness/recovery", async (req, res) => {
    const uid = requireAuth(req, res);
    if (!uid) return;
    try {
      const input = req.body as RecoveryInput;
      const score = computeRecoveryScore(input);
      const assessment: RecoveryAssessment = {
        assessedAt: serverTimestamp(),
        recoveryScore: score.score,
        recommendation: score.recommendation,
        recommendationText: score.text,
        factors: score.factors,
        dataSources: score.dataSources,
        dataAgeHours: score.dataAgeHours,
      };
      await addDoc(collection(db, "users", uid, "recovery"), assessment as any);
      res.json({ assessment });
    } catch (err) {
      console.error("F04 recovery error:", err);
      res.status(500).json({ error: "Failed to compute recovery" });
    }
  });

  // F06 — Coaching Chat Agent
  app.post("/api/fitness/chat", async (req, res) => {
    const uid = requireAuth(req, res);
    if (!uid) return;
    try {
      const { message, sessionId } = req.body as ChatRequest;
      if (!message) {
        res.status(400).json({ error: "message is required" });
        return;
      }

      // Get user context for the chat agent
      const profile = await getProfile(uid);
      let context = "";
      if (profile) {
        context = `User profile: goal=${profile.goal}, level=${profile.level}, injuries=[${profile.injuries.join(", ")}], equipment=[${profile.equipment.join(", ")}], daysPerWeek=${profile.daysPerWeek}, sessionDuration=${profile.sessionDuration}min`;
      }

      let responseText: string;
      if (ai) {
        try {
          const fullPrompt = `Context: ${context}\n\nUser question: ${message}\n\nProvide a helpful, personalized fitness coaching response. Be encouraging but factual. If the question is about injuries or medical conditions, include a disclaimer that you are an AI fitness coach, not a medical professional, and recommend consulting a healthcare provider.`;
          const response = await ai.models.generateContent({
            model: "gemini-3.5-flash",
            contents: fullPrompt,
            config: {
              systemInstruction: F06_SYSTEM_PROMPT,
              temperature: 0.7,
            },
          });
          responseText = response.text || "Sorry, I couldn't generate a response.";
        } catch (geminiErr) {
          console.error("Gemini chat failed:", geminiErr);
          responseText = `I'm here to help with your fitness journey! Could you tell me more about what you're looking for? (Gemini API unavailable — using fallback)`;
        }
      } else {
        responseText = `I'm here to help with your fitness journey! Could you tell me more about what you're looking for? (Gemini API not configured — using sandbox)`;
      }

      // Save message to chat session
      const messageData = {
        id: crypto.randomUUID(),
        role: "user" as const,
        content: message,
        timestamp: serverTimestamp(),
        agentId: "F06",
      };
      const assistantData = {
        id: crypto.randomUUID(),
        role: "assistant" as const,
        content: responseText,
        timestamp: serverTimestamp(),
        agentId: "F06",
      };

      if (sessionId) {
        await setDoc(doc(db, "users", uid, "chatSessions", sessionId), {
          createdAt: serverTimestamp(),
          lastMessageAt: serverTimestamp(),
          messages: [messageData, assistantData],
        } as any, { merge: true });
      } else {
        await addDoc(collection(db, "users", uid, "chatSessions"), {
          createdAt: serverTimestamp(),
          lastMessageAt: serverTimestamp(),
          messages: [messageData, assistantData],
        } as any);
      }

      res.json({ response: responseText, sandbox: !ai });
    } catch (err) {
      console.error("F06 chat error:", err);
      res.status(500).json({ error: "Failed to process chat" });
    }
  });

  // F07 — Form Coach Agent
  app.post("/api/fitness/form-cue", async (req, res) => {
    const uid = requireAuth(req, res);
    if (!uid) return;
    try {
      const { exerciseId, userDescription } = req.body as {
        exerciseId?: string;
        userDescription?: string;
      };
      let cue: string;

      if (ai) {
        try {
          const prompt = userDescription
            ? `Exercise: ${exerciseId || "unknown"}. User describes their movement feel: "${userDescription}". Provide specific form cues and corrections based on this description. If exerciseId is provided, use it to give exercise-specific cues.`
            : `Exercise: ${exerciseId}. Provide form cues and common mistakes for this exercise. Be specific and actionable.`;
          const response = await ai.models.generateContent({
            model: "gemini-3.5-flash",
            contents: prompt,
            config: {
              systemInstruction: F07_SYSTEM_PROMPT,
              temperature: 0.7,
            },
          });
          cue = response.text || "No form cues available.";
        } catch (geminiErr) {
          console.error("Gemini form-cue failed:", geminiErr);
          cue = "Form cues unavailable (Gemini API error). Try focusing on proper breathing and controlled movement.";
        }
      } else {
        cue = "Form cues unavailable (Gemini API not configured). Focus on controlled movement, proper breathing, and full range of motion.";
      }

      res.json({ cue, sandbox: !ai });
    } catch (err) {
      console.error("F07 form-cue error:", err);
      res.status(500).json({ error: "Failed to get form cues" });
    }
  });

  // F08 — Nutrition Advisor Agent
  app.post("/api/fitness/nutrition", async (req, res) => {
    const uid = requireAuth(req, res);
    if (!uid) return;
    try {
      const { query, profile } = req.body as NutritionRequest;
      let response: NutritionResponse;

      if (ai) {
        try {
          const prompt = `User nutrition question: "${query}". Profile context: ${profile ? `goal=${profile.goal}, level=${profile.level}` : "none"}. Provide practical, evidence-based nutrition guidance. If the question is about supplements or medical nutrition, include a disclaimer. Estimate calories/macros if relevant based on the profile.`;
          const geminiResponse = await ai.models.generateContent({
            model: "gemini-3.5-flash",
            contents: prompt,
            config: {
              systemInstruction: F08_SYSTEM_PROMPT,
              temperature: 0.7,
            },
          });
          const text = geminiResponse.text || "No nutrition guidance available.";
          response = {
            guidance: text,
            disclaimer: text.includes("medical") || text.includes("supplement")
              ? "This is general nutrition information, not medical advice. Consult a registered dietitian or healthcare provider for personalized recommendations."
              : "This is general fitness nutrition guidance, not a substitute for professional medical or dietetic advice.",
            sandbox: false,
          };
        } catch (geminiErr) {
          console.error("Gemini nutrition failed:", geminiErr);
          response = {
            guidance: "I can help with general nutrition questions! Try asking about protein intake, meal timing around workouts, or hydration strategies.",
            disclaimer: "This is general fitness nutrition guidance, not a substitute for professional medical or dietetic advice.",
            sandbox: true,
          };
        }
      } else {
        response = {
          guidance: "I can help with general nutrition questions! Try asking about protein intake, meal timing around workouts, or hydration strategies. (Gemini API not configured)",
          disclaimer: "This is general fitness nutrition guidance, not a substitute for professional medical or dietetic advice.",
          sandbox: true,
        };
      }

      res.json(response);
    } catch (err) {
      console.error("F08 nutrition error:", err);
      res.status(500).json({ error: "Failed to get nutrition guidance" });
    }
  });

  // F05 — Manual plan adaptation trigger
  app.post("/api/fitness/adapt-plan", async (req, res) => {
    const uid = requireAuth(req, res);
    if (!uid) return;
    try {
      const { reason, workoutData } = req.body as { reason?: string; workoutData?: any };
      const adaptedPlan = await generateAdaptation(uid, workoutData);
      res.json({ adaptedPlan });
    } catch (err) {
      console.error("F05 adapt-plan error:", err);
      res.status(500).json({ error: "Failed to adapt plan" });
    }
  });

  // GET /api/fitness/progress — aggregated progress data
  app.get("/api/fitness/progress", async (req, res) => {
    const uid = requireAuth(req, res);
    if (!uid) return;
    try {
      const workoutsSnap = await getDocs(
        query(collection(db, "users", uid, "workouts"), orderBy("date", "desc"), limit(50))
      );
      const workouts = workoutsSnap.docs.map(d => d.data() as WorkoutLogEntry);

      // Aggregate: total workouts, total volume, recent workouts
      const totalWorkouts = workouts.length;
      const completedWorkouts = workouts.filter(w => w.completed).length;
      const totalVolume = workouts.reduce((sum, w) => {
        return sum + w.exercises.reduce((exSum, ex) => {
          return exSum + ex.sets.reduce((setSum, set) => setSum + (set.weight * set.reps), 0);
        }, 0);
      }, 0);

      res.json({
        totalWorkouts,
        completedWorkouts,
        totalVolume,
        recentWorkouts: workouts.slice(0, 7),
      });
    } catch (err) {
      console.error("Progress error:", err);
      res.status(500).json({ error: "Failed to get progress" });
    }
  });

  // DELETE /api/fitness/data — GDPR/CCPA data deletion request
  app.delete("/api/fitness/data", async (req, res) => {
    const uid = requireAuth(req, res);
    if (!uid) return;
    try {
      // Delete all fitness data for this user
      const collections = ["profile", "workouts", "plans", "wearableData", "chatSessions", "checkIns", "recovery", "subscription", "settings", "dailyDigest"];
      for (const col of collections) {
        const colSnap = await getDocs(collection(db, "users", uid, col));
        const batch = require("firebase-admin").firestore?.batch?.() as any;
        // Note: In production, use proper batch deletes. This is a simplified version.
        for (const docSnap of colSnap.docs) {
          await doc(db, "users", uid, col, docSnap.id).delete();
        }
      }
      res.json({ success: true, message: "All fitness data deleted. GDPR/CCPA deletion request processed." });
    } catch (err) {
      console.error("Data deletion error:", err);
      res.status(500).json({ error: "Failed to delete data" });
    }
  });
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

// ─── Fitness Agent System Prompts ───────────────────────────────────────────

const F02_SYSTEM_PROMPT = `You are the Workout Generator Agent of PolySync, an expert exercise physiologist and program designer. Your job is to generate a weekly workout plan based on a user's fitness profile and a library of 101 exercises.

INPUT: A fitness profile with goal, level, injuries, equipment, daysPerWeek, sessionDuration, focus areas.

OUTPUT FORMAT: JSON object matching this schema exactly:
{
  "weekNumber": number (current week of year),
  "startDate": "YYYY-MM-DD",
  "endDate": "YYYY-MM-DD",
  "days": [
    {
      "dayIndex": number (0=Monday, 6=Sunday),
      "date": "YYYY-MM-DD",
      "workouts": [
        {
          "workoutId": string (unique ID),
          "workoutName": string (descriptive name like "Upper Body Strength"),
          "focus": string (primary focus area),
          "duration": number (minutes),
          "exercises": [
            {
              "exerciseId": string (from exercise library),
              "exerciseName": string,
              "targetMuscles": string[],
              "equipment": string[],
              "instructions": string (brief),
              "commonMistakes": string[],
              "substitutionIds": string[],
              "sets": number,
              "reps": string (e.g. "8-12"),
              "rest": number (seconds),
              "rpeTarget": number (6-9),
              "allowsSubstitution": true
            }
          ]
        }
      ]
    }
  ],
  "version": 1
}

RULES:
1. Respect injuries — never include exercises that use injured body parts. If a user has "right_shoulder" injury, avoid all shoulder exercises.
2. Respect equipment — only use exercises with equipment the user has. If user has ["barbell", "dumbbells"], don't include machine or cable exercises.
3. Match session duration — total workout time should be approximately the user's sessionDuration (accounting for warm-up and rest).
4. Match days per week — generate workouts for exactly daysPerWeek days, spread across the week.
5. Match goal — for "build_muscle" focus on hypertrophy rep ranges (8-12), for "lose_weight" include more cardio and higher density, for "improve_endurance" focus on longer sessions and cardio, for "general_fitness" balance everything.
6. Match level — beginners get simpler exercises, fewer sets, more rest; advanced users get more complex exercises, more sets, less rest.
7. Include a mix of compound and isolation exercises.
8. Each workout should have a clear focus (upper body, lower body, full body, cardio, core, mobility).
9. Output valid JSON only. No markdown, no explanations.`;

const F06_SYSTEM_PROMPT = `You are the Coaching Chat Agent of PolySync, a knowledgeable and encouraging AI fitness coach. You have access to the user's profile, recent workouts, and current plan.

Your role:
1. Answer fitness questions with personalized advice based on the user's profile and history.
2. Explain the reasoning behind workout choices (e.g., "This exercise was chosen because...").
3. Provide form cues and common mistakes when asked about specific exercises.
4. Discuss nutrition, recovery, and motivation when relevant.
5. Be encouraging but factual — never overpromise results.

Safety rules:
1. If asked about injuries or medical conditions, recommend consulting a healthcare professional and do not give specific medical advice.
2. If asked about supplements, give general information and recommend consulting a healthcare provider.
3. If the user's question suggests they might be pushing too hard (excessive fatigue, pain, burnout signs), gently suggest rest or reduced intensity.
4. Always maintain a supportive, non-judgmental tone.

Style:
- Be concise but thorough (2-4 sentences for simple questions, more for complex ones).
- Use examples when helpful.
- Reference the user's specific situation when possible (their goal, level, injuries, equipment).
- End with an encouraging note or a follow-up question when appropriate.`;

const F07_SYSTEM_PROMPT = `You are the Form Coach Agent of PolySync, a specialist in exercise technique and movement quality. You provide form cues, common mistakes, and corrections for exercises.

INPUT: An exercise ID or name, optionally with a user's description of how the movement feels.

OUTPUT: Specific, actionable form cues organized as:
1. Key setup points (body position, grip, stance, etc.)
2. Movement execution (how to perform the concentric and eccentric phases)
3. Common mistakes to avoid
4. Cues to self-check (what to pay attention to during the exercise)

If the user describes discomfort or unusual feel, address that specifically — suggest possible form issues that could cause it, but always include a disclaimer that persistent pain should be evaluated by a professional.

Be specific to the exercise. Don't give generic advice like "use proper form" — give concrete cues like "keep your elbows at a 45-degree angle from your body" or "drive through your heels, not your toes."`;

const F08_SYSTEM_PROMPT = `You are the Nutrition Advisor Agent of PolySync, providing practical, evidence-based nutrition guidance for fitness goals.

Your role:
1. Estimate calorie and macro needs based on user profile (goal, level, biometrics if available).
2. Suggest meal timing around workouts (pre-workout, post-workout).
3. Give practical food suggestions for hitting protein, carb, and fat targets.
4. Address dietary preferences when known (vegetarian, keto, etc.).
5. Explain the role of nutrition in recovery and performance.

Safety rules:
1. If asked about medical nutrition (diabetes, eating disorders, severe allergies, medications), recommend consulting a registered dietitian or healthcare provider.
2. If asked about supplements, give general information about what the evidence shows and recommend consulting a healthcare provider before starting anything.
3. Never promote extreme restriction or unhealthy eating patterns.
4. Be inclusive of different dietary preferences and cultural food traditions.

Style:
- Be practical and actionable — give specific food examples and portions.
- Use ranges when appropriate (e.g., "0.7-1g per pound of bodyweight for protein").
- Be encouraging about nutrition as part of the fitness journey, not a source of stress.`;

const F11_SYSTEM_PROMPT = `You are the Compliance Gate Agent of PolySync, a safety-critical guardian that reviews all fitness recommendations before they reach the user.

Your role:
1. Review workout plans for injury conflicts — if any exercise targets a body part in the user's injury list, flag it and suggest alternatives.
2. Review user questions for medical content — if the question is about injuries, pain, medical conditions, or medications, trigger the medical disclaimer.
3. Enforce health data consent — no wearable/health data processing without explicit user consent.
4. Apply safety thresholds — for beginners, cap volume (max 3 sets per exercise), intensity (max RPE 7), and frequency (max 3 days/week initially).
5. Handle special modes — GLP-1 users need lower volume + more recovery + protein emphasis; postpartum users need core/pelvic floor caution; hypertension users need avoid-max-effort guidance; injury_rehab users need progressive loading with medical clearance notes.

Safety rules (NEVER violate):
- Never recommend an exercise that uses an injured body part.
- Never provide specific medical advice — always recommend consulting a healthcare professional for injuries, pain, or medical conditions.
- Never bypass the health data consent gate.
- Always include a disclaimer on medicaladjacent content: "This is general fitness guidance, not medical advice. Consult a healthcare professional for injuries or medical conditions."
- For beginners, keep workouts safe and simple — avoid max-effort recommendations, complex movements, or high-volume sessions.
- When in doubt, recommend less, not more.

Output format: JSON with "approved" (boolean), "flags" (array of safety concerns), "message" (explanation for user if not approved), "disclaimer" (required disclaimer text if medical/injury content detected), "alternatives" (suggested exercise alternatives if injury conflict found).`;

const F01_SYSTEM_PROMPT = `You are the Profile Agent of PolySync, responsible for validating and normalizing user fitness profiles.

Your role:
1. Validate that required fields are present and reasonable (goal, level, daysPerWeek, sessionDuration).
2. Detect contradictions — e.g., "beginner" level with "6 days/week" and "advanced" programs is a red flag. Flag and suggest clarifications.
3. Normalize inputs — standardize goal names, level names, equipment names, injury names.
4. Flag unrealistic combinations — e.g., "lose_weight" goal with "6 days/week advanced" is ambitious; note it but don't block.
5. If biometrics (age, weight, height) are provided, validate they're in reasonable ranges.

Input: A FitnessProfile object (may be partial — handle missing fields gracefully).
Output: JSON with "valid" (boolean), "warnings" (array of detected issues), "suggestions" (array of recommended clarifications), "normalized" (the normalized profile).`;

// ─── Plan Generation Helpers ─────────────────────────────────────────────────

function buildPlanGenerationPrompt(profile: FitnessProfile): string {
  const startOfWeek = getMonday(new Date());
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(endOfWeek.getDate() + 6);

  return `Generate a weekly workout plan for this user profile:

Goal: ${profile.goal}
Level: ${profile.level}
Injuries: ${profile.injuries.length > 0 ? profile.injuries.join(", ") : "none"}
Equipment: ${profile.equipment.join(", ") || "bodyweight only"}
Days per week: ${profile.daysPerWeek}
Session duration: ${profile.sessionDuration} minutes
Focus areas: ${profile.focus.join(", ") || "balanced"}
Special mode: ${profile.specialMode}

Plan should cover: ${formatDate(startOfWeek)} to ${formatDate(endOfWeek)} (${profile.daysPerWeek} workouts across the week).

For each workout, select exercises from the exercise library that:
- Target the user's focus areas
- Use only the equipment the user has
- Avoid injured body parts
- Match the user's level and session duration
- Align with the user's goal

Output a complete WeeklyPlan JSON object with all required fields. Be specific and actionable.`;

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

function generateDeterministicPlan(profile: FitnessProfile): WeeklyPlan {
  const startOfWeek = getMonday(new Date());
  const days: DailyWorkout[] = [];
  const exercisesPerWorkout = profile.level === "beginner" ? 4 : profile.level === "advanced" ? 6 : 5;
  const setsPerExercise = profile.level === "beginner" ? 2 : profile.level === "advanced" ? 4 : 3;

  // Select exercises based on goal and equipment
  const selectedExercises = selectExercisesForGoal(profile);

  for (let i = 0; i < profile.daysPerWeek; i++) {
    const date = new Date(startOfWeek);
    date.setDate(date.getDate() + i * Math.floor(7 / profile.daysPerWeek));
    const dayIndex = date.getDay() === 0 ? 6 : date.getDay() - 1;

    const workoutExercises = selectedExercises.slice(0, exercisesPerWorkout);
    const workoutName = getWorkoutName(profile.goal, i, profile.daysPerWeek);

    const workout: Workout = {
      workoutId: `workout-${i + 1}`,
      workoutName,
      focus: getWorkoutFocus(profile.goal, i, profile.daysPerWeek),
      duration: profile.sessionDuration,
      exercises: workoutExercises.map((ex, idx) => ({
        exerciseId: ex.id,
        exerciseName: ex.name,
        targetMuscles: ex.targetMuscles,
        equipment: ex.equipment,
        instructions: ex.instructions,
        commonMistakes: ex.commonMistakes,
        substitutionIds: ex.substitutionIds,
        sets: setsPerExercise,
        reps: getRepRange(profile.goal, profile.level),
        rest: getRestTime(profile.goal),
        rpeTarget: getRpeTarget(profile.level),
        allowsSubstitution: true,
      })),
    };

    days.push({
      dayIndex,
      date: formatDate(date),
      workouts: [workout],
    });
  }

  return {
    weekNumber: getWeekNumber(new Date()),
    startDate: formatDate(startOfWeek),
    endDate: formatDate(new Date(startOfWeek.getTime() + 6 * 24 * 60 * 60 * 1000)),
    days,
    version: 1,
    userId: profile.goal, // will be overwritten
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function selectExercisesForGoal(profile: FitnessProfile): ExerciseInput[] {
  // Pick exercises from the static library based on goal and equipment
  const allExercises = ExerciseLibrary.getAllExercises();
  const compatible = allExercises.filter(ex =>
    profile.equipment.length === 0 || profile.equipment.some(eq =>
      ex.equipment.some(e => e.toLowerCase() === eq.toLowerCase())
    )
  );

  // Filter out injured body parts
  const safe = profile.injuries.length > 0
    ? compatible.filter(ex =>
        !profile.injuries.some(injury =>
          ex.targetMuscles.some(m => m.toLowerCase().includes(injury.toLowerCase()))
        )
      )
    : compatible;

  // Prioritize based on goal
  const goalPriority = profile.goal === "build_muscle" ? "hypertrophy"
    : profile.goal === "lose_weight" ? "cardio"
    : profile.goal === "improve_endurance" ? "endurance"
    : "strength";

  const prioritized = safe.sort((a, b) => {
    const aScore = a.category === goalPriority ? 1 : 0;
    const bScore = b.category === goalPriority ? 1 : 0;
    return bScore - aScore;
  });

  // Return enough for a week of workouts
  const needed = profile.daysPerWeek * (profile.level === "beginner" ? 4 : profile.level === "advanced" ? 6 : 5);
  return prioritized.slice(0, Math.max(needed, 20));
}

function getWorkoutName(goal: string, dayIndex: number, daysPerWeek: number): string {
  const names: Record<string, string[]> = {
    build_muscle: ["Upper Body Strength", "Lower Body Strength", "Push Focus", "Pull Focus", "Full Body Hypertrophy", "Arms & Core"],
    lose_weight: ["Full Body Metabolic", "Cardio & Core", "Upper Body Circuit", "Lower Body Circuit", "HIIT Cardio", "Active Recovery"],
    improve_endurance: ["Endurance Run/Walk", "Cardio Intervals", "Full Body Endurance", "Steady State Cardio", "Cross-Training", "Recovery Walk"],
    general_fitness: ["Full Body Strength", "Cardio & Conditioning", "Upper Body", "Lower Body", "Core & Mobility", "Active Recovery"],
    maintain: ["Full Body Maintenance", "Light Cardio", "Upper Body", "Lower Body", "Mobility & Core", "Recovery"],
  };
  return names[goal]?.[dayIndex % names[goal].length] || "Full Body Workout";
}

function getWorkoutFocus(goal: string, dayIndex: number, daysPerWeek: number): string {
  const foci: Record<string, string[]> = {
    build_muscle: ["upper_body", "lower_body", "push", "pull", "full_body", "arms_core"],
    lose_weight: ["full_body", "cardio", "upper_body", "lower_body", "hiit", "recovery"],
    improve_endurance: ["cardio", "intervals", "full_body", "steady_state", "cross_training", "recovery"],
    general_fitness: ["full_body", "cardio_conditioning", "upper_body", "lower_body", "core_mobility", "recovery"],
    maintain: ["full_body", "light_cardio", "upper_body", "lower_body", "mobility_core", "recovery"],
  };
  return foci[goal]?.[dayIndex % foci[goal].length] || "full_body";
}

function getRepRange(goal: string, level: string): string {
  if (goal === "build_muscle" || goal === "maintain") {
    return level === "beginner" ? "10-12" : level === "advanced" ? "6-10" : "8-12";
  }
  if (goal === "lose_weight") {
    return level === "beginner" ? "12-15" : "10-15";
  }
  if (goal === "improve_endurance") {
    return "15-20";
  }
  return "8-12";
}

function getRestTime(goal: string): number {
  if (goal === "build_muscle") return 90;
  if (goal === "lose_weight") return 45;
  if (goal === "improve_endurance") return 30;
  return 60;
}

function getRpeTarget(level: string): number {
  if (level === "beginner") return 6;
  if (level === "advanced") return 8;
  return 7;
}

function getWeekNumber(date: Date): number {
  const startOfYear = new Date(date.getFullYear(), 0, 1);
  const diff = date.getTime() - startOfYear.getTime();
  const oneWeek = 604800000;
  return Math.ceil((diff / oneWeek) / 7);
}

async function savePlan(uid: string, plan: WeeklyPlan): Promise<void> {
  const planId = `plan-${plan.weekNumber}-${Date.now()}`;
  await setDoc(doc(db, "users", uid, "plans", planId), plan as any);
}

async function generateAdaptation(uid: string, completedWorkout: any): Promise<WeeklyPlan | null> {
  // Simple adaptation: increment version, adjust based on completion
  const profile = await getProfile(uid);
  if (!profile) return null;

  // Get current plan
  const q = query(
    collection(db, "users", uid, "plans"),
    orderBy("createdAt", "desc"),
    limit(1)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;

  const currentPlan = snap.docs[0].data() as WeeklyPlan;
  const adapted: WeeklyPlan = {
    ...currentPlan,
    version: (currentPlan.version || 1) + 1,
    updatedAt: serverTimestamp() as any,
  };

  // Adjust based on workout completion
  if (completedWorkout && completedWorkout.completed) {
    // Progressive overload: increase sets by 1 for exercises that were completed
    adapted.days = adapted.days.map(day => ({
      ...day,
      workouts: day.workouts.map(workout => ({
        ...workout,
        exercises: workout.exercises.map(ex => {
          const wasCompleted = completedWorkout.exercises?.some(
            ce => ce.exerciseId === ex.exerciseId && ce.sets?.every(s => s.completed)
          );
          if (wasCompleted) {
            return {
              ...ex,
              sets: Math.min(ex.sets + 1, 5), // cap at 5 sets
            };
          }
          return ex;
        }),
      })),
    }));
  }

  const adaptedPlanId = `plan-${adapted.weekNumber}-${Date.now()}`;
  await setDoc(doc(db, "users", uid, "plans", adaptedPlanId), adapted as any);
  return adapted;
}

function computeRecoveryScore(input: RecoveryInput): {
  score: number;
  recommendation: "train_normal" | "reduce_volume" | "reduce_intensity" | "rest";
  text: string;
  factors: { name: string; value: string; impact: "positive" | "negative" }[];
  dataSources: string[];
  dataAgeHours: number;
} {
  let score = 70; // baseline
  const factors: { name: string; value: string; impact: "positive" | "negative" }[] = [];
  const dataSources: string[] = [];

  // Sleep
  if (input.sleepDuration) {
    dataSources.push("user_reported");
    if (input.sleepDuration >= 7 && input.sleepDuration <= 9) {
      score += 15;
      factors.push({ name: "Sleep Duration", value: `${input.sleepDuration} hours`, impact: "positive" });
    } else if (input.sleepDuration >= 6) {
      score += 5;
      factors.push({ name: "Sleep Duration", value: `${input.sleepDuration} hours`, impact: "positive" });
    } else {
      score -= 15;
      factors.push({ name: "Sleep Duration", value: `${input.sleepDuration} hours`, impact: "negative" });
    }
  }

  // Sleep quality
  if (input.sleepQuality !== undefined) {
    if (input.sleepQuality >= 4) {
      score += 10;
      factors.push({ name: "Sleep Quality", value: `${input.sleepQuality}/5`, impact: "positive" });
    } else if (input.sleepQuality >= 2) {
      score += 0;
      factors.push({ name: "Sleep Quality", value: `${input.sleepQuality}/5`, impact: "negative" });
    } else {
      score -= 10;
      factors.push({ name: "Sleep Quality", value: `${input.sleepQuality}/5`, impact: "negative" });
    }
  }

  // HRV
  if (input.hrv !== undefined) {
    dataSources.push("wearable");
    if (input.hrv > 50) {
      score += 10;
      factors.push({ name: "HRV", value: `${input.hrv} ms`, impact: "positive" });
    } else if (input.hrv > 30) {
      score += 0;
      factors.push({ name: "HRV", value: `${input.hrv} ms`, impact: "negative" });
    } else {
      score -= 10;
      factors.push({ name: "HRV", value: `${input.hrv} ms`, impact: "negative" });
    }
  }

  // Resting heart rate
  if (input.restingHeartRate !== undefined) {
    dataSources.push("wearable");
    if (input.restingHeartRate < 60) {
      score += 5;
      factors.push({ name: "Resting HR", value: `${input.restingHeartRate} bpm`, impact: "positive" });
    } else if (input.restingHeartRate < 70) {
      score += 0;
    } else {
      score -= 5;
      factors.push({ name: "Resting HR", value: `${input.restingHeartRate} bpm`, impact: "negative" });
    }
  }

  // Workout frequency (too many recent workouts = fatigue)
  if (input.workoutFrequency !== undefined) {
    if (input.workoutFrequency <= 2) {
      score += 5;
      factors.push({ name: "Recent Workouts", value: `${input.workoutFrequency} this week`, impact: "positive" });
    } else if (input.workoutFrequency <= 4) {
      score += 0;
      factors.push({ name: "Recent Workouts", value: `${input.workoutFrequency} this week`, impact: "negative" });
    } else {
      score -= 10;
      factors.push({ name: "Recent Workouts", value: `${input.workoutFrequency} this week`, impact: "negative" });
    }
  }

  // Energy level from check-in
  if (input.energyLevel !== undefined) {
    if (input.energyLevel >= 4) {
      score += 10;
      factors.push({ name: "Energy Level", value: `${input.energyLevel}/5`, impact: "positive" });
    } else if (input.energyLevel >= 2) {
      score += 0;
      factors.push({ name: "Energy Level", value: `${input.energyLevel}/5`, impact: "negative" });
    } else {
      score -= 10;
      factors.push({ name: "Energy Level", value: `${input.energyLevel}/5`, impact: "negative" });
    }
  }

  // Clamp score
  score = Math.max(0, Math.min(100, score));

  // Determine recommendation
  let recommendation: "train_normal" | "reduce_volume" | "reduce_intensity" | "rest";
  let text: string;

  if (score >= 75) {
    recommendation = "train_normal";
    text = "Your recovery looks good. You're cleared for normal training today.";
  } else if (score >= 55) {
    recommendation = "reduce_volume";
    text = "Your recovery is moderate. Consider reducing today's volume by 20-30% or choosing a lighter workout.";
  } else if (score >= 35) {
    recommendation = "reduce_intensity";
    text = "Your recovery is low. Reduce intensity today — lighter weights, lower RPE, or substitute with mobility work.";
  } else {
    recommendation = "rest";
    text = "Your recovery is very low. Take a rest day today. Focus on sleep, hydration, and light movement like walking or stretching.";
  }

  factors.push({ name: "Recovery Score", value: `${score}/100`, impact: score >= 55 ? "positive" : "negative" });

  return {
    score,
    recommendation,
    text,
    factors,
    dataSources: dataSources.length > 0 ? dataSources : ["user_reported"],
    dataAgeHours: 0,
  };
}
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
// ═══════════════════════════════════════════════════════════════════════════
// POLYVERSES PM WORKBENCH — Agent Layer (F00–F11 Orchestration)
// ═══════════════════════════════════════════════════════════════════════════

import {
  AGENTS, getAgent, listAgentIds, findAgentsByTriggers, type AgentDefinition, type ModelTier
} from "./src/agents/index";

// ─── Budget Tracking State ───────────────────────────────────────────────────

interface PerAgentBudget {
  used: number;
  budget: number;
}

interface BudgetState {
  sessionUsed: number;
  sessionBudget: number;
  weeklyUsed: number;
  weeklyBudget: number;
  perAgent: Record<string, PerAgentBudget>;
  circuitBreakerLevel: 'none' | 'small' | 'medium' | 'capable';
}

const sessionBudget: BudgetState = {
  sessionUsed: 0,
  sessionBudget: 200_000,
  weeklyUsed: 0,
  weeklyBudget: 500_000,
  perAgent: {},
  circuitBreakerLevel: 'none',
};

for (const [id, agent] of Object.entries(AGENTS)) {
  sessionBudget.perAgent[id] = { used: 0, budget: agent.defaultBudget };
}

function checkBudget(agentId: string, estimatedTokens: number): { allowed: boolean; reason?: string } {
  const agentBudget = sessionBudget.perAgent[agentId];
  if (!agentBudget) {
    return { allowed: false, reason: `Unknown agent: ${agentId}` };
  }
  if (agentBudget.used + estimatedTokens > agentBudget.budget) {
    sessionBudget.circuitBreakerLevel = 'small';
    return { allowed: false, reason: `Agent ${agentId} budget exceeded.` };
  }
  if (sessionBudget.sessionUsed + estimatedTokens > sessionBudget.sessionBudget) {
    sessionBudget.circuitBreakerLevel = 'medium';
    return { allowed: false, reason: `Session budget exceeded.` };
  }
  return { allowed: true };
}

function recordUsage(agentId: string, inputTokens: number, outputTokens: number) {
  const total = inputTokens + outputTokens;
  sessionBudget.sessionUsed += total;
  sessionBudget.perAgent[agentId].used += total;
  for (const [, budget] of Object.entries(sessionBudget.perAgent)) {
    if (budget.used > budget.budget) sessionBudget.circuitBreakerLevel = 'small';
  }

function checkBudget(agentId: string, estimatedTokens: number): { allowed: boolean; reason?: string } {
  const agentBudget = sessionBudget.perAgent[agentId];
  if (!agentBudget) {
    return { allowed: false, reason: `Unknown agent: ${agentId}` };
  }
  if (agentBudget.used + estimatedTokens > agentBudget.budget) {
    sessionBudget.circuitBreakerLevel = 'small';
    return { allowed: false, reason: `Agent ${agentId} budget exceeded.` };
  }
  if (sessionBudget.sessionUsed + estimatedTokens > sessionBudget.sessionBudget) {
    sessionBudget.circuitBreakerLevel = 'medium';
    return { allowed: false, reason: `Session budget exceeded.` };
  }
  return { allowed: true };
}

function recordUsage(agentId: string, inputTokens: number, outputTokens: number) {
  const total = inputTokens + outputTokens;
  sessionBudget.sessionUsed += total;
  sessionBudget.perAgent[agentId].used += total;
  for (const [, budget] of Object.entries(sessionBudget.perAgent)) {
    if (budget.used > budget.budget) sessionBudget.circuitBreakerLevel = 'small';
  }
  if (sessionBudget.sessionUsed > sessionBudget.sessionBudget) {
    sessionBudget.circuitBreakerLevel = 'medium';
  }
}

// ─── Orchestrator Router (F00) ───────────────────────────────────────────────

async function orchestrateQuery(
  uid: string,
  query: string,
  context?: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  const budgetCheck = checkBudget('F00', 1000);
  if (!budgetCheck.allowed) {
    return { success: false, error: budgetCheck.reason };
  }

  let routingDecision: any = null;
  try {
    const f00 = getAgent('F00');
    const prompt = `${f00.systemPrompt}\n\nPM QUERY: "${query}"\n${context ? `CONTEXT: "${context}"` : ''}`;

    if (ai && key && key !== 'MY_GEMINI_API_KEY') {
      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: prompt,
      });
      const text = response.text() || '';
      try {
        const jsonMatch = text.match(/\{[s\S]*\}/);
        routingDecision = jsonMatch ? JSON.parse(jsonMatch[0]) : { primaryAgent: extractAgentId(text), rationale: text, confidence: 0.5 };
      } catch {
        routingDecision = { primaryAgent: extractAgentId(text), rationale: text, confidence: 0.5 };
      }
    } else {
      routingDecision = deterministicRoute(query);
    }
  } catch (err) {
    console.error('F00 routing error:', err);
    return { success: false, error: `Routing failed: ${err instanceof Error ? err.message : String(err)}` };
  }

  const primaryAgentId = routingDecision?.primaryAgent || 'F00';
  if (!AGENTS[primaryAgentId]) {
    return { success: false, error: `Unknown agent ${primaryAgentId}` };
  }

  const agent = AGENTS[primaryAgentId];
  const result = await invokeAgent(uid, agent, query, context, routingDecision);
  recordUsage(primaryAgentId, result.inputTokens, result.outputTokens);

  logAgentRun(uid, primaryAgentId, agent.modelTier, result.inputTokens, result.outputTokens,
    routingDecision?.intent || 'orchestrated', result.output, routingDecision?.requiresGate || false);

  return { success: true, data: {
    routing: routingDecision,
    agentId: primaryAgentId,
    agentName: agent.name,
    modelTier: agent.modelTier,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    output: result.output,
    requiresGate: agent.requiresGate,
    budget: {
      sessionUsed: sessionBudget.sessionUsed,
      sessionRemaining: sessionBudget.sessionBudget - sessionBudget.sessionUsed,
      weeklyUsed: sessionBudget.weeklyUsed,
      weeklyRemaining: sessionBudget.weeklyBudget - sessionBudget.weeklyUsed,
    }
  }};
}

function extractAgentId(text: string): string | null {
  const match = text.match(/F\d{2}/);
  if (match && AGENTS[match[0]]) return match[0];
  const lower = text.toLowerCase();
  if (lower.includes('prompt') || lower.includes('rewrite')) return 'F01';
  if (lower.includes('requirement') || lower.includes('user story') || lower.includes('acceptance')) return 'F02';
  if (lower.includes('architecture') || lower.includes('technical design') || lower.includes('RFC')) return 'F03';
  if (lower.includes('release') || lower.includes('launch') || lower.includes('cut list')) return 'F04';
  if (lower.includes('sprint') || lower.includes('backlog') || lower.includes('task')) return 'F05';
  if (lower.includes('discover') || lower.includes('research') || lower.includes('validate') || lower.includes('assumption')) return 'F06';
  if (lower.includes('risk')) return 'F07';
  if (lower.includes('metric') || lower.includes('KPI') || lower.includes('dashboard') || lower.includes('measure')) return 'F08';
  if (lower.includes('estimate') || lower.includes('prioritize') || lower.includes('RICE') || lower.includes('impact')) return 'F09';
  if (lower.includes('change') || lower.includes('adoption') || lower.includes('communication') || lower.includes('stakeholder')) return 'F10';
  if (lower.includes('note') || lower.includes('knowledge') || lower.includes('index') || lower.includes('curate')) return 'F11';
  return 'F02';
}

function deterministicRoute(query: string): any {
  const agents = findAgentsByTriggers([query]);
  if (agents.length > 0) {
    const primary = agents[0];
    return {
      primaryAgent: primary.id,
      primaryAgentName: primary.name,
      rationale: `Matched "${primary.name}" based on query keywords.`,
      secondaryAgents: agents.slice(1).map(a => a.id),
      requiresGate: primary.requiresGate,
      intent: primary.id.toLowerCase(),
      confidence: 0.7,
    };
  }
  return {
    primaryAgent: 'F02',
    primaryAgentName: 'Requirements Engineer',
    rationale: 'No specific agent matched. Defaulting to Requirements Engineer.',
    requiresGate: false,
    intent: 'general',
    confidence: 0.4,
  };
}

// ─── Agent Invocation ─────────────────────────────────────────────────────────

interface InvocationResult {
  output: string;
  inputTokens: number;
  outputTokens: number;
}

async function invokeAgent(
  uid: string,
  agent: AgentDefinition,
  query: string,
  context?: string,
  routingDecision?: any
): Promise<InvocationResult> {
  let prompt = `${agent.systemPrompt}\n\n`;
  prompt += `PM QUERY: "${query}"\n`;
  if (context) prompt += `CONTEXT: "${context}"\n`;
  if (routingDecision) {
    prompt += `\nROUTING DECISION:\n`;
    prompt += `- Primary Agent: ${routingDecision.primaryAgent} (${routingDecision.primaryAgentName})\n`;
    prompt += `- Rationale: ${routingDecision.rationale}\n`;
    if (routingDecision.secondaryAgents?.length) {
      prompt += `- Secondary Agents: ${routingDecision.secondaryAgents.join(', ')}\n`;
    }
    prompt += `- Intent: ${routingDecision.intent}\n`;
    prompt += `- Confidence: ${routingDecision.confidence}\n`;
  }
  prompt += `\nINSTRUCTIONS: Provide a thorough, actionable response. Use markdown formatting.\n`;

  const estimatedInput = Math.ceil(prompt.length / 4);
  const estimatedOutput = agent.estimatedTokens.output;

  const budgetCheck = checkBudget(agent.id, estimatedInput + estimatedOutput);
  if (!budgetCheck.allowed) {
    return { output: `[CIRCUIT BREAKER] ${budgetCheck.reason}`, inputTokens: estimatedInput, outputTokens: 0 };
  }

  let output = '';
  let inputTokens = 0;
  let outputTokens = 0;

  if (ai && key && key !== 'MY_GEMINI_API_KEY') {
    try {
      let modelName: string;
      switch (agent.modelTier) {
        case 'flash': modelName = 'gemini-2.0-flash'; break;
        case 'flash-thinking': modelName = 'gemini-2.0-flash-thinking-exp'; break;
        case 'pro': modelName = 'gemini-2.0-pro'; break;
        default: modelName = 'gemini-2.0-flash';
      }
      const response = await ai.models.generateContent({ model: modelName, contents: prompt });
      output = response.text() || '(no response)';
      inputTokens = Math.ceil(prompt.length / 4);
      outputTokens = Math.ceil(output.length / 4);
      console.log(`[Agent ${agent.id}] ${modelName}: ${inputTokens} in, ${outputTokens} out`);
    } catch (err) {
      console.error(`[Agent ${agent.id}] Gemini error:`, err);
      output = `[ERROR] Invocation failed: ${err instanceof Error ? err.message : String(err)}`;
      inputTokens = Math.ceil(prompt.length / 4);
      outputTokens = 50;
    }
  } else {
    output = sandboxAgentResponse(agent.id, query, context);
    inputTokens = Math.ceil(prompt.length / 4);
    outputTokens = Math.ceil(output.length / 4);
  }

  return { output, inputTokens, outputTokens };
}

function sandboxAgentResponse(agentId: string, query: string, _context?: string): string {
  const q = query.length > 60 ? query.slice(0, 60) + '...' : query;

  switch (agentId) {
    case 'F00':
      return `## Routing Decision

**Primary Agent**: F02 — Requirements Engineer
**Rationale**: The query "${q}" is best handled by F02.
**Secondary Agents**: F07, F09
**Intent**: requirements-drafting
**Confidence**: 0.85

*Sandbox routing — connect Gemini API for AI routing.*`;

    case 'F01':
      return `## Prompt Analysis: ${q}

### Issues
1. Role clarity — agent expertise not defined
2. Output structure — no defined format
3. Constraints — no boundaries

### Recommended Prompt
\`\`\`
You are a senior PM. Task: [specific]. Output: [format]. Constraints: [boundaries].
\`\`\`

*Sandbox — connect Gemini API.*`;

    case 'F02':
      return `## Requirements: ${q}

### Problem
The product needs to [problem]. Affects [users] who [pain point].

### User Stories
1. As a [role], I want [action], so that [benefit].
   - AC1: [testable]

### Functional Requirements
- FR1: System shall [requirement].

### Out of Scope
- [Not covered]

### Open Questions
- [Needs clarification]

*Sandbox — connect Gemini API.*`;

    case 'F03':
      return `## Technical Design: ${q}

### Option 1: [Approach]
Overview: [paragraph]. Pros: [list]. Cons: [list]. Effort: [size].

### Option 2: [Approach]
Overview: [paragraph]. Pros: [list]. Cons: [list]. Effort: [size].

### Recommendation
Option [X] — [rationale].

### Risks
- [Risk]: [mitigation]

*Sandbox — connect Gemini API.*`;

    case 'F04':
      return `## Release Plan: ${q}

### Overview
Goal: [what]. Target: [date].

### Cut List
| Feature | Owner | Priority | Status |
|---------|-------|----------|--------|
| [F1] | [O] | P0 | Committed |

### Risks
| Risk | L | I | Mitigation | Owner |
|------|---|---|------------|-------|

### Milestones
- Freeze: [date]
- Launch: [date]

*Sandbox — connect Gemini API.*`;

    case 'F05':
      return `## Sprint: ${q}

### Goal
[Outcome sentence]

### Backlog
| Item | Tasks | AC | P | Est |
|------|-------|----|---|-----|
| [I1] | [t1, t2] | [AC] | P0 | M |

### Blockers
- [B1]: [desc]

*Sandbox — connect Gemini API.*`;

    case 'F06':
      return `## Discovery: ${q}

### Assumptions
1. [A1]: [Risk level] — [why]
2. [A2]: [Risk level] — [why]

### Validate First
[Riskiest assumption] — if wrong, idea fails.

### Activities
| Activity | Method | Sample | Effort | Success |
|----------|--------|--------|--------|---------|
| [A1] | [Method] | [N] | [Time] | [Criteria] |

*Sandbox — connect Gemini API.*`;

    case 'F07':
      return `## Risks: ${q}

| Risk | Category | L | I | Mitigation | Owner |
|------|----------|---|---|------------|-------|
| [R1] | [Cat] | M | H | [Mit] | [O] |

### Top 3
1. [R1]: [why urgent] — [action]

*Sandbox — connect Gemini API.*`;

    case 'F08':
      return `## Metrics: ${q}

### North Star
[Metric] — Definition: [what]. Target: [value].

### Key Results
1. [M1]: [def] — Target: [v]
2. [M2]: [def] — Target: [v]

### Counter Metrics
- [M]: [why watch]

*Sandbox — connect Gemini API.*`;

    case 'F09':
      return `## Prioritization: ${q}

| Rank | Item | R | I | C | E | RICE | Why |
|------|------|---|---|---|---|------|-----|
| 1 | [I1] | [1-10] | [1-10] | [50-100%] | [XS-XL] | [S] | [why] |

### Top Picks
1. [Item]: [why]

*Sandbox — connect Gemini API.*`;

    case 'F10':
      return `## Change Comms: ${q}

### Summary
[What + why]

### Audiences
- [A1]: [need to know]
- [A2]: [need to know]

### Draft
**Headline**: [one line]
**What**: [clear description]
**Why**: [reason]
**FAQ**: Q: [q]? A: [a]

*Sandbox — connect Gemini API.*`;

    case 'F11':
      return `## Curation: ${q}

### Tags: [tag1, tag2]
### Project: [proj or Unassigned]
### Type: [decision/note/capture]
### Confidence: 0.85

### Links
- [src] → [tgt]: [relation] — [why]

*Sandbox — connect Gemini API.*`;

    default:
      return `## Response from ${agentId}

Query: "${q}"

*Sandbox — connect Gemini API.*`;
  }
}

// ─── Observability ────────────────────────────────────────────────────────────

interface AgentRun {
  id: string;
  agentId: string;
  modelTier: ModelTier;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  intent: string;
  outcome: string;
  decisionGateTriggered: boolean;
  timestamp: string;
  userId: string;
}

const recentRuns: AgentRun[] = [];

async function logAgentRun(
  uid: string, agentId: string, modelTier: ModelTier,
  inputTokens: number, outputTokens: number,
  intent: string, outcome: string, decisionGateTriggered: boolean
): Promise<void> {
  const run: AgentRun = {
    id: `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    agentId, modelTier, inputTokens, outputTokens,
    durationMs: 0, intent, outcome: outcome.slice(0, 500),
    decisionGateTriggered,
    timestamp: new Date().toISOString(),
    userId: uid,
  };
  recentRuns.unshift(run);
  if (recentRuns.length > 100) recentRuns.pop();
  try {
    await setDoc(doc(db, 'agent_runs', run.id), run as any);
  } catch (err) {
    console.error('Failed to log:', err);
  }
}

async function handleObservability(uid: string): Promise<any> {
  const perAgent: Record<string, { used: number; budget: number; percentUsed: number }> = {};
  for (const [id, b] of Object.entries(sessionBudget.perAgent)) {
    perAgent[id] = { used: b.used, budget: b.budget, percentUsed: b.budget > 0 ? Math.round((b.used / b.budget) * 1000) / 10 : 0 };
  }
  const totalRuns = recentRuns.length;
  const totalTokens = recentRuns.reduce((s, r) => s + r.inputTokens + r.outputTokens, 0);
  const avgTokens = totalRuns > 0 ? Math.round(totalTokens / totalRuns) : 0;
  const gateRate = totalRuns > 0 ? recentRuns.filter(r => r.decisionGateTriggered).length / totalRuns : 0;
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const weeklyRuns = recentRuns.filter(r => new Date(r.timestamp) > weekAgo);
  const weeklyTokens = weeklyRuns.reduce((s, r) => s + r.inputTokens + r.outputTokens, 0);

  return {
    budget: {
      sessionUsed: sessionBudget.sessionUsed,
      sessionBudget: sessionBudget.sessionBudget,
      sessionRemaining: sessionBudget.sessionBudget - sessionBudget.sessionUsed,
      sessionPercentUsed: sessionBudget.sessionBudget > 0 ? Math.round((sessionBudget.sessionUsed / sessionBudget.sessionBudget) * 1000) / 10 : 0,
      weeklyUsed: sessionBudget.weeklyUsed,
      weeklyBudget: sessionBudget.weeklyBudget,
      weeklyRemaining: sessionBudget.weeklyBudget - sessionBudget.weeklyUsed,
      weeklyPercentUsed: sessionBudget.weeklyBudget > 0 ? Math.round((sessionBudget.weeklyUsed / sessionBudget.weeklyBudget) * 1000) / 10 : 0,
      perAgent,
      circuitBreakerLevel: sessionBudget.circuitBreakerLevel,
    },
    runs: recentRuns.slice(0, 20),
    recentActivity: recentRuns.slice(0, 10).map(r => ({
      type: r.decisionGateTriggered ? 'decision_gate' : 'agent_run',
      description: `${r.agentId} — ${r.outcome.slice(0, 80)}...`,
      timestamp: r.timestamp,
    })),
    stats: {
      totalRuns, totalTokensUsed: totalTokens, averageTokensPerRun: avgTokens,
      decisionGateRate: Math.round(gateRate * 1000) / 10,
      circuitBreakerTriggers: sessionBudget.circuitBreakerLevel !== 'none' ? 1 : 0,
      weeklyRunCount: weeklyRuns.length,
      weeklyTokenUsage: weeklyTokens,
    },
  };
}

// ─── API Endpoints ────────────────────────────────────────────────────────────

app.post('/api/orchestrate', async (req, res) => {
  const uid = requireAuth(req);
  if (!uid) return;
  try {
    const { query, context } = req.body || {};
    if (!query || typeof query !== 'string') {
      res.status(400).json({ error: 'Missing or invalid "query" in request body.' });
      return;
    }
    console.log(`[Orchestrate] UID=${uid} query="${query.slice(0, 100)}"`);
    const result = await orchestrateQuery(uid, query, context || undefined);
    if (!result.success) { res.status(500).json({ error: result.error }); return; }
    res.json({ success: true, data: result.data });
  } catch (err) {
    console.error('[Orchestrate] Error:', err);
    res.status(500).json({ error: `Orchestration failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

app.get('/api/observability', async (req, res) => {
  const uid = requireAuth(req);
  if (!uid) return;
  try {
    res.json({ success: true, data: await handleObservability(uid) });
  } catch (err) {
    console.error('[Observability] Error:', err);
    res.status(500).json({ error: `Observability failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

app.get('/api/agents', (req, res) => {
  const uid = requireAuth(req);
  if (!uid) return;
  const agents = listAgentIds().map(id => {
    const a = AGENTS[id];
    return { id: a.id, name: a.name, description: a.description, modelTier: a.modelTier, defaultBudget: a.defaultBudget, capabilities: a.capabilities, triggers: a.triggers, requiresGate: a.requiresGate, estimatedTokens: a.estimatedTokens };
  });
  res.json({ success: true, data: { agents, count: agents.length } });
});


// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 3: THREE-LAYER PIPELINE
//   Layer 1: Capture & Index
//   Layer 2: Retrieve & Assemble
//   Layer 3: Reason & Act
//   Governance: Human Gate + Distillation Scheduler
// ═══════════════════════════════════════════════════════════════════════════════

// ─── In-Memory Stores ───────────────────────────────────────────────────────────

const notesStore = new Map();
const gateQueue = new Map();
const distillationJobs = new Map();

const DISTILLATION_SCHEDULE = {
  frequency: 'weekly',
  dayOfWeek: 1,
  hourOfDay: 9,
  lastRunAt: 0,
  nextRunAt: 0,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────────

function generateNoteId() {
  return 'note_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
}

function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

function computeShorthand(text) {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= 200) return cleaned;
  const firstSentence = cleaned.split(/[.!?]+/).find(s => s.trim().length > 20);
  if (firstSentence) return firstSentence.trim().slice(0, 200) + '...';
  return cleaned.slice(0, 200) + '...';
}

function computeSummary(text) {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= 500) return cleaned;
  const sentences = cleaned.split(/[.!?]+/).filter(s => s.trim().length > 10);
  const selected = sentences.slice(0, 3).join('. ') + '.';
  return selected.length > 500 ? selected.slice(0, 500) + '...' : selected;
}

function extractTags(text, suggested) {
  const tagSet = new Set();
  if (suggested) suggested.forEach(t => tagSet.add(t.toLowerCase().replace(/\s+/g, '-')));
  const hashtags = text.match(/#[\w-]+/g);
  if (hashtags) hashtags.forEach(t => tagSet.add(t.slice(1).toLowerCase()));
  const pmTerms = ['roadmap', 'sprint', 'release', 'feature', 'bug', 'risk', 'metric', 'kpi', 'user-story', 'requirement', 'design', 'architecture', 'api', 'frontend', 'backend', 'infra', 'security', 'compliance'];
  const lowered = text.toLowerCase();
  pmTerms.forEach(term => { if (lowered.includes(term)) tagSet.add(term); });
  return Array.from(tagSet).slice(0, 10);
}

function extractProject(text, suggested) {
  if (suggested && suggested.trim()) return suggested.trim();
  const match = text.match(/\b(project|area|resource|archive)[:\s]+([^\n,;]+)/i);
  if (match) return match[2].trim();
  return 'Unassigned';
}

function classifyNoteType(text, suggested) {
  if (suggested && ['decision', 'meeting', 'capture', 'insight', 'reference'].includes(suggested)) return suggested;
  const lowered = text.toLowerCase();
  if (lowered.includes('decision') || lowered.includes('decided')) return 'decision';
  if (lowered.includes('meeting') || lowered.includes('agenda')) return 'meeting';
  if (lowered.includes('insight') || lowered.includes('learned')) return 'insight';
  if (lowered.includes('http') || lowered.includes('doc') || lowered.includes('reference')) return 'reference';
  return 'capture';
}

function findRelatedNotes(text, store) {
  const related = [];
  const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 4);
  for (const [id, note] of store) {
    if (!note || !note.tags) continue;
    const noteWords = (note.tags || []).join(' ').toLowerCase() + ' ' + (note.shorthand || '').toLowerCase();
    let overlap = 0;
    for (const w of words) { if (noteWords.includes(w)) overlap++; }
    if (overlap >= 2 && related.length < 5) related.push(id);
  }
  return related;
}

function parseAgentOutputForActions(output, userId) {
  const actions = [];
  const noteMatches = output.match(/\[NOTE\](.*?)(?=\[|$|)/gs);
  if (noteMatches) {
    for (const match of noteMatches) {
      try {
        const content = match.replace('[NOTE]', '').trim();
        const parsed = JSON.parse(content);
        actions.push({ action: 'create_note', data: { text: parsed.text || content, tags: parsed.tags, project: parsed.project, type: parsed.type || 'insight', userId } });
      } catch {
        actions.push({ action: 'create_note', data: { text: content, type: 'capture', userId } });
      }
    }
  }
  const decisionMatches = output.match(/\[DECISION\](.*?)(?=\[|$|)/gs);
  if (decisionMatches) {
    for (const match of decisionMatches) {
      actions.push({ action: 'create_note', data: { text: match.replace('[DECISION]', '').trim(), type: 'decision', tags: ['decision'], userId } });
    }
  }
  return actions;
}

// ─── Layer 1: Capture & Index ────────────────────────────────────────────────────

async function handleCapture(uid, body) {
  const { text, source = 'manual', tags, project, type, parentNoteId } = body || {};
  if (!text || typeof text !== 'string' || !text.trim()) {
    return { success: false, error: 'Missing or empty "text" field.' };
  }
  const trimmed = text.trim().slice(0, 100000);
  const noteId = generateNoteId();
  const now = Date.now();
  const note = {
    id: noteId, userId: uid, verbatim_text: trimmed,
    shorthand: computeShorthand(trimmed), summary: computeSummary(trimmed), principle: '',
    tags: extractTags(trimmed, tags), project: extractProject(trimmed, project),
    type: classifyNoteType(trimmed, type), agentId: undefined, agentRunId: undefined,
    relatedNoteIds: findRelatedNotes(trimmed, notesStore), linksTo: [],
    confidence: 0.85, createdAt: now, updatedAt: now, distillationLevel: 1,
    _lastIndexedAt: now, _indexConfidence: 0.85, _linkCount: 0, _timesReferenced: 0,
  };
  notesStore.set(noteId, note);
  console.log('[Capture] UID=' + uid + ' note=' + noteId + ' type=' + note.type + ' project=' + note.project);
  return {
    success: true,
    data: {
      noteId, shorthand: note.shorthand, summary: note.summary, tags: note.tags,
      project: note.project, type: note.type, confidence: 0.85,
      relatedNoteIds: note.relatedNoteIds, distillationLevel: 1, createdAt: now,
    }
  };
}

async function handleIndex(uid, noteId) {
  const note = notesStore.get(noteId);
  if (!note) return { success: false, error: 'Note not found: ' + noteId };
  if (note.userId !== uid) return { success: false, error: 'Unauthorized.' };
  note.tags = extractTags(note.verbatim_text);
  note.project = extractProject(note.verbatim_text);
  note.type = classifyNoteType(note.verbatim_text);
  note.shorthand = computeShorthand(note.verbatim_text);
  note.summary = computeSummary(note.verbatim_text);
  note.relatedNoteIds = findRelatedNotes(note.verbatim_text, notesStore);
  note.confidence = 0.9; note.updatedAt = Date.now(); note._lastIndexedAt = Date.now(); note._indexConfidence = 0.9;
  note._linkCount = note.relatedNoteIds.length;
  notesStore.set(noteId, note);
  console.log('[Index] UID=' + uid + ' note=' + noteId + ' re-indexed');
  return {
    success: true,
    data: {
      noteId, assignedTags: note.tags, assignedProject: note.project,
      assignedType: note.type, confidence: 0.9, relatedNoteIds: note.relatedNoteIds,
      shorthand: note.shorthand, summary: note.summary, linksTo: [], updatedAt: note.updatedAt,
    }
  };
}

// ─── Layer 2: Retrieve & Assemble ────────────────────────────────────────────────

async function handleRetrieve(uid, body) {
  const { query, strategy = 'query-focused', filters, limit = 10 } = body || {};
  if (!query || typeof query !== 'string') return { success: false, error: 'Missing or invalid "query".' };

  const candidateNotes = [];
  for (const [id, note] of notesStore) {
    if (note.userId !== uid) continue;
    if (filters && filters.project && note.project !== filters.project && note.project !== 'Unassigned') continue;
    if (filters && filters.tags && filters.tags.length) {
      const hasTag = filters.tags.some(t => (note.tags || []).includes(t) || (note.tags || []).some(nt => nt.includes(t)));
      if (!hasTag) continue;
    }
    if (filters && filters.type && note.type !== filters.type) continue;
    if (filters && filters.dateFrom && note.createdAt < filters.dateFrom) continue;
    if (filters && filters.dateTo && note.createdAt > filters.dateTo) continue;
    if (filters && filters.agentId && note.agentId !== filters.agentId) continue;
    if (filters && filters.minConfidence && (note.confidence || 0) < filters.minConfidence) continue;
    candidateNotes.push(note);
  }

  if (candidateNotes.length === 0) {
    return {
      success: true,
      data: {
        contextId: 'ctx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
        noteIds: [], scores: {}, strategy,
        queryUnderstanding: { parsedQuery: query, detectedIntents: [], keyEntities: [], confidence: 0 },
        filtersApplied: [], totalConsidered: 0, tokenEstimate: 0,
      }
    };
  }

  const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const scores = {};
  for (const note of candidateNotes) {
    let score = 0;
    const noteTags = (note.tags || []).map(t => t.toLowerCase());
    for (const w of queryWords) {
      if (noteTags.includes(w)) score += 0.3;
      if (noteTags.some(t => t.includes(w))) score += 0.2;
      if ((note.shorthand || '').toLowerCase().includes(w)) score += 0.15;
      if ((note.summary || '').toLowerCase().includes(w)) score += 0.15;
      if (note.verbatim_text.toLowerCase().includes(w)) score += 0.1;
    }
    const ageDays = (Date.now() - note.createdAt) / 86400000;
    if (ageDays < 1) score += 0.15;
    else if (ageDays < 7) score += 0.1;
    if (note.confidence) score += (note.confidence - 0.5) * 0.2;
    scores[note.id] = Math.min(1, score);
  }

  const sorted = candidateNotes.sort((a, b) => (scores[b.id] || 0) - (scores[a.id] || 0));
  const selected = sorted.slice(0, limit);
  const selectedIds = selected.map(n => n.id);
  const assembledText = selected.map(n =>
    '## ' + n.id + ' (' + (n.type || 'capture') + ' \u00b7 ' + (n.project || 'Unassigned') + ')\n**Shorthand:** ' + (n.shorthand || '') + '\n**Summary:** ' + (n.summary || '') + '\n**Verbatim:** ' + (n.verbatim_text || '') + '\n---\n'
  ).join('\n\n');
  const tokenEstimate = estimateTokens(assembledText);

  const intents = [];
  const lowered = query.toLowerCase();
  if (lowered.includes('require') || lowered.includes('user story')) intents.push('requirements-drafting');
  if (lowered.includes('architect') || lowered.includes('design') || lowered.includes('rfc')) intents.push('technical-design');
  if (lowered.includes('release') || lowered.includes('launch')) intents.push('release-planning');
  if (lowered.includes('sprint') || lowered.includes('backlog')) intents.push('sprint-planning');
  if (lowered.includes('risk')) intents.push('risk-analysis');
  if (lowered.includes('metric') || lowered.includes('kpi')) intents.push('metrics-definition');
  if (lowered.includes('prioritize') || lowered.includes('rice')) intents.push('prioritization');
  if (lowered.includes('research') || lowered.includes('discover') || lowered.includes('validate')) intents.push('discovery');
  if (lowered.includes('note') || lowered.includes('knowledge') || lowered.includes('index')) intents.push('knowledge-curation');

  const filtersApplied = [];
  if (filters && filters.project) filtersApplied.push('project:' + filters.project);
  if (filters && filters.tags && filters.tags.length) filtersApplied.push('tags:' + filters.tags.join(','));
  if (filters && filters.type) filtersApplied.push('type:' + filters.type);

  const contextId = 'ctx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  console.log('[Retrieve] UID=' + uid + ' selected ' + selected.length + '/' + candidateNotes.length + ' notes, ' + tokenEstimate + ' tokens');

  return {
    success: true,
    data: {
      contextId, noteIds: selectedIds, scores, strategy,
      queryUnderstanding: {
        parsedQuery: query,
        detectedIntents: intents,
        keyEntities: queryWords.filter(w => w.length > 4).slice(0, 5),
        confidence: queryWords.length > 0 ? 0.7 : 0.3,
      },
      filtersApplied, totalConsidered: candidateNotes.length, tokenEstimate,
    }
  };
}

async function handleAssemble(uid, body) {
  const { noteIds, query, strategy = 'query-focused' } = body || {};
  if (!noteIds || !Array.isArray(noteIds) || noteIds.length === 0) return { success: false, error: 'Missing or empty "noteIds" array.' };

  const userNotes = [];
  for (const id of noteIds) {
    const note = notesStore.get(id);
    if (!note) return { success: false, error: 'Note not found: ' + id };
    if (note.userId !== uid) return { success: false, error: 'Note ' + id + ' does not belong to user.' };
    userNotes.push(note);
  }

  const assembledText = userNotes.map(n =>
    '## Note: ' + n.id + '\n**Type:** ' + (n.type || 'capture') + ' | **Project:** ' + (n.project || 'Unassigned') + ' | **Tags:** ' + ((n.tags || []).join(', ') || 'untagged') + '\n**Created:** ' + new Date(n.createdAt).toISOString() + '\n**Confidence:** ' + (n.confidence || 0.5) + '\n\n**Level 2 (Gist):** ' + (n.shorthand || '(none)') + '\n\n**Level 3 (Summary):** ' + (n.summary || '(none)') + '\n\n**Level 1 (Verbatim):** ' + (n.verbatim_text || '') + '\n\n---\n'
  ).join('\n\n');
  const tokenEstimate = estimateTokens(assembledText);
  const contextId = 'ctx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);

  console.log('[Assemble] UID=' + uid + ' assembled ' + userNotes.length + ' notes, ' + tokenEstimate + ' tokens');

  return {
    success: true,
    data: {
      contextId, userId: uid, query: query || '', assembledFrom: noteIds,
      assembledText, tokenEstimate, assembledAt: Date.now(),
      metadata: { strategy, filters: [], notesConsidered: noteIds.length, notesSelected: noteIds.length, cacheKey: 'assemble_' + uid + '_' + contextId, cacheHit: false },
      budgetWarning: tokenEstimate > 50000 ? 'Context exceeds 50K tokens. Consider narrowing.' : undefined,
    }
  };
}

// ─── Layer 3: Reason & Act ───────────────────────────────────────────────────────

async function handleReason(uid, body) {
  const { query, assembledContext, agentId, requiresGate: forceGate } = body || {};
  if (!query || typeof query !== 'string') return { success: false, error: 'Missing or invalid "query".' };
  if (!agentId || !AGENTS[agentId]) return { success: false, error: 'Unknown agent: ' + agentId };

  const agent = AGENTS[agentId];
  const shouldGate = forceGate !== undefined ? forceGate : agent.requiresGate;

  let prompt = 'AGENT: ' + agent.name + ' (' + agentId + ')\nSYSTEM PROMPT:\n' + agent.systemPrompt + '\n\nUSER QUERY: "' + query + '"\n\n';
  if (assembledContext) prompt += 'ASSEMBLED CONTEXT:\n' + assembledContext + '\n\n';
  prompt += 'INSTRUCTIONS:\n- Provide a thorough, actionable response using markdown.\n- Use [NOTE] markers for content to save as notes.\n- Use [DECISION] markers for decisions to record.\n- If no action is needed, state that clearly.\n';

  const estimatedTokens = estimateTokens(prompt) + agent.estimatedTokens.output;
  const budgetCheck = checkBudget(agentId, estimatedTokens);
  if (!budgetCheck.allowed) return { success: false, error: budgetCheck.reason };

  let output = '', inputTokens = 0, outputTokens = 0;

  if (ai && key && key !== 'MY_GEMINI_API_KEY') {
    try {
      let modelName;
      switch (agent.modelTier) { case 'flash': modelName = 'gemini-2.0-flash'; break; case 'flash-thinking': modelName = 'gemini-2.0-flash-thinking-exp'; break; case 'pro': modelName = 'gemini-2.0-pro'; break; default: modelName = 'gemini-2.0-flash'; }
      const response = await ai.models.generateContent({ model: modelName, contents: prompt });
      output = response.text() || '(no response)';
      inputTokens = estimateTokens(prompt); outputTokens = estimateTokens(output);
    } catch (err) {
      console.error('[Reason] Agent ' + agentId + ' Gemini error:', err);
      output = '[ERROR] Invocation failed: ' + (err instanceof Error ? err.message : String(err));
      inputTokens = estimateTokens(prompt); outputTokens = 50;
    }
  } else {
    output = sandboxReasonResponse(agentId, query);
    inputTokens = estimateTokens(prompt); outputTokens = estimateTokens(output);
  }

  recordUsage(agentId, inputTokens, outputTokens);

  const runId = 'run_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  const run = { id: runId, agentId, agentName: agent.name, modelTier: agent.modelTier, inputTokens, outputTokens, contextNoteIds: [], intent: body.intent || agentId.toLowerCase(), outcome: output.slice(0, 500), decisionGateTriggered: shouldGate, timestamp: Date.now(), userId: uid };

  if (shouldGate) {
    const gateId = 'gate_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    gateQueue.set(gateId, { id: gateId, agentRunId: runId, agentId, agentName: agent.name, intent: run.intent, output, outputTokens, timestamp: Date.now(), status: 'pending', expiresAt: Date.now() + 86400000 });
    run.gateId = gateId;
    console.log('[Reason] UID=' + uid + ' gate triggered for ' + agentId + ' gate=' + gateId);
  } else {
    const actions = parseAgentOutputForActions(output, uid);
    for (const action of actions) await executeAct(uid, action);
  }

  recentRuns.unshift(run);
  if (recentRuns.length > 100) recentRuns.pop();

  return {
    success: true,
    data: {
      runId, agentId, agentName: agent.name, modelTier: agent.modelTier,
      inputTokens, outputTokens, output, requiresGate: shouldGate,
      gateId: shouldGate ? run.gateId : undefined,
      budget: { sessionUsed: sessionBudget.sessionUsed, sessionRemaining: sessionBudget.sessionBudget - sessionBudget.sessionUsed, weeklyUsed: sessionBudget.weeklyUsed, weeklyRemaining: sessionBudget.weeklyBudget - sessionBudget.weeklyUsed },
    }
  };
}

function sandboxReasonResponse(agentId, query) {
  const q = query.length > 80 ? query.slice(0, 80) + '...' : query;
  switch (agentId) {
    case 'F02':
      return '## Requirements Draft\n\n**Query:** ' + q + '\n\n### User Stories\n1. As a [role], I want [action], so that [benefit].\n   - **AC1:** [testable criterion]\n\n### Functional Requirements\n- **FR1:** System shall [requirement].\n\n*Sandbox \u2014 connect Gemini API.*';
    case 'F03':
      return '## Technical Design\n\n**Query:** ' + q + '\n\n### Option 1: [Approach]\n- **Pros:** [list]\n- **Cons:** [list]\n\n### Option 2: [Approach]\n- **Pros:** [list]\n- **Cons:** [list]\n\n### Recommendation\nOption [X] \u2014 [rationale].\n\n*Sandbox \u2014 connect Gemini API.*';
    case 'F07':
      return '## Risk Analysis\n\n**Query:** ' + q + '\n\n| Risk | Category | L | I | Mitigation |\n|------|----------|---|---|------------|\n| [R1] | [Cat] | [1-5] | [1-5] | [Mitigation] |\n\n*Sandbox \u2014 connect Gemini API.*';
    case 'F09':
      return '## RICE Prioritization\n\n**Query:** ' + q + '\n\n| Rank | Item | Reach | Impact | Confidence | Effort | RICE |\n|------|------|-------|--------|------------|--------|------|\n| 1 | [Item] | [N] | [1-3] | [%] | [months] | [score] |\n\n*Sandbox \u2014 connect Gemini API.*';
    case 'F11':
      return '## Knowledge Curation\n\n**Query:** ' + q + '\n\n### Suggested Note\n- **Type:** insight\n- **Tags:** [tag1, tag2]\n- **Project:** Unassigned\n- **Shorthand:** [1-2 sentence gist]\n\n*Sandbox \u2014 connect Gemini API.*';
    default:
      return '## Response from ' + agentId + '\n\n**Query:** "' + q + '"\n\n*Sandbox \u2014 connect Gemini API.*';
  }
}

async function executeAct(uid, act) {
  const { action, data, noteId } = act;

  if (action === 'create_note') {
    const result = await handleCapture(uid, { userId: uid, text: data.text || '', tags: data.tags, project: data.project, type: data.type || 'capture', source: 'agent_output' });
    return result.success ? { action, noteId: result.data.noteId, success: true } : { action, success: false, error: result.error };
  }

  if (action === 'update_note') {
    if (!noteId) return { action, success: false, error: 'Missing noteId' };
    const note = notesStore.get(noteId);
    if (!note) return { action, success: false, error: 'Note not found: ' + noteId };
    if (data.shorthand !== undefined) note.shorthand = data.shorthand;
    if (data.summary !== undefined) note.summary = data.summary;
    if (data.principle !== undefined) note.principle = data.principle;
    if (data.tags !== undefined) note.tags = data.tags;
    if (data.project !== undefined) note.project = data.project;
    if (data.type !== undefined) note.type = data.type;
    note.updatedAt = Date.now(); note._lastIndexedAt = Date.now();
    notesStore.set(noteId, note);
    return { action, noteId, success: true };
  }

  if (action === 'link_notes') {
    if (!noteId || !data || !data.targetNoteId) return { action, success: false, error: 'Missing noteId or targetNoteId' };
    const s = notesStore.get(noteId), t = notesStore.get(data.targetNoteId);
    if (!s || !t) return { action, success: false, error: 'Note not found' };
    if (!s.linksTo.includes(data.targetNoteId)) s.linksTo.push(data.targetNoteId);
    if (!t.linksTo.includes(noteId)) t.linksTo.push(noteId);
    s.updatedAt = Date.now(); t.updatedAt = Date.now();
    notesStore.set(noteId, s); notesStore.set(data.targetNoteId, t);
    return { action, noteId, targetNoteId: data.targetNoteId, success: true };
  }

  if (action === 'delete_note') {
    if (!noteId) return { action, success: false, error: 'Missing noteId' };
    if (notesStore.delete(noteId)) return { action, noteId, success: true };
    return { action, noteId, success: false, error: 'Note not found: ' + noteId };
  }

  if (action === 'tag_note') {
    if (!noteId || !data || !data.tags) return { action, success: false, error: 'Missing noteId or tags' };
    const note = notesStore.get(noteId);
    if (!note) return { action, success: false, error: 'Note not found: ' + noteId };
    note.tags = data.tags; note.updatedAt = Date.now(); notesStore.set(noteId, note);
    return { action, noteId, success: true };
  }

  if (action === 'classify_note') {
    if (!noteId || !data) return { action, success: false, error: 'Missing noteId or data' };
    const note = notesStore.get(noteId);
    if (!note) return { action, success: false, error: 'Note not found: ' + noteId };
    if (data.type) note.type = data.type;
    if (data.project) note.project = data.project;
    note.updatedAt = Date.now(); notesStore.set(noteId, note);
    return { action, noteId, success: true };
  }

  if (action === 'distill_note') {
    if (!noteId || !data || !data.targetLevel) return { action, success: false, error: 'Missing noteId or targetLevel' };
    const note = notesStore.get(noteId);
    if (!note) return { action, success: false, error: 'Note not found: ' + noteId };
    const current = note.distillationLevel || 1;
    if (data.targetLevel <= current) return { action, noteId, success: false, error: 'Already at level ' + current };
    if (data.targetLevel === 2) note.shorthand = computeShorthand(note.verbatim_text);
    else if (data.targetLevel === 3) note.summary = computeSummary(note.verbatim_text);
    else if (data.targetLevel === 4) note.principle = (note.summary || '').slice(0, 200) + ' (principle)';
    note.distillationLevel = data.targetLevel; note.updatedAt = Date.now(); notesStore.set(noteId, note);
    return { action, noteId, targetLevel: data.targetLevel, success: true };
  }

  if (action === 'no_action') return { action, success: true, note: 'No action needed' };

  return { action, success: false, error: 'Unknown action: ' + action };
}

// ─── Human Gate ──────────────────────────────────────────────────────────────────

async function handleGateDecision(uid, body) {
  const { gateId, decision, modifiedOutput, note } = body || {};
  if (!gateId || !decision || !['approved', 'rejected', 'modified'].includes(decision)) {
    return { success: false, error: 'Missing or invalid gateId or decision.' };
  }
  const gate = gateQueue.get(gateId);
  if (!gate) return { success: false, error: 'Gate not found: ' + gateId };
  if (gate.status !== 'pending') return { success: false, error: 'Gate ' + gateId + ' already ' + gate.status + '.' };

  gate.status = decision;
  gate.humanDecision = { decision, by: uid, at: Date.now(), note: note || undefined, modifiedOutput: decision === 'modified' ? modifiedOutput : undefined };

  if (decision === 'approved' || decision === 'modified') {
    const outputToProcess = decision === 'modified' && modifiedOutput ? modifiedOutput : gate.output;
    const actions = parseAgentOutputForActions(outputToProcess, uid);
    const results = [];
    for (const action of actions) results.push(await executeAct(uid, action));
    gate.actionsExecuted = results;
  }

  gateQueue.set(gateId, gate);
  console.log('[Gate] UID=' + uid + ' ' + decision + ' gate ' + gateId + ' (agent: ' + gate.agentId + ')');
  return { success: true, data: { gateId, decision, previousStatus: 'pending', actionsExecuted: gate.actionsExecuted || [], timestamp: Date.now() } };
}

async function handleGateList(uid) {
  const gates = [];
  for (const [id, gate] of gateQueue) {
    gates.push({
      id: gate.id, agentRunId: gate.agentRunId, agentId: gate.agentId, agentName: gate.agentName,
      intent: gate.intent, output: gate.output.slice(0, 500), outputTokens: gate.outputTokens,
      timestamp: gate.timestamp, status: gate.status, expiresAt: gate.expiresAt,
      expiresIn: gate.expiresAt ? Math.round((gate.expiresAt - Date.now()) / 1000) : null,
      humanDecision: gate.humanDecision,
    });
  }
  gates.sort((a, b) => b.timestamp - a.timestamp);
  return {
    success: true,
    data: {
      gates,
      summary: {
        total: gates.length,
        pending: gates.filter(g => g.status === 'pending').length,
        approved: gates.filter(g => g.status === 'approved').length,
        rejected: gates.filter(g => g.status === 'rejected').length,
      }
    }
  };
}

// ─── Distillation Scheduler ──────────────────────────────────────────────────────

async function handleDistillBatch(uid, body) {
  const { targetLevel, noteIds, schedule = 'on-demand' } = body || {};
  if (![2, 3, 4].includes(targetLevel)) return { success: false, error: 'targetLevel must be 2, 3, or 4.' };

  const eligible = [];
  if (noteIds && noteIds.length) {
    for (const id of noteIds) { const n = notesStore.get(id); if (n && n.userId === uid && (n.distillationLevel || 1) < targetLevel) eligible.push(n); }
  } else {
    for (const [, n] of notesStore) { if (n.userId === uid && (n.distillationLevel || 1) < targetLevel) eligible.push(n); }
  }

  if (eligible.length === 0) {
    return {
      success: true,
      data: {
        jobId: 'distill_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
        targetLevel, notesProcessed: 0, notesTotal: 0, status: 'completed',
        schedule, completedAt: Date.now(),
        message: 'No notes eligible for level ' + targetLevel + '.',
      }
    };
  }

  let processed = 0, failed = 0;
  for (const note of eligible) {
    try {
      await executeAct(uid, { action: 'distill_note', noteId: note.id, data: { targetLevel } });
      processed++;
    } catch { failed++; }
  }

  const jobId = 'distill_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  distillationJobs.set(jobId, { id: jobId, userId: uid, status: 'completed', targetLevel, notesProcessed: processed, notesTotal: eligible.length, startedAt: Date.now() - 1000, completedAt: Date.now(), schedule });
  console.log('[Distill] UID=' + uid + ' batch ' + jobId + ': ' + processed + '/' + eligible.length + ' notes \u2192 level ' + targetLevel);

  return {
    success: true,
    data: { jobId, targetLevel, notesProcessed: processed, notesTotal: eligible.length, failed, status: processed > 0 ? 'completed' : 'pending', schedule, completedAt: Date.now() }
  };
}

function getDistillationSchedule() {
  return {
    frequency: DISTILLATION_SCHEDULE.frequency,
    dayOfWeek: DISTILLATION_SCHEDULE.dayOfWeek,
    hourOfDay: DISTILLATION_SCHEDULE.hourOfDay,
    lastRunAt: DISTILLATION_SCHEDULE.lastRunAt ? new Date(DISTILLATION_SCHEDULE.lastRunAt).toISOString() : null,
    nextRunAt: DISTILLATION_SCHEDULE.nextRunAt ? new Date(DISTILLATION_SCHEDULE.nextRunAt).toISOString() : null,
  };
}

function computeNextRun(frequency, dayOfWeek, hourOfDay) {
  const now = new Date();
  if (frequency === 'daily') {
    const next = new Date(now);
    next.setHours(hourOfDay, 0, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    return next.getTime();
  }
  if (frequency === 'weekly') {
    const next = new Date(now);
    const daysUntil = (dayOfWeek - next.getDay() + 7) % 7;
    if (daysUntil === 0 && now.getHours() >= hourOfDay) next.setDate(next.getDate() + 7);
    else next.setDate(next.getDate() + daysUntil);
    next.setHours(hourOfDay, 0, 0, 0);
    return next.getTime();
  }
  return now.getTime() + 7 * 86400000;
}

async function handleDistillationStatus(uid) {
  const jobs = [];
  for (const [id, job] of distillationJobs) {
    if (job.userId === uid) jobs.push({
      id: job.id, targetLevel: job.targetLevel, notesProcessed: job.notesProcessed,
      notesTotal: job.notesTotal, status: job.status, schedule: job.schedule,
      startedAt: job.startedAt ? new Date(job.startedAt).toISOString() : null,
      completedAt: job.completedAt ? new Date(job.completedAt).toISOString() : null,
    });
  }
  jobs.sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
  return {
    success: true,
    data: { jobs, schedule: getDistillationSchedule(), totalJobs: jobs.length, completedJobs: jobs.filter(j => j.status === 'completed').length }
  };
}

async function handleDistillScheduleSet(uid, body) {
  const { frequency, dayOfWeek, hourOfDay } = body || {};
  if (frequency) DISTILLATION_SCHEDULE.frequency = frequency;
  if (dayOfWeek !== undefined) DISTILLATION_SCHEDULE.dayOfWeek = dayOfWeek;
  if (hourOfDay !== undefined) DISTILLATION_SCHEDULE.hourOfDay = hourOfDay;
  DISTILLATION_SCHEDULE.nextRunAt = computeNextRun(DISTILLATION_SCHEDULE.frequency, DISTILLATION_SCHEDULE.dayOfWeek, DISTILLATION_SCHEDULE.hourOfDay);
  return { success: true, data: getDistillationSchedule() };
}

// ─── Act Endpoint ────────────────────────────────────────────────────────────────

async function handleAct(uid, body) {
  const { action, noteId, data } = body || {};
  if (!action) return { success: false, error: 'Missing "action" field.' };
  const validActions = ['create_note', 'update_note', 'link_notes', 'delete_note', 'archive_note', 'tag_note', 'classify_note', 'distill_note', 'no_action'];
  if (!validActions.includes(action)) return { success: false, error: 'Unknown action: ' + action };
  const result = await executeAct(uid, { action, noteId, data });
  return { success: result.success, data: result, error: result.success ? undefined : result.error };
}


// ═══════════════════════════════════════════════════════════════════════════════
// Phase 4: Pipeline Orchestration + Execution History + Interactive Query (4 new endpoints)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Execution Store ─────────────────────────────────────────────────────────────

const executionStore = new Map();

function _genExecId() {
  return 'exec_' + Date.now().toString(36).slice(-6) + '_' + Math.random().toString(36).slice(2, 8);
}

function _now() {
  return Date.now();
}

// ─── Phase 4a: Orchestrate Pipeline ─────────────────────────────────────────────

async function handleOrchestratePipeline(uid, body) {
  const { query, filter, options } = body || {};
  if (!query || typeof query !== 'string') {
    return { success: false, error: 'Missing or invalid "query".' };
  }

  const execId = _genExecId();
  const startedAt = _now();
  console.log('[Orchestrate] UID=' + uid + ' exec=' + execId + ' query=' + query.slice(0, 80));

  // Step 1: Retrieve
  const retrieveBody = { query, filters: filter || {}, limit: 10 };
  const retrieveResult = await handleRetrieve(uid, retrieveBody);
  if (!retrieveResult.success) {
    const completedAt = _now();
    executionStore.set(execId, {
      execId, userId: uid, status: 'failed', pipeline: 'retrieve-assemble-reason-act',
      startedAt, completedAt,
      steps: [{ step: 'retrieve', status: 'failed', error: retrieveResult.error, timestamp: _now() }],
      result: undefined,
    });
    return { success: false, error: 'Pipeline failed at retrieve: ' + retrieveResult.error };
  }

  // Step 2: Assemble
  const assembleBody = { noteIds: retrieveResult.data ? retrieveResult.data.noteIds : [], query };
  const assembleResult = await handleAssemble(uid, assembleBody);
  if (!assembleResult.success) {
    const completedAt = _now();
    executionStore.set(execId, {
      execId, userId: uid, status: 'failed', pipeline: 'retrieve-assemble-reason-act',
      startedAt, completedAt,
      steps: [
        { step: 'retrieve', status: 'completed', timestamp: _now() },
        { step: 'assemble', status: 'failed', error: assembleResult.error, timestamp: _now() },
      ],
      result: undefined,
    });
    return { success: false, error: 'Pipeline failed at assemble: ' + assembleResult.error };
  }

  const assembledText = assembleResult.data ? assembleResult.data.assembledText : '';
  const assembledFrom = assembleResult.data ? assembleResult.data.assembledFrom : [];

  // Step 3: Reason - invoke Gemini for synthesis
  let reasonOutput = '';
  let reasonTokens = 0;
  try {
    if (process.env.GEMINI_API_KEY) {
      const modelName = 'gemini-2.0-flash';
      const reasonPrompt = 'You are PolyVerses, an AI Product Management Workbench assistant.\n\n' +
        'Context:\n' + assembledText + '\n\n' +
        'User Query: ' + query + '\n\n' +
        'Provide a concise, actionable response based on the context above.\n' +
        'Use markdown formatting. Structure: Summary -> Key Points -> Recommendations -> Next Steps.';
      const model = ai.models.latestModel({ model: modelName });
      const response = await model.generateContent(reasonPrompt);
      reasonOutput = response.text() || '(empty response)';
      reasonTokens = estimateTokens(reasonOutput);
    } else {
      reasonOutput = '[Sandbox] Gemini API not configured. Set GEMINI_API_KEY to enable AI synthesis.';
      reasonTokens = estimateTokens(reasonOutput);
    }
  } catch (err) {
    console.error('[Orchestrate] Gemini error:', err);
    reasonOutput = '[ERROR] AI synthesis failed: ' + (err instanceof Error ? err.message : String(err));
    reasonTokens = estimateTokens(reasonOutput);
  }

  // Step 4: Act - any resulting notes or links
  const actions = parseAgentOutputForActions(reasonOutput, uid);
  const actResults = [];
  for (const action of actions) {
    const actResult = await executeAct(uid, action);
    actResults.push(actResult);
  }

  const completedAt = _now();
  const pipelineResult = {
    execId,
    query,
    filter,
    steps: [
      { step: 'retrieve', status: 'completed', noteIds: (retrieveResult.data ? retrieveResult.data.noteIds : []), timestamp: _now() },
      { step: 'assemble', status: 'completed', assembledFrom, assembledTextLength: assembledText.length, timestamp: _now() },
      { step: 'reason', status: 'completed', outputLength: reasonOutput.length, tokens: reasonTokens, timestamp: _now() },
      { step: 'act', status: actions.length ? 'completed' : 'skipped', actions: actResults, timestamp: _now() },
    ],
    finalOutput: reasonOutput,
    actionsExecuted: actResults,
    tokensUsed: reasonTokens,
    retrievedNoteCount: (retrieveResult.data ? retrieveResult.data.noteIds : []).length,
    assembledContextSize: assembledText.length,
  };

  executionStore.set(execId, {
    execId, userId: uid, status: 'completed', pipeline: 'retrieve-assemble-reason-act',
    startedAt, completedAt,
    steps: pipelineResult.steps,
    result: pipelineResult,
  });

  console.log('[Orchestrate] UID=' + uid + ' exec=' + execId + ' completed in ' + (completedAt - startedAt) + 'ms');

  return {
    success: true,
    data: {
      execId, status: 'completed', query, filter,
      pipeline: 'retrieve-assemble-reason-act',
      finalOutput: reasonOutput,
      actionsExecuted: actResults,
      stepsSummary: {
        retrieve: { noteIds: (retrieveResult.data ? retrieveResult.data.noteIds : []), count: (retrieveResult.data ? retrieveResult.data.noteIds : []).length },
        assemble: { noteIds: assembledFrom, contextSize: assembledText.length },
        reason: { outputLength: reasonOutput.length, tokens: reasonTokens },
        act: { count: actions.length, results: actResults },
      },
      timestamps: { startedAt, completedAt, durationMs: completedAt - startedAt },
    },
  };
}

// ─── Phase 4b: Get Execution History ────────────────────────────────────────────

async function handleExecutionHistory(uid, body) {
  const { limit = 50, status: filterStatus } = body || {};
  const executions = [];
  for (const [execId, exec] of executionStore) {
    if (exec.userId !== uid) continue;
    if (filterStatus && exec.status !== filterStatus) continue;
    const entry = {
      execId: exec.execId,
      status: exec.status,
      pipeline: exec.pipeline,
      startedAt: exec.startedAt,
      completedAt: exec.completedAt || null,
      durationMs: exec.completedAt ? exec.completedAt - exec.startedAt : null,
      steps: exec.steps,
      result: exec.result ? {
        query: exec.result.query,
        finalOutputLength: exec.result.finalOutput ? exec.result.finalOutput.length : 0,
        actionsExecuted: exec.result.actionsExecuted ? exec.result.actionsExecuted.length : 0,
        retrievedNoteCount: exec.result.retrievedNoteCount || 0,
        tokensUsed: exec.result.tokensUsed || 0,
      } : null,
    };
    executions.push(entry);
  }
  executions.sort((a, b) => b.startedAt - a.startedAt);
  const sliced = executions.slice(0, limit);
  const summary = {
    total: executions.length,
    byStatus: {
      queued: executions.filter(e => e.status === 'queued').length,
      running: executions.filter(e => e.status === 'running').length,
      completed: executions.filter(e => e.status === 'completed').length,
      failed: executions.filter(e => e.status === 'failed').length,
      cancelled: executions.filter(e => e.status === 'cancelled').length,
    },
  };
  return { success: true, data: { executions: sliced, summary } };
}

// ─── Phase 4c: Cancel Execution ─────────────────────────────────────────────────

async function handleCancelExecution(uid, body) {
  const { execId } = body || {};
  if (!execId || typeof execId !== 'string') {
    return { success: false, error: 'Missing or invalid "execId".' };
  }
  const exec = executionStore.get(execId);
  if (!exec) return { success: false, error: 'Execution not found: ' + execId };
  if (exec.userId !== uid) return { success: false, error: 'Unauthorized.' };
  if (exec.status !== 'running' && exec.status !== 'queued') {
    return { success: false, error: 'Cannot cancel execution in status: ' + exec.status };
  }
  exec.status = 'cancelled';
  exec.cancelledAt = _now();
  console.log('[Cancel] UID=' + uid + ' cancelled exec=' + execId);
  return {
    success: true,
    data: {
      execId,
      previousStatus: 'running',
      newStatus: 'cancelled',
      cancelledAt: exec.cancelledAt,
    },
  };
}

// ─── Phase 4d: Execute Interactive Query (combined front-channel) ───────────────

async function handleExecuteInteractiveQuery(uid, body) {
  const { text, contextId } = body || {};
  if (!text || typeof text !== 'string' || !text.trim()) {
    return { success: false, error: 'Missing or empty "text".' };
  }
  const trimmedText = text.trim().slice(0, 100000);
  const runId = 'run_' + Date.now().toString(36).slice(-6) + '_' + Math.random().toString(36).slice(2, 8);
  const startedAt = _now();
  console.log('[Execute] UID=' + uid + ' run=' + runId + ' text=' + trimmedText.slice(0, 80));

  // Step 1: Classify intent
  const intent = classifyIntent(trimmedText);
  const agentId = intent.agentId;
  const agent = AGENTS[agentId];
  if (!agent) {
    return { success: false, error: 'Unknown intent: ' + intent.name };
  }

  // Step 2: Retrieve relevant notes
  const retrieveBody = { query: trimmedText, filters: intent.filters || {}, limit: 10 };
  const retrieveResult = await handleRetrieve(uid, retrieveBody);
  const contextNoteIds = retrieveResult.data ? retrieveResult.data.noteIds : [];
  const assembledContext = retrieveResult.data ? retrieveResult.data.assembledText : '';

  // Step 3: Assemble context
  const assembleBody = { noteIds: contextNoteIds, query: trimmedText };
  const assembleResult = await handleAssemble(uid, assembleBody);
  const fullContext = assembleResult.data ? assembleResult.data.assembledText : assembledContext;

  // Step 4: Reason - invoke Gemini
  let output = '';
  let inputTokens = 0, outputTokens = 0;
  try {
    if (process.env.GEMINI_API_KEY) {
      const modelName = 'gemini-2.0-flash';
      const prompt = 'AGENT: ' + agent.name + ' (' + agentId + ')\n' +
        'SYSTEM PROMPT:\n' + agent.systemPrompt + '\n\n' +
        'USER QUERY: "' + trimmedText + '"\n\n' +
        (fullContext ? 'ASSEMBLED CONTEXT:\n' + fullContext + '\n\n' : '') +
        'INSTRUCTIONS:\n- Provide a thorough, actionable response using markdown.\n' +
        '- Use [NOTE] markers for content to save as notes.\n' +
        '- Use [DECISION] markers for decisions to record.\n' +
        '- If no action is needed, state that clearly.\n';
      const model = ai.models.latestModel({ model: modelName });
      const response = await model.generateContent(prompt);
      output = response.text() || '(empty response)';
      inputTokens = estimateTokens(prompt);
      outputTokens = estimateTokens(output);
    } else {
      output = sandboxReasonResponse(agentId, trimmedText);
      inputTokens = estimateTokens(output);
      outputTokens = estimateTokens(output);
    }
  } catch (err) {
    console.error('[Execute] Gemini error:', err);
    output = '[ERROR] Invocation failed: ' + (err instanceof Error ? err.message : String(err));
    inputTokens = estimateTokens(output);
    outputTokens = 50;
  }

  recordUsage(agentId, inputTokens, outputTokens);

  // Step 5: Act - parse and execute any [NOTE]/[LINK]/[UPDATE] actions
  const actions = parseAgentOutputForActions(output, uid);
  const actResults = [];
  for (const action of actions) {
    const actResult = await executeAct(uid, action);
    actResults.push(actResult);
  }

  const completedAt = _now();

  // Record the run
  const run = {
    id: runId,
    agentId, agentName: agent.name, modelTier: agent.modelTier,
    inputTokens, outputTokens,
    contextNoteIds,
    intent: intent.name,
    outcome: output.slice(0, 500),
    decisionGateTriggered: agent.requiresGate,
    timestamp: _now(),
    userId: uid,
  };
  recentRuns.unshift(run);
  if (recentRuns.length > 100) recentRuns.pop();

  // Record in execution store
  executionStore.set(runId, {
    execId: runId,
    userId: uid,
    status: 'completed',
    pipeline: 'retrieve-assemble-reason-act',
    startedAt,
    completedAt,
    steps: [
      { step: 'retrieve', status: 'completed', noteIds: contextNoteIds, timestamp: _now() },
      { step: 'assemble', status: 'completed', noteIds: contextNoteIds, timestamp: _now() },
      { step: 'reason', status: 'completed', timestamp: _now() },
      { step: 'act', status: actions.length ? 'completed' : 'skipped', actions: actResults, timestamp: _now() },
    ],
    result: {
      query: trimmedText,
      agentId, agentName: agent.name,
      finalOutput: output,
      actionsExecuted: actResults,
      tokensUsed: outputTokens,
      retrievedNoteCount: contextNoteIds.length,
    },
  });

  console.log('[Execute] UID=' + uid + ' run=' + runId + ' intent=' + intent.name + ' agent=' + agentId);

  return {
    success: true,
    data: {
      runId,
      agentId, agentName: agent.name, intent: intent.name,
      inputTokens, outputTokens,
      output,
      requiresGate: agent.requiresGate,
      contextNoteIds,
      assembledContextSize: fullContext.length,
      actionsExecuted: actResults,
      timestamps: { startedAt, completedAt, durationMs: completedAt - startedAt },
      budget: {
        sessionUsed: sessionBudget.sessionUsed,
        sessionRemaining: sessionBudget.sessionBudget - sessionBudget.sessionUsed,
        weeklyUsed: sessionBudget.weeklyUsed,
        weeklyRemaining: sessionBudget.weeklyBudget - sessionBudget.weeklyUsed,
      },
    },
  };
}

// ─── Phase 4 API Endpoints ──────────────────────────────────────────────────────

app.post('/api/pipeline/orchestrate', async (req, res) => {
  const uid = requireAuth(req); if (!uid) return;
  try {
    const result = await handleOrchestratePipeline(uid, req.body || {});
    if (!result.success) { res.status(400).json({ error: result.error }); return; }
    res.json({ success: true, data: result.data });
  } catch (err) {
    console.error('[Pipeline] Error:', err);
    res.status(500).json({ error: 'Pipeline orchestration failed: ' + (err instanceof Error ? err.message : String(err)) });
  }
});

app.get('/api/pipeline/history', async (req, res) => {
  const uid = requireAuth(req); if (!uid) return;
  try {
    const result = await handleExecutionHistory(uid, req.query || {});
    res.json({ success: true, data: result.data });
  } catch (err) {
    console.error('[History] Error:', err);
    res.status(500).json({ error: 'History fetch failed: ' + (err instanceof Error ? err.message : String(err)) });
  }
});

app.post('/api/pipeline/cancel', async (req, res) => {
  const uid = requireAuth(req); if (!uid) return;
  try {
    const result = await handleCancelExecution(uid, req.body || {});
    if (!result.success) { res.status(400).json({ error: result.error }); return; }
    res.json({ success: true, data: result.data });
  } catch (err) {
    console.error('[Cancel] Error:', err);
    res.status(500).json({ error: 'Cancel failed: ' + (err instanceof Error ? err.message : String(err)) });
  }
});

app.post('/api/execute', async (req, res) => {
  const uid = requireAuth(req); if (!uid) return;
  try {
    const result = await handleExecuteInteractiveQuery(uid, req.body || {});
    if (!result.success) { res.status(400).json({ error: result.error }); return; }
    res.json({ success: true, data: result.data });
  } catch (err) {
    console.error('[Execute] Error:', err);
    res.status(500).json({ error: 'Execute failed: ' + (err instanceof Error ? err.message : String(err)) });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 3 API ENDPOINTS (11 total: 4 existing + 7 new)
// ═══════════════════════════════════════════════════════════════════════════════

app.post('/api/capture', async (req, res) => {
  const uid = requireAuth(req); if (!uid) return;
  try {
    const result = await handleCapture(uid, req.body || {});
    if (!result.success) { res.status(400).json({ error: result.error }); return; }
    res.json({ success: true, data: result.data });
  } catch (err) { console.error('[Capture] Error:', err); res.status(500).json({ error: 'Capture failed: ' + (err instanceof Error ? err.message : String(err)) }); }
});

app.post('/api/index', async (req, res) => {
  const uid = requireAuth(req); if (!uid) return;
  try {
    const { noteId } = req.body || {};
    if (!noteId || typeof noteId !== 'string') { res.status(400).json({ error: 'Missing or invalid "noteId".' }); return; }
    const result = await handleIndex(uid, noteId);
    if (!result.success) { res.status(400).json({ error: result.error }); return; }
    res.json({ success: true, data: result.data });
  } catch (err) { console.error('[Index] Error:', err); res.status(500).json({ error: 'Index failed: ' + (err instanceof Error ? err.message : String(err)) }); }
});

app.post('/api/retrieve', async (req, res) => {
  const uid = requireAuth(req); if (!uid) return;
  try {
    const result = await handleRetrieve(uid, req.body || {});
    if (!result.success) { res.status(400).json({ error: result.error }); return; }
    res.json({ success: true, data: result.data });
  } catch (err) { console.error('[Retrieve] Error:', err); res.status(500).json({ error: 'Retrieve failed: ' + (err instanceof Error ? err.message : String(err)) }); }
});

app.post('/api/assemble', async (req, res) => {
  const uid = requireAuth(req); if (!uid) return;
  try {
    const result = await handleAssemble(uid, req.body || {});
    if (!result.success) { res.status(400).json({ error: result.error }); return; }
    res.json({ success: true, data: result.data });
  } catch (err) { console.error('[Assemble] Error:', err); res.status(500).json({ error: 'Assemble failed: ' + (err instanceof Error ? err.message : String(err)) }); }
});

app.post('/api/reason', async (req, res) => {
  const uid = requireAuth(req); if (!uid) return;
  try {
    const result = await handleReason(uid, req.body || {});
    if (!result.success) { res.status(400).json({ error: result.error }); return; }
    res.json({ success: true, data: result.data });
  } catch (err) { console.error('[Reason] Error:', err); res.status(500).json({ error: 'Reason failed: ' + (err instanceof Error ? err.message : String(err)) }); }
});

app.post('/api/gate/decide', async (req, res) => {
  const uid = requireAuth(req); if (!uid) return;
  try {
    const result = await handleGateDecision(uid, req.body || {});
    if (!result.success) { res.status(400).json({ error: result.error }); return; }
    res.json({ success: true, data: result.data });
  } catch (err) { console.error('[Gate] Error:', err); res.status(500).json({ error: 'Gate decision failed: ' + (err instanceof Error ? err.message : String(err)) }); }
});

app.get('/api/gate/list', async (req, res) => {
  const uid = requireAuth(req); if (!uid) return;
  try { res.json({ success: true, data: await handleGateList(uid) }); } catch (err) { console.error('[Gate List] Error:', err); res.status(500).json({ error: 'Gate list failed: ' + (err instanceof Error ? err.message : String(err)) }); }
});

app.post('/api/distill/batch', async (req, res) => {
  const uid = requireAuth(req); if (!uid) return;
  try {
    const result = await handleDistillBatch(uid, req.body || {});
    if (!result.success) { res.status(400).json({ error: result.error }); return; }
    res.json({ success: true, data: result.data });
  } catch (err) { console.error('[Distill] Error:', err); res.status(500).json({ error: 'Distillation failed: ' + (err instanceof Error ? err.message : String(err)) }); }
});

app.get('/api/distill/status', async (req, res) => {
  const uid = requireAuth(req); if (!uid) return;
  try { res.json({ success: true, data: await handleDistillationStatus(uid) }); } catch (err) { console.error('[Distill Status] Error:', err); res.status(500).json({ error: 'Distillation status failed: ' + (err instanceof Error ? err.message : String(err)) }); }
});

app.get('/api/distill/schedule', async (req, res) => {
  const uid = requireAuth(req); if (!uid) return;
  try { res.json({ success: true, data: getDistillationSchedule() }); } catch (err) { console.error('[Distill Schedule] Error:', err); res.status(500).json({ error: 'Schedule fetch failed: ' + (err instanceof Error ? err.message : String(err)) }); }
});

app.post('/api/distill/schedule', async (req, res) => {
  const uid = requireAuth(req); if (!uid) return;
  try { const result = await handleDistillScheduleSet(uid, req.body || {}); res.json({ success: true, data: result.data }); } catch (err) { console.error('[Distill Schedule Set] Error:', err); res.status(500).json({ error: 'Schedule update failed: ' + (err instanceof Error ? err.message : String(err)) }); }
});

app.post('/api/act', async (req, res) => {
  const uid = requireAuth(req); if (!uid) return;
  try {
    const result = await handleAct(uid, req.body || {});
    if (!result.success) { res.status(400).json({ error: result.error }); return; }
    res.json({ success: true, data: result.data });
  } catch (err) { console.error('[Act] Error:', err); res.status(500).json({ error: 'Act failed: ' + (err instanceof Error ? err.message : String(err)) }); }
});


startServer();

