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
  RecoveryAssessment, WorkoutExercise, ExerciseInputCompat, PlanOutputCompat,
  RecoveryInput, CheckInInput, NutritionRequest,
  NutritionResponse, ChatRequest, ChatResponse,
  PlanExercise, PlanWorkout, PlanDay, DailyWorkday as DailyWorkout, Exercise, ModifiedExercise,
  WearableDataPoint, RecoveryFactor, HealthDataConsent
} from "./src/types";
import { EXERCISE_LIBRARY, getSubstituteExercises } from "./src/ExerciseLibrary";

// Week, date formatting helpers
function getWeekNumber(date: Date): number {
  const startOfYear = new Date(date.getFullYear(), 0, 1);
  const diff = Math.floor((date.getTime() - startOfYear.getTime()) / 86400000);
  return Math.ceil((diff + startOfYear.getDay() + 1) / 7);
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function computeRecoveryScore(input: RecoveryInput): {
  score: number;
  recommendation: "rest" | "train_normal" | "reduce_intensity" | "reduce_volume";
  text: string;
  factors: { name: string; value: string; impact: "positive" | "negative" }[];
  dataSources: string[];
  dataAgeHours: number;
} {
  let score = 50;
  const factors: { name: string; value: string; impact: "positive" | "negative" }[] = [];

  if (input.sleepDuration && input.sleepDuration >= 7) {
    score += 20;
    factors.push({ name: "sleep", value: `${input.sleepDuration}h`, impact: "positive" });
  } else if (input.sleepDuration && input.sleepDuration < 6) {
    score -= 15;
    factors.push({ name: "sleep", value: `${input.sleepDuration}h`, impact: "negative" });
  }

  if (input.hrv && input.hrv > 60) {
    score += 10;
    factors.push({ name: "hrv", value: `${input.hrv}ms`, impact: "positive" });
  }

  if (input.restingHeartRate && input.restingHeartRate < 60) {
    score += 5;
    factors.push({ name: "resting_hr", value: `${input.restingHeartRate}bpm`, impact: "positive" });
  } else if (input.restingHeartRate && input.restingHeartRate > 75) {
    score -= 10;
    factors.push({ name: "resting_hr", value: `${input.restingHeartRate}bpm`, impact: "negative" });
  }

  if (input.activeCalories && input.activeCalories > 500) {
    factors.push({ name: "activity", value: `${input.activeCalories}cal`, impact: "positive" });
  }

  if (input.energyLevel && input.energyLevel < 3) {
    score -= 10;
    factors.push({ name: "energy", value: `${input.energyLevel}/5`, impact: "negative" });
  }

  if (score >= 80) {
    return { score, recommendation: "train_normal", text: "You're well-recovered. Train normally.",
      factors, dataSources: [], dataAgeHours: 0 };
  } else if (score >= 60) {
    return { score, recommendation: "reduce_intensity", text: "Moderate recovery — consider lighter intensity today.",
      factors, dataSources: [], dataAgeHours: 0 };
  } else if (score >= 40) {
    return { score, recommendation: "reduce_volume", text: "Low recovery — reduce volume or take active recovery.",
      factors, dataSources: [], dataAgeHours: 0 };
  } else {
    return { score, recommendation: "rest", text: "Poor recovery — rest today and focus on sleep and nutrition.",
      factors, dataSources: [], dataAgeHours: 0 };
  }
}

async function generateDeterministicPlan(profile: FitnessProfile): Promise<WeeklyPlan> {
  const exercises = EXERCISE_LIBRARY;
  const startOfWeek = new Date();
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay() + 1);
  startOfWeek.setHours(0, 0, 0, 0);

  const days: PlanDay[] = [];
  const exercisesPerDay = profile.goal === "build_muscle" ? 5 :
    profile.goal === "lose_weight" ? 6 :
    profile.goal === "improve_endurance" ? 5 : 4;

  for (let i = 0; i < profile.daysPerWeek; i++) {
    const dayExercises: WorkoutExercise[] = exercises
      .slice(0, exercisesPerDay)
      .map((ex, idx) => ({
        exerciseId: ex.exerciseId,
        name: ex.name,
        category: ex.category,
        primaryMuscles: ex.primaryMuscles,
        prescribedSets: idx < 2 ? 4 : 3,
        prescribedReps: ex.primaryMuscles.length > 1 ? "8-12" : "12-15",
        prescribedRestSeconds: 60 + idx * 10,
        sets: [],
      }));

    days.push({
      dayIndex: i,
      date: startOfWeek.getTime() + i * 86400000,
      dayLabel: ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"][i] as string,
      focus: profile.goal === "build_muscle" ? "Upper Body Strength" :
             profile.goal === "lose_weight" ? "Full Body HIIT" :
             profile.goal === "improve_endurance" ? "Cardio & Core" : "General Fitness",
      workouts: [{
        id: crypto.randomUUID(),
        name: `Workout ${i + 1}`,
        focus: profile.goal === "build_muscle" ? "Upper Body Strength" :
               profile.goal === "lose_weight" ? "Full Body HIIT" :
               profile.goal === "improve_endurance" ? "Cardio & Core" : "General Fitness",
        estimatedDuration: profile.sessionDuration,
        warmup: [],
        mainExercises: dayExercises,
        cooldown: [],
      }],
    });
  }

  return {
    id: crypto.randomUUID(),
    userId: profile.uid ?? "unknown",
    weekNumber: getWeekNumber(startOfWeek),
    startDate: startOfWeek.getTime(),
    version: 1,
    days,
    generatedBy: "F02",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

async function savePlan(uid: string, plan: WeeklyPlan): Promise<void> {
  const planRef = doc(db, "users", uid, "plans", plan.id);
  await setDoc(planRef, {
    ...plan,
    createdAt: plan.createdAt ?? serverTimestamp(),
    updatedAt: plan.updatedAt ?? serverTimestamp(),
  } as any, { merge: true });
}

function findExerciseSubstitution(
  exerciseId: string,
  preferredEquipment?: string[]
): { exerciseId: string; name: string; targetMuscles: string[]; equipment: string[]; difficulty: string; reason: string }[] {
  const substitutes: { exerciseId: string; name: string; targetMuscles: string[]; equipment: string[]; difficulty: string; reason: string }[] = [];
  const exercise = EXERCISE_LIBRARY.find(e => e.exerciseId === exerciseId);
  if (!exercise) return substitutes;

  for (const ex of EXERCISE_LIBRARY) {
    if (ex.exerciseId === exerciseId) continue;
    if (preferredEquipment && !ex.equipment?.some(e => preferredEquipment.includes(e))) continue;
    if (ex.primaryMuscles.some(m => exercise.primaryMuscles.includes(m))) {
      substitutes.push({
        exerciseId: ex.exerciseId,
        name: ex.name,
        targetMuscles: ex.primaryMuscles,
        equipment: ex.equipment,
        difficulty: ex.difficulty,
        reason: "Target muscle overlap",
      });
    }
  }

  return substitutes.slice(0, 5);
}

async function generateAdaptation(
  uid: string,
  workout: WorkoutLogEntry
): Promise<WeeklyPlan | null> {
  try {
    const planSnap = await getDocs(query(
      collection(db, "users", uid, "plans"),
      orderBy("createdAt", "desc"),
      limit(1)
    ));
    if (planSnap.empty) return null;

    const plan = planSnap.docs[0].data() as WeeklyPlan;
    plan.version = (plan.version ?? 1) + 1;
    plan.adaptationReason = "Workout completed — progressive adaptation";
    plan.adaptedFromPlanId = plan.id;
    await savePlan(uid, plan);
    return plan;
  } catch {
    return null;
  }
}

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
    res.status(410).json({ error: "This endpoint has been replaced by the PolySync fitness coaching API. Use /api/fitness/* endpoints instead." });
  });

  // ─── PolySync Fitness API Routes ──────────────────────────────────────────

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
            plan = generateDeterministicPlan(profile as any);
          }
          plan.userId = uid;
          plan.createdAt = Date.now() as any;
          plan.updatedAt = Date.now() as any;
          await savePlan(uid, plan);
          res.json({ plan, generatedBy: "gemini" });
        } catch (geminiErr) {
          console.error("Gemini plan generation failed, using deterministic fallback:", geminiErr);
          const plan = await generateDeterministicPlan(profile as any);
          plan.userId = uid;
          plan.createdAt = Date.now() as any;
          plan.updatedAt = Date.now() as any;
          await savePlan(uid, plan);
          res.json({ plan, generatedBy: "deterministic" });
        }
      } else {
        const plan = await generateDeterministicPlan(profile as any);
        plan.userId = uid;
        plan.createdAt = Date.now() as any;
        plan.updatedAt = Date.now() as any;
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
      // Delete all fitness data for this user (simplified batch delete)
      const collections = ["profile", "workouts", "plans", "wearableData", "chatSessions", "checkIns", "recovery", "subscription", "settings", "dailyDigest"];
      for (const col of collections) {
        const colSnap = await getDocs(collection(db, "users", uid, col));
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
// ─── Fitness Sandbox Helpers ────────────────────────────────────────────────
// Fallback responses when Gemini API is unavailable or returns an error.
// Each agent has its own sandbox generator that produces realistic, safe output.

function sandboxProfileSaved(profile: FitnessProfile): string {
  return `✅ Profile saved successfully (sandbox mode).
Goal: ${profile.goal}
Level: ${profile.level}
Injuries: ${profile.injuries.join(", ") || "none"}
Equipment: ${profile.equipment.join(", ") || "none"}
Days/week: ${profile.daysPerWeek}
Session duration: ${profile.sessionDuration}min
Focus areas: ${profile.focus.join(", ") || "full_body"}
Health data consent: ${profile.healthDataConsent}
Special mode: ${profile.specialMode || "none"}`;
}

function sandboxPlanGenerated(profile: FitnessProfile, plan: WeeklyPlan): string {
  const daysStr = plan.days.map(d => {
    const workout = d.workouts[0];
    return `  Day ${d.dayIndex} (${d.date}): ${workout?.workoutName || "Rest"} — ${workout?.exercises?.length || 0} exercises`;
  }).join("\n");
  return `✅ Weekly plan generated (sandbox mode) — Week ${plan.weekNumber}
${daysStr}

Note: This is a simulated response. Connect GEMINI_API_KEY for real AI-powered plan generation.`;
}

function sandboxWorkoutLogged(profile: FitnessProfile): string {
  return `✅ Workout logged (sandbox mode).
Adaptation summary: ${profile.goal === "build_muscle" ? "Progressive overload applied — next week's volume increased by ~10%." : profile.goal === "lose_weight" ? "Maintained intensity — next week focuses on consistency and recovery." : "Plan maintained — continue building the habit."}
Note: Connect GEMINI_API_KEY for real adaptation analysis.`;
}

function sandboxChatResponse(message: string, profile: FitnessProfile | null): string {
  const userContext = profile ? ` (goal: ${profile.goal}, level: ${profile.level})` : "";
  if (message.toLowerCase().includes("injury") || message.toLowerCase().includes("pain")) {
    return `⚠️ I'm an AI fitness coach, not a medical professional. If you're experiencing pain or have an injury concern, please consult a healthcare provider or physical therapist.
In the meantime: rest the affected area, avoid exercises that cause pain, and let me know your injury so I can adjust your workout plan to work around it.`;
  }
  if (message.toLowerCase().includes("nutrition") || message.toLowerCase().includes("diet") || message.toLowerCase().includes("food")) {
    return `🥗 Great question about nutrition${userContext}!
General guidance: focus on protein intake (${profile?.level === "advanced" ? "1.6-2.2g per kg of bodyweight" : "0.8-1.2g per kg"}), stay hydrated (2-3L water/day), and eat a balanced mix of complex carbs, lean protein, and healthy fats.
For personalized nutrition planning, consider talking to a registered dietitian. I can help with general guidance and motivation!`;
  }
  if (message.toLowerCase().includes("form") || message.toLowerCase().includes("technique") || message.toLowerCase().includes("how to")) {
    return `🏋️ Form is everything! Proper technique prevents injury and maximizes results.
For specific form cues on an exercise, tell me which exercise you're working on and I'll give you a breakdown of setup, movement pattern, common mistakes, and cues to focus on.
When in doubt: start lighter than you think you need to, move slowly, and prioritize control over weight.`;
  }
  return `💪 Great question${userContext}! Here's my take:
\"${message.slice(0, 120)}\"

My general advice: stay consistent, listen to your body, and focus on progressive improvement over time. What's your current situation with this? I can tailor my answer if you share more details about your goals, experience level, and any limitations.`;
}

function sandboxRecoveryAssessed(input: RecoveryInput): string {
  const score = computeRecoveryScore(input);
  let recommendation: string;
  if (score >= 75) recommendation = "train_normal — You're well-recovered. Go ahead with your planned workout.";
  else if (score >= 50) recommendation = "reduce_volume — You're somewhat recovered. Consider reducing volume by 20-30% or focusing on technique work.";
  else if (score >= 25) recommendation = "reduce_intensity — Recovery is low. Skip heavy loads today; do light mobility or active recovery instead.";
  else recommendation = "rest — Your body needs rest. Take a recovery day — light walking or stretching only.";
  
  return `📊 Recovery Assessment (sandbox mode): ${score}/100
Recommendation: ${recommendation}
Factors: sleep quality, recent workout frequency, self-reported energy, pain notes
Note: Connect wearable data + GEMINI_API_KEY for real recovery analysis powered by your actual data.`;
}

function sandboxFormCue(exerciseName: string): string {
  return `🏋️ Form Cue for ${exerciseName} (sandbox mode):
Setup: Stand with feet shoulder-width apart, core engaged, neutral spine.
Movement: Control the weight through the full range of motion. Don't rush the eccentric (lowering) phase — 2-3 seconds down, explosive but controlled up.
Common mistakes: [Varies by exercise — connect GEMINI_API_KEY for specific form analysis]
Focus cue: \"Move with intention, not momentum.\"
Note: For exercise-specific form video analysis, this feature is planned for Phase 3 (computer vision integration).`;
}

function sandboxNutritionGuidance(profile: FitnessProfile | null, query: string): string {
  const goalContext = profile?.goal === "build_muscle" ? "muscle building" : profile?.goal === "lose_weight" ? "fat loss" : "general fitness";
  return `🥗 Nutrition Guidance for ${goalContext} (sandbox mode):
Based on your goal of ${goalContext}:

• Protein: Prioritize lean sources (chicken, fish, eggs, tofu, legumes) — aim for a protein source at every meal.
• Carbs: Focus on complex carbs (oats, quinoa, sweet potatoes, whole grains) — time them around workouts for energy.
• Fats: Include healthy fats (avocado, nuts, olive oil) — essential for hormone health and satiety.
• Hydration: 2-3 liters of water daily, more if training hard or in hot conditions.
• Timing: Eat a balanced meal 2-3 hours before training, and include protein + carbs within 1-2 hours after.

⚠️ Disclaimer: I'm an AI fitness coach, not a registered dietitian. For personalized meal plans, medical conditions, or specific dietary needs, consult a qualified nutrition professional.

Note: Connect GEMINI_API_KEY for real AI-powered nutrition guidance tailored to your profile.`;
}

}

startServer();
