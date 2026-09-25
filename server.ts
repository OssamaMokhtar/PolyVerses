import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import fetch from "node-fetch";
import { db } from "./src/firebase";
import {
  doc, getDoc, setDoc, serverTimestamp, deleteDoc,
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
    return { score, recommendation: "active_recovery", text: "Low recovery — reduce volume or take active recovery.",
      factors, dataSources: [], dataAgeHours: 0 };
  } else {
    return { score, recommendation: "rest_day", text: "Poor recovery — rest today and focus on sleep and nutrition.",
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
    const prevVersion = plan.version ?? 1;

    // ── Adaptation logic ──────────────────────────────────────
    if (!workout.completed) {
      // SKIPPED: reduce volume next week (remove 1 exercise from each day)
      plan.version = prevVersion + 1;
      plan.adaptationReason = "Workout skipped — volume reduced for recovery";
      plan.adaptedFromPlanId = plan.id;
      plan.days = plan.days.map(day => {
        if (day.workouts && day.workouts.length > 0) {
          return {
            ...day,
            workouts: day.workouts.map(w => ({
              ...w,
              exercises: w.exercises.slice(0, Math.max(1, w.exercises.length - 1)),
            })),
          };
        }
        return day;
      });
    } else {
      // COMPLETED: progressive overload (increase intensity if recovery is good)
      const recoverySnap = await getDocs(query(
        collection(db, "users", uid, "recovery"),
        orderBy("assessedAt", "desc"),
        limit(1)
      ));
      const lastRecovery = recoverySnap.docs[0]?.data() as any;
      const recoveryScore = lastRecovery?.recoveryScore ?? 50;

      plan.version = prevVersion + 1;
      if (recoveryScore >= 60) {
        plan.adaptationReason = `Workout completed — progressive overload (+5% intensity, recovery ${recoveryScore})`;
        // Increase prescribed sets by 1 for exercises that were completed
        plan.days = plan.days.map(day => ({
          ...day,
          workouts: day.workouts?.map(w => ({
            ...w,
            mainExercises: w.mainExercises?.map(ex => ({
              ...ex,
              sets: [...(ex.sets || []), { reps: 8, weight: 0, completed: false } as any],
            })),
          })),
        }));
      } else {
        plan.adaptationReason = `Workout completed — maintained volume (recovery ${recoveryScore} < 60)`;
      }
      plan.adaptedFromPlanId = plan.id;
    }

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
      workout.completed = workout.completed ?? false;
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

  // F06 — Coaching Chat Agent (Phase 6: SSE streaming + follow-up chips + response timing + multilingual)
  app.post("/api/fitness/chat", async (req, res) => {
    const uid = requireAuth(req, res);
    if (!uid) return;
    try {
      const { message, sessionId, lang } = req.body as ChatRequest;
      if (!message) {
        res.status(400).json({ error: "message is required" });
        return;
      }

      const start = Date.now();

      // Get user context for the chat agent
      const profile = await getProfile(uid);
      let context = "";
      if (profile) {
        context = `User profile: goal=${profile.goal}, level=${profile.level}, injuries=[${profile.injuries.join(", ")}], equipment=[${profile.equipment.join(", ")}], daysPerWeek=${profile.daysPerWeek}, sessionDuration=${profile.sessionDuration}min`;
      }

      // Language instruction prefix
      const langInstruction = lang && lang !== "en"
        ? `Respond in ${lang}. Write all text in ${lang} including greetings, explanations, and follow-up questions.`
        : "";

      let responseText: string;
      let suggestions: string[] = [];

      if (ai) {
        try {
          const fullPrompt = `${langInstruction ? langInstruction + "\n\n" : ""}Context: ${context}\n\nUser question: ${message}\n\nProvide a helpful, personalized fitness coaching response. Be encouraging but factual. End with 2-3 follow-up questions the user might want to ask next, formatted as a JSON array of short strings (e.g. ["How many sets should I do?", "What weight should I use?"]). Only include the JSON array at the very end of your response, nothing after it. If the question is about injuries or medical conditions, include a disclaimer that you are an AI fitness coach, not a medical professional, and recommend consulting a healthcare provider.`;

          // Try streaming first if client supports it
          const streamMode = req.query.stream === 'true';

          if (streamMode) {
            // SSE streaming mode
            (res as any).writeHead(200, {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              'Connection': 'keep-alive',
            });

            let fullText = '';
            let lastChunkTime = start;

            const stream = await ai.models.generateContentStream({
              model: "gemini-3.5-flash",
              contents: fullPrompt,
              config: {
                systemInstruction: F06_SYSTEM_PROMPT,
                temperature: 0.7,
              },
            });

            for await (const chunk of stream) {
              const text = chunk.text || '';
              fullText += text;
              const now = Date.now();
              res.write(`data: ${JSON.stringify({ text, delta: text, elapsed: now - start })}\n\n`);
              lastChunkTime = now;
            }

            // Extract suggestions from the last lines (JSON array)
            const suggestionMatch = fullText.match(/\[[\s\S]*?\]/);
            if (suggestionMatch) {
              try {
                suggestions = JSON.parse(suggestionMatch[0]);
              } catch {
                // Fall back: extract sentences that look like questions
                const sentences = fullText.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 10 && s.endsWith('?'));
                suggestions = sentences.slice(0, 3);
              }
            }

            const elapsed = Date.now() - start;
            res.write(`data: ${JSON.stringify({ done: true, response: fullText, suggestions, responseTime: elapsed })}\n\n`);
            res.end();

            // Save to Firestore after streaming completes
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
              content: fullText,
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

            return;
          } else {
            // Non-streaming mode: return full response with suggestions + timing
            const response = await ai.models.generateContent({
              model: "gemini-3.5-flash",
              contents: fullPrompt,
              config: {
                systemInstruction: F06_SYSTEM_PROMPT,
                temperature: 0.7,
              },
            });
            responseText = response.text || "Sorry, I couldn't generate a response.";

            // Extract suggestions from response
            const suggestionMatch = responseText.match(/\[[\s\S]*?\]/);
            if (suggestionMatch) {
              try {
                suggestions = JSON.parse(suggestionMatch[0]);
                // Remove the JSON array from the response text
                responseText = responseText.slice(0, suggestionMatch.index).trim();
              } catch {
                const sentences = responseText.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 10 && s.endsWith('?'));
                suggestions = sentences.slice(0, 3);
              }
            }
          }
        } catch (geminiErr) {
          console.error("Gemini chat failed:", geminiErr);
          responseText = `I'm here to help with your fitness journey! Could you tell me more about what you're looking for? (Gemini API unavailable — using fallback)`;
        }
      } else {
        responseText = `I'm here to help with your fitness journey! Could you tell me more about what you're looking for? (Gemini API not configured — using sandbox)`;
      }

      const elapsed = Date.now() - start;

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

      res.json({
        reply: responseText,
        agentId: "F06",
        suggestions: suggestions.length > 0 ? suggestions : undefined,
        responseTime: elapsed,
        sandbox: !ai,
      });
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

  // F10 — Wearable Data Ingest Agent (HealthKit + Google Fit)
  // Note: Web HealthKit access requires Safari 15+ on iOS 15+/macOS 11+.
  // Google Fit requires OAuth 2.0 flow via Google Identity Services.
  // Both are stubbed here; full implementations require native companion app
  // or browser-specific APIs that are only available in secure contexts.

  app.post("/api/fitness/wearable/ingest", async (req, res) => {
    const uid = requireAuth(req, res);
    if (!uid) return;
    try {
      const { source, data } = req.body as {
        source: 'healthkit' | 'googlefit' | 'strava' | 'garmin' | 'whoop' | 'oura';
        data: WearableDataPoint[];
      };
      if (!source || !data || !Array.isArray(data)) {
        res.status(400).json({ error: "source and data array are required" });
        return;
      }

      // Validate and normalize
      const normalized: WearableDataPoint[] = data
        .filter((d: any) => d.timestamp && typeof d.timestamp === 'number')
        .map((d: any, i: number) => ({
          id: d.id || crypto.randomUUID(),
          userId: uid,
          source,
          timestamp: d.timestamp,
          sleepDuration: d.sleepDuration,
          sleepStartTime: d.sleepStartTime,
          sleepEndTime: d.sleepEndTime,
          sleepStages: d.sleepStages,
          restingHeartRate: d.restingHeartRate,
          hrv: d.hrv,
          heartRateZones: d.heartRateZones,
          steps: d.steps,
          activeCalories: d.activeCalories,
          activeMinutes: d.activeMinutes,
          workoutSessions: d.workoutSessions,
          createdAt: Date.now(),
        }));

      // Save to Firestore
      const userWearableRef = doc(db, "users", uid, "wearableData", "points");
      const existingSnap = await getDoc(userWearableRef);
      const existingPoints: WearableDataPoint[] = existingSnap.exists() ? (existingSnap.data().points || []) : [];
      const merged = [...existingPoints, ...normalized]
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 500);
      await setDoc(userWearableRef, { points: merged, updatedAt: Date.now() }, { merge: true });

      // Update summary
      const summaryRef = doc(db, "users", uid, "wearableData", "current");
      await setDoc(summaryRef, {
        source,
        lastIngestedAt: Date.now(),
        dataAgeHours: 0,
        pointCount: merged.length,
      } as any, { merge: true });

      res.json({
        success: true,
        pointCount: normalized.length,
        totalPoints: merged.length,
        sandbox: true,
      });
    } catch (err) {
      console.error("F10 wearable ingest error:", err);
      res.status(500).json({ error: "Failed to ingest wearable data" });
    }
  });

  app.get("/api/fitness/wearable", async (req, res) => {
    const uid = requireAuth(req, res);
    if (!uid) return;
    try {
      const wearableRef = doc(db, "users", uid, "wearableData", "current");
      const wearableSnap = await getDoc(wearableRef);
      if (!wearableSnap.exists()) {
        res.json({ connected: false, source: null, dataAgeHours: null, pointCount: 0 });
        return;
      }
      const data = wearableSnap.data();
      const pointsRef = doc(db, "users", uid, "wearableData", "points");
      const pointsSnap = await getDoc(pointsRef);
      const pointCount = pointsSnap.exists() ? (pointsSnap.data().points?.length || 0) : 0;
      res.json({
        connected: true,
        source: data.source,
        lastIngestedAt: data.lastIngestedAt,
        dataAgeHours: data.dataAgeHours,
        pointCount,
      });
    } catch (err) {
      console.error("F10 wearable read error:", err);
      res.status(500).json({ error: "Failed to read wearable status" });
    }
  });

  app.post("/api/fitness/wearable/disconnect", async (req, res) => {
    const uid = requireAuth(req, res);
    if (!uid) return;
    try {
      const { source } = req.body as { source: string };
      res.json({ success: true, disconnected: source });
    } catch (err) {
      console.error("F10 wearable disconnect error:", err);
      res.status(500).json({ error: "Failed to disconnect wearable" });
    }
  });

  // 3.3 — Streaks & Consistency
  app.get("/api/fitness/streaks", async (req, res) => {
    const uid = requireAuth(req, res);
    if (!uid) return;
    try {
      const workoutsRef = collection(db, "users", uid, "workouts");
      const workoutsSnap = await getDocs(workoutsRef);
      const logs: any[] = [];
      workoutsSnap.forEach(doc => {
        const data = doc.data();
        if (data.completed) {
          logs.push({ date: data.createdAt || data.date, workoutName: data.workoutName });
        }
      });

      // Calculate streak
      const workoutDates = [...new Set(logs.map(l => {
        const d = new Date(l.date);
        return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      }))].sort().reverse();

      let streak = 0;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      let checkDate = new Date(today);

      for (const dateStr of workoutDates) {
        const logDate = new Date(dateStr + 'T00:00:00');
        const diffDays = Math.floor((today.getTime() - logDate.getTime()) / 86400000);
        if (diffDays <= 1 && diffDays >= 0) {
          streak++;
          today.setDate(today.getDate() - 1);
        } else if (diffDays > 1) {
          break;
        }
      }

      // Longest streak
      let longestStreak = 0;
      let currentStreak = 0;
      const sortedDates = [...new Set(logs.map(l => {
        const d = new Date(l.date);
        return d.getTime();
      }))].sort((a, b) => a - b);

      for (let i = 0; i < sortedDates.length; i++) {
        if (i === 0 || sortedDates[i] - sortedDates[i - 1] === 86400000) {
          currentStreak++;
        } else {
          longestStreak = Math.max(longestStreak, currentStreak);
          currentStreak = 1;
        }
      }
      longestStreak = Math.max(longestStreak, currentStreak);

      // Total workouts
      const totalWorkouts = logs.length;
      const last7Days = logs.filter(l => {
        const d = new Date(l.date);
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 7);
        return d >= cutoff;
      }).length;

      res.json({
        streakDays: streak,
        longestStreakDays: longestStreak,
        totalWorkouts,
        workoutsLast7Days: last7Days,
        sandbox: true,
      });
    } catch (err) {
      console.error("Streaks endpoint error:", err);
      res.status(500).json({ error: "Failed to calculate streaks" });
    }
  });

  // 5.2 — Personalized insights dashboard
  app.get("/api/fitness/insights", async (req, res) => {
    const uid = requireAuth(req, res);
    if (!uid) return;
    try {
      // Fetch all data in parallel
      const [profileSnap, checksSnap, logsSnap, recoverySnap] = await Promise.all([
        getDoc(doc(db, "users", uid, "profile", "current")),
        getDocs(query(collection(db, "users", uid, "checkIns"), orderBy("createdAt", "desc"), limit(20))),
        getDocs(query(collection(db, "users", uid, "workouts"), orderBy("createdAt", "desc"))),
        getDocs(query(collection(db, "users", uid, "recovery"), orderBy("createdAt", "desc"))),
      ]);

      const profile = profileSnap.exists() ? (profileSnap.data() as any) : {};
      const checks = checksSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const logs = logsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const recoveries = recoverySnap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Time periods
      const now = new Date();
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay());
      startOfWeek.setHours(0, 0, 0, 0);
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(endOfWeek.getDate() + 7);

      const startLastWeek = new Date(startOfWeek);
      startLastWeek.setDate(startLastWeek.getDate() - 7);

      const thisWeekLogs = logs.filter(l => {
        const d = new Date(l.createdAt);
        return d >= startOfWeek && d < endOfWeek;
      });
      const lastWeekLogs = logs.filter(l => {
        const d = new Date(l.createdAt);
        return d >= startLastWeek && d < startOfWeek;
      });

      const thisWeekCheckIns = checks.filter(c => {
        const d = new Date(c.createdAt);
        return d >= startOfWeek && d < endOfWeek;
      });
      const lastWeekCheckIns = checks.filter(c => {
        const d = new Date(c.createdAt);
        return d >= startLastWeek && d < startOfWeek;
      });

      // Volume calculation
      const calcVolume = (workoutLogs: any[]) => {
        let total = 0;
        workoutLogs.forEach(l => {
          const sets = l.sets || [];
          sets.forEach(s => {
            total += (s.weight || 0) * (s.repCount || 0);
          });
        });
        return total;
      };

      const thisWeekVolume = calcVolume(thisWeekLogs);
      const lastWeekVolume = calcVolume(lastWeekLogs);

      // RPE average
      const calcAvgRPE = (workoutLogs: any[]) => {
        const rpes: number[] = [];
        workoutLogs.forEach(l => {
          const sets = l.sets || [];
          sets.forEach(s => {
            if (typeof s.rpe === 'number' && s.rpe > 0) rpes.push(s.rpe);
          });
          if (typeof l.rpe === 'number' && l.rpe > 0) rpes.push(l.rpe);
        });
        return rpes.length > 0 ? rpes.reduce((a, b) => a + b, 0) / rpes.length : 0;
      };

      const thisWeekRPE = calcAvgRPE(thisWeekLogs);
      const lastWeekRPE = calcAvgRPE(lastWeekLogs);

      // Completion rate
      const calcCompletion = (checks: any[]) => {
        if (checks.length === 0) return 0;
        const completed = checks.filter(c => c.mood !== 'skipped').length;
        return (completed / checks.length) * 100;
      };

      const thisWeekCompletion = calcCompletion(thisWeekCheckIns);
      const lastWeekCompletion = calcCompletion(lastWeekCheckIns);

      // Streak calculation
      const allDates = [...new Set(logs.map(l => {
        const d = new Date(l.createdAt);
        d.setHours(0, 0, 0, 0);
        return d.getTime();
      }))].sort((a, b) => a - b);

      let currentStreak = 0;
      let longestStreak = 0;
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      for (let i = allDates.length - 1; i >= 0; i--) {
        const expected = new Date(today.getTime() - i * 86400000);
        if (allDates.includes(expected.getTime())) {
          currentStreak++;
          longestStreak = Math.max(longestStreak, currentStreak);
        } else if (i === allDates.length - 1) {
          // Allow for yesterday if today is missing
          const yesterday = new Date(today.getTime() - 86400000);
          if (allDates.includes(yesterday.getTime())) {
            currentStreak++;
          } else {
            break;
          }
        } else {
          break;
        }
      }

      // Weekly volume trend (last 8 weeks)
      const weeklyTrend = [];
      for (let w = 7; w >= 0; w--) {
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - w * 7);
        weekStart.setHours(0, 0, 0, 0);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 7);

        const weekLogs = logs.filter(l => {
          const d = new Date(l.createdAt);
          return d >= weekStart && d < weekEnd;
        });

        const weekNum = Math.floor(w / 7) + 1;
        const weekLabel = `${weekNum}`;
        weeklyTrend.push({
          week: weekLabel,
          volume: calcVolume(weekLogs),
        });
      }

      // Top exercises
      const exerciseTotals: Record<string, { volume: number; count: number }> = {};
      logs.forEach(l => {
        const sets = l.sets || [];
        sets.forEach(s => {
          const exId = s.exerciseId || s.exerciseName || 'unknown';
          const exName = s.exerciseName || EXERCISE_NAMES[exId] || exId;
          if (!exerciseTotals[exName]) exerciseTotals[exName] = { volume: 0, count: 0 };
          exerciseTotals[exName].volume += (s.weight || 0) * (s.repCount || 0);
          exerciseTotals[exName].count++;
        });
      });

      const topExercises = Object.entries(exerciseTotals)
        .map(([name, data]) => ({ name, totalVolume: data.volume, count: data.count }))
        .sort((a, b) => b.totalVolume - a.totalVolume)
        .slice(0, 5);

      // Recovery trend
      const recoveryTrend = recoveries.slice(0, 10).map(r => ({
        date: new Date(r.createdAt).toISOString().split('T')[0],
        score: r.recoveryScore || 0,
      }));

      const numWeeks = Math.max(1, Math.floor(logs.length / 12));

      res.json({
        periodLabel: `Last 7 days vs prior 7 days`,
        workoutsThisPeriod: thisWeekLogs.length,
        workoutsLastPeriod: lastWeekLogs.length,
        completionRate: thisWeekCompletion,
        completionRateLast: lastWeekCompletion,
        totalVolume: thisWeekVolume,
        totalVolumeLast: lastWeekVolume,
        avgRPE: thisWeekRPE,
        avgRPELast: lastWeekRPE,
        currentStreak,
        longestStreak,
        weeklyVolumeTrend: weeklyTrend.filter(w => w.volume > 0),
        topExercises,
        recoveryTrend,
      });
    } catch (err) {
      console.error("Insights endpoint error:", err);
      res.status(500).json({ error: "Failed to calculate insights" });
    }
  });

  
  // 5.2 — Personalized insights dashboard
  app.get("/api/fitness/insights", async (req, res) => {
    const uid = requireAuth(req, res);
    if (!uid) return;
    try {
      const [profileSnap, checksSnap, logsSnap, recoverySnap] = await Promise.all([
        getDoc(doc(db, "users", uid, "profile", "current")),
        getDocs(query(collection(db, "users", uid, "checkIns"), orderBy("createdAt", "desc"), limit(20))),
        getDocs(query(collection(db, "users", uid, "workouts"), orderBy("createdAt", "desc"))),
        getDocs(query(collection(db, "users", uid, "recovery"), orderBy("createdAt", "desc"))),
      ]);

      const profile = profileSnap.exists() ? (profileSnap.data() as any) : {};
      const checks = checksSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const logs = logsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const recoveries = recoverySnap.docs.map(d => ({ id: d.id, ...d.data() }));

      const now = new Date();
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay());
      startOfWeek.setHours(0, 0, 0, 0);
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(endOfWeek.getDate() + 7);
      const startLastWeek = new Date(startOfWeek);
      startLastWeek.setDate(startLastWeek.getDate() - 7);

      const thisWeekLogs = logs.filter(l => { const d = new Date(l.createdAt); return d >= startOfWeek && d < endOfWeek; });
      const lastWeekLogs = logs.filter(l => { const d = new Date(l.createdAt); return d >= startLastWeek && d < startOfWeek; });
      const thisWeekCheckIns = checks.filter(c => { const d = new Date(c.createdAt); return d >= startOfWeek && d < endOfWeek; });
      const lastWeekCheckIns = checks.filter(c => { const d = new Date(c.createdAt); return d >= startLastWeek && d < startOfWeek; });

      const calcVolume = (wl: any[]) => { let t = 0; wl.forEach(l => { (l.sets || []).forEach(s => { t += (s.weight || 0) * (s.repCount || 0); }); }); return t; };
      const calcAvgRPE = (wl: any[]) => {
        const rpes: number[] = [];
        wl.forEach(l => { (l.sets || []).forEach(s => { if (typeof s.rpe === 'number' && s.rpe > 0) rpes.push(s.rpe); });
          if (typeof l.rpe === 'number' && l.rpe > 0) rpes.push(l.rpe); });
        return rpes.length > 0 ? rpes.reduce((a: number, b: number) => a + b, 0) / rpes.length : 0;
      };
      const calcCompletion = (cs: any[]) => { if (cs.length === 0) return 0; return (cs.filter(c => c.mood !== 'skipped').length / cs.length) * 100; };

      const thisWeekVolume = calcVolume(thisWeekLogs);
      const lastWeekVolume = calcVolume(lastWeekLogs);
      const thisWeekRPE = calcAvgRPE(thisWeekLogs);
      const lastWeekRPE = calcAvgRPE(lastWeekLogs);
      const thisWeekCompletion = calcCompletion(thisWeekCheckIns);
      const lastWeekCompletion = calcCompletion(lastWeekCheckIns);

      // Streak
      const allDates = [...new Set(logs.map(l => { const d = new Date(l.createdAt); d.setHours(0,0,0,0); return d.getTime(); }))].sort((a, b) => a - b);
      let currentStreak = 0, longestStreak = 0;
      const today = new Date(); today.setHours(0, 0, 0, 0);
      for (let i = allDates.length - 1; i >= 0; i--) {
        const expected = new Date(today.getTime() - i * 86400000);
        if (allDates.includes(expected.getTime())) { currentStreak++; longestStreak = Math.max(longestStreak, currentStreak); }
        else if (i === allDates.length - 1) {
          const yesterday = new Date(today.getTime() - 86400000);
          if (allDates.includes(yesterday.getTime())) currentStreak++;
          else break;
        } else break;
      }

      // Weekly trend
      const weeklyTrend: { week: string; volume: number }[] = [];
      for (let w = 7; w >= 0; w--) {
        const ws = new Date(now); ws.setDate(now.getDate() - w * 7); ws.setHours(0,0,0,0);
        const we = new Date(ws); we.setDate(we.getDate() + 7);
        const wl = logs.filter(l => { const d = new Date(l.createdAt); return d >= ws && d < we; });
        weeklyTrend.push({ week: `${Math.floor(w/7)+1}`, volume: calcVolume(wl) });
      }

      // Top exercises
      const exerciseTotals: Record<string, { volume: number; count: number }> = {};
      logs.forEach(l => { (l.sets || []).forEach(s => {
        const exId = s.exerciseId || s.exerciseName || 'unknown';
        const exName = s.exerciseName || EXERCISE_NAMES[exId] || exId;
        if (!exerciseTotals[exName]) exerciseTotals[exName] = { volume: 0, count: 0 };
        exerciseTotals[exName].volume += (s.weight || 0) * (s.repCount || 0);
        exerciseTotals[exName].count++;
      }); });
      const topExercises = Object.entries(exerciseTotals)
        .map(([n, d]) => ({ name: n, totalVolume: d.volume, count: d.count }))
        .sort((a, b) => b.totalVolume - a.totalVolume).slice(0, 5);

      // Recovery trend
      const recoveryTrend = recoveries.slice(0, 10).map(r => ({
        date: new Date(r.createdAt).toISOString().split('T')[0],
        score: r.recoveryScore || 0,
      }));

      res.json({
        periodLabel: "Last 7 days vs prior 7 days",
        workoutsThisPeriod: thisWeekLogs.length,
        workoutsLastPeriod: lastWeekLogs.length,
        completionRate: thisWeekCompletion,
        completionRateLast: lastWeekCompletion,
        totalVolume: thisWeekVolume,
        totalVolumeLast: lastWeekVolume,
        avgRPE: thisWeekRPE,
        avgRPELast: lastWeekRPE,
        currentStreak,
        longestStreak,
        weeklyVolumeTrend: weeklyTrend.filter(w => w.volume > 0),
        topExercises,
        recoveryTrend,
      });
    } catch (err) {
      console.error("Insights error:", err);
      res.status(500).json({ error: "Failed to calculate insights" });
    }
  });

  // 3.4 — Notification preferences
  app.post("/api/fitness/settings/notifications", async (req, res) => {
    const uid = requireAuth(req, res);
    if (!uid) return;
    try {
      const { dailyDigestTime, workoutReminders, checkInReminders } = req.body as {
        dailyDigestTime?: string;
        workoutReminders?: boolean;
        checkInReminders?: boolean;
      };
      const settingsRef = doc(db, "users", uid, "settings", "notifications");
      await setDoc(settingsRef, {
        dailyDigestTime: dailyDigestTime || "08:00",
        workoutReminders: workoutReminders !== false,
        checkInReminders: checkInReminders !== false,
        updatedAt: Date.now(),
      } as any, { merge: true });
      res.json({ success: true });
    } catch (err) {
      console.error("Notification settings error:", err);
      res.status(500).json({ error: "Failed to save notification settings" });
    }
  });

  app.get("/api/fitness/settings/notifications", async (req, res) => {
    const uid = requireAuth(req, res);
    if (!uid) return;
    try {
      const settingsRef = doc(db, "users", uid, "settings", "notifications");
      const settingsSnap = await getDoc(settingsRef);
      if (settingsSnap.exists()) {
        res.json(settingsSnap.data());
      } else {
        res.json({
          dailyDigestTime: "08:00",
          workoutReminders: true,
          checkInReminders: true,
        });
      }
    } catch (err) {
      console.error("Notification settings read error:", err);
      res.status(500).json({ error: "Failed to read notification settings" });
    }
  });

  // 4.6 — Data export (GDPR/CCPA compliance)
  app.post("/api/fitness/export", async (req, res) => {
    const uid = requireAuth(req, res);
    if (!uid) return;
    try {
      const { format } = req.body as { format?: string };
      const exportFormat = (format || "json").toLowerCase();

      // Fetch all user data
      const [profileSnap, workoutsSnap, plansSnap, checkInsSnap, chatSessionsSnap, wearableSnap] = await Promise.all([
        getDoc(doc(db, "users", uid, "profile", "current")),
        getDocs(query(collection(db, "users", uid, "workouts"), orderBy("createdAt", "desc"))),
        getDocs(query(collection(db, "users", uid, "plans"), orderBy("createdAt", "desc"))),
        getDocs(query(collection(db, "users", uid, "checkIns"), orderBy("createdAt", "desc"))),
        getDocs(query(collection(db, "users", uid, "chatSessions"), orderBy("lastMessageAt", "desc"))),
        getDoc(doc(db, "users", uid, "wearableData", "current")),
      ]);

      const exportData = {
        exportedAt: Date.now(),
        userId: uid,
        profile: profileSnap.exists() ? profileSnap.data() : null,
        workouts: workoutsSnap.docs.map(d => ({ id: d.id, ...d.data() })),
        plans: plansSnap.docs.map(d => ({ id: d.id, ...d.data() })),
        checkIns: checkInsSnap.docs.map(d => ({ id: d.id, ...d.data() })),
        chatSessions: chatSessionsSnap.docs.map(d => ({ id: d.id, ...d.data() })),
        wearable: wearableSnap.exists() ? wearableSnap.data() : null,
        version: "1.0",
      };

      if (exportFormat === "csv") {
        // Flatten workouts to CSV
        const ws = exportData.workouts;
        let csv = "date,workoutName,focus,completed,duration,notes\n";
        ws.forEach(w => {
          const date = w.createdAt ? new Date(w.createdAt).toISOString().split("T")[0] : "";
          csv += `${date},"${w.workoutName || ""}","${w.focus || ""}",${w.completed || false},${w.duration || 0},"${(w.notes || "").replace(/"/g, '""')}"\n`;
        });
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename=polysync-workouts-${Date.now()}.csv`);
        return res.send(csv);
      }

      res.json(exportData);
    } catch (err) {
      console.error("Export error:", err);
      res.status(500).json({ error: "Failed to export data" });
    }
  });

  // 4.7 — GDPR/CCPA account deletion
  app.post("/api/fitness/settings/delete-account", async (req, res) => {
    const uid = requireAuth(req, res);
    if (!uid) return;
    try {
      const { confirm } = req.body as { confirm?: string };
      if (confirm !== "DELETE") {
        res.status(400).json({ error: "Confirmation required: confirm='DELETE'" });
        return;
      }

      // Delete all user data across all collections
      const collections = ["profile", "workouts", "plans", "wearableData", "chatSessions", "checkIns", "recovery", "subscription", "settings", "dailyDigest"];
      await Promise.all(collections.map(col =>
        deleteDoc(doc(db, "users", uid, col, "current"))
      ));

      // Delete workout documents
      const workoutDocs = await getDocs(collection(db, "users", uid, "workouts"));
      await Promise.all(workoutDocs.docs.map(d => deleteDoc(d.ref)));

      // Delete plan documents
      const planDocs = await getDocs(collection(db, "users", uid, "plans"));
      await Promise.all(planDocs.docs.map(d => deleteDoc(d.ref)));

      // Delete check-in documents
      const checkInDocs = await getDocs(collection(db, "users", uid, "checkIns"));
      await Promise.all(checkInDocs.docs.map(d => deleteDoc(d.ref)));

      // Delete chat session documents
      const chatDocs = await getDocs(collection(db, "users", uid, "chatSessions"));
      await Promise.all(chatDocs.docs.map(d => deleteDoc(d.ref)));

      res.json({ success: true, message: "Account deletion requested. Data will be fully removed within 30 days." });
    } catch (err) {
      console.error("Delete account error:", err);
      res.status(500).json({ error: "Failed to delete account" });
    }
  });
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
  // 6.2 — AI-powered workout summary (What went well / Could improve / Next focus)
  app.post("/api/fitness/workout-summary", async (req, res) => {
    const uid = requireAuth(req, res);
    if (!uid) return;
    try {
      const { workoutId } = req.body as { workoutId?: string };
      if (!workoutId) {
        res.status(400).json({ error: "workoutId is required" });
        return;
      }

      const workoutRef = doc(db, "users", uid, "workouts", workoutId);
      const workoutSnap = await getDoc(workoutRef);
      if (!workoutSnap.exists()) {
        res.status(404).json({ error: "Workout not found" });
        return;
      }

      const workout = workoutSnap.data() as any;

      if (!ai) {
        res.json({
          whatWentWell: "Workout completed! Keep up the consistency.",
          couldImprove: "Try to focus on form and controlled movement.",
          nextFocus: "Consistency is key — aim to hit your next scheduled workout.",
          sandbox: true,
        });
        return;
      }

      const prompt = `Analyze this completed workout and provide 3 short feedback sections:

Workout data:
- Name: ${workout.workoutName || "Unknown"}
- Focus: ${workout.focus || "General"}
- Duration: ${workout.duration || 0} minutes
- Completed: ${workout.completed ? "Yes" : "No"}
- Exercises: ${workout.exercises?.length || 0} exercises
- User profile goal: ${workout.userProfile?.goal || "Not available"}
- User profile level: ${workout.userProfile?.level || "Not available"}

Provide a JSON response with exactly these 3 fields:
{
  "whatWentWell": "2-3 sentences about what the user did well",
  "couldImprove": "2-3 sentences about areas to improve",
  "nextFocus": "2-3 sentences about what to focus on next"
}

Be encouraging and actionable. Keep each section concise.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          systemInstruction: `You are a fitness coach providing post-workout feedback. Be encouraging, specific, and actionable. Respond in valid JSON only.`,
          temperature: 0.7,
        },
      });

      const text = response.text || "{}";
      let summary: { whatWentWell: string; couldImprove: string; nextFocus: string } = {
        whatWentWell: "Great job completing your workout!",
        couldImprove: "Focus on maintaining good form.",
        nextFocus: "Your next workout is an opportunity to build on today's effort.",
      };

      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          summary = JSON.parse(jsonMatch[0]);
        }
      } catch {
        // Use default
      }

      res.json(summary);
    } catch (err) {
      console.error("Workout summary error:", err);
      res.status(500).json({ error: "Failed to generate summary" });
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

  // 6.2b — Weight entry logging endpoint
  app.post("/api/fitness/weight", async (req, res) => {
    const uid = requireAuth(req, res);
    if (!uid) return;
    try {
      const { weight, note } = req.body as { weight?: number; note?: string };
      if (weight == null || weight <= 0 || weight > 300) {
        res.status(400).json({ error: "Valid weight (1-300 kg/lbs) is required" });
        return;
      }
      await setDoc(doc(db, "users", uid, "weightEntries", Date.now().toString()), {
        userId: uid,
        weight: Math.round(weight * 10) / 10,
        note: note || "",
        date: Date.now(),
        createdAt: serverTimestamp(),
      } as any);
      res.json({ success: true, message: "Weight logged successfully" });
    } catch (err) {
      console.error("Weight log error:", err);
      res.status(500).json({ error: "Failed to log weight" });
    }
  });

  app.get("/api/fitness/weight/history", async (req, res) => {
    const uid = requireAuth(req, res);
    if (!uid) return;
    try {
      const entriesSnap = await getDocs(
        query(collection(db, "users", uid, "weightEntries"), orderBy("date", "desc"), limit(30))
      );
      const entries = entriesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      res.json({ entries });
    } catch (err) {
      console.error("Weight history error:", err);
      res.status(500).json({ error: "Failed to get weight history" });
    }
  });

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

  // GLP-1 / special mode adjustments
  let adjustedSets = setsPerExercise;
  let adjustedReps = getRepRange(profile.goal, profile.level);
  if (profile.specialMode === 'glp1') {
    // GLP-1 users: lower intensity, more recovery, joint-friendly
    adjustedSets = Math.max(1, setsPerExercise - 1);
    adjustedReps = profile.level === 'beginner' ? '10-12' : '8-10';
  } else if (profile.specialMode === 'postpartum') {
    // Postpartum: lighter, pelvic floor friendly
    adjustedSets = Math.max(1, setsPerExercise - 1);
    adjustedReps = '12-15';
  } else if (profile.specialMode === 'senior') {
    // Older adults: balance and joint health focus
    adjustedSets = Math.max(1, setsPerExercise - 1);
    adjustedReps = '12-15';
  }
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
        sets: adjustedSets,
        reps: adjustedReps,
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



// 5.3 — Exercise name lookup for insights
const EXERCISE_NAMES: Record<string, string> = {
  "barbell-bench-press": "Barbell Bench Press",
  "barbell-deadlift": "Barbell Deadlift",
  "barbell-squat": "Barbell Squat",
  "barbell-ohp": "Overhead Press",
  "dumbbell-curl": "Dumbbell Curl",
  "dumbbell-row": "Dumbbell Row",
  "pull-up": "Pull-Up",
  "push-up": "Push-Up",
  "lunge": "Lunge",
  "plank": "Plank",
  "leg-press": "Leg Press",
  "lat-pulldown": "Lat Pulldown",
  "shoulder-press": "Shoulder Press",
  "bicep-curl": "Bicep Curl",
  "tricep-extension": "Tricep Extension",
  "leg-curl": "Leg Curl",
  "leg-extension": "Leg Extension",
  "hip-thrust": "Hip Thrust",
  "face-pull": "Face Pull",
  "calf-raise": "Calf Raise",
};

// 5.3 — External API integrations (ExerciseAPI, Spoonacular, Strava)
// Configure API keys in .env.local: EXERCISE_API_KEY, SPOONACULAR_API_KEY, STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET

async function queryExerciseAPI(query: string): Promise<any[]> {
  const apiKey = process.env.EXERCISE_API_KEY;
  if (!apiKey) return [];
  try {
    const res = await fetch(`https://api.exerciseapi.com/v1/exercises?name=${encodeURIComponent(query)}&limit=10`, {
      headers: { "X-API-Key": apiKey },
    });
    if (!res.ok) throw new Error("ExerciseAPI error");
    return res.json();
  } catch (err) {
    console.error("ExerciseAPI query failed:", err);
    return [];
  }
}

async function searchExercises(name: string): Promise<any[]> {
  // Try ExerciseAPI first if configured
  const apiResults = await queryExerciseAPI(name);
  if (apiResults.length > 0) return apiResults;

  // Fallback: local exercise library search
  const fromLibrary = Object.values(EXERCISE_LIBRARY).filter(
    e => e.name.toLowerCase().includes(name.toLowerCase())
  );
  return fromLibrary.map(e => ({ name: e.name, id: e.id, category: e.category }));
}

async function querySpoonacular(query: string): Promise<any> {
  const apiKey = process.env.SPOONACULAR_API_KEY;
  if (!apiKey) return { error: "Nutrition API not configured" };
  try {
    const res = await fetch(
      `https://api.spoonacular.com/recipes/complexSearch?query=${encodeURIComponent(query)}&number=5&apiKey=${apiKey}`
    );
    if (!res.ok) throw new Error("Spoonacular error");
    return res.json();
  } catch (err) {
    console.error("Spoonacular query failed:", err);
    return { error: "Nutrition search failed" };
  }
}

async function getStravaStats(accessToken: string): Promise<any> {
  try {
    const res = await fetch("https://www.strava.com/api/v3/athlete", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error("Strava API error");
    return res.json();
  } catch (err) {
    console.error("Strava API failed:", err);
    return { error: "Strava connection failed" };
  }
}



  // 5.3 — External exercise search
  app.get("/api/fitness/external/exercises", async (req, res) => {
    const uid = requireAuth(req, res);
    if (!uid) return;
    const { q } = req.query as { q?: string };
    if (!q) return res.json({ results: [] });
    try {
      const results = await searchExercises(q);
      res.json({ results });
    } catch (err) {
      console.error("Exercise search error:", err);
      res.status(500).json({ error: "Search failed" });
    }
  });

  // 5.3 — External nutrition search
  app.get("/api/fitness/external/nutrition", async (req, res) => {
    const uid = requireAuth(req, res);
    if (!uid) return;
    const { q } = req.query as { q?: string };
    if (!q) return res.json({ results: [], error: "No query" });
    try {
      const results = await querySpoonacular(q);
      res.json(results);
    } catch (err) {
      console.error("Nutrition search error:", err);
      res.status(500).json({ error: "Search failed" });
    }
  });

  // 5.3 — Strava connection status
  app.get("/api/fitness/external/strava", async (req, res) => {
    const uid = requireAuth(req, res);
    if (!uid) return;
    try {
      const wearableRef = doc(db, "users", uid, "wearableData", "current");
      const snap = await getDoc(wearableRef);
      if (!snap.exists()) return res.json({ connected: false });
      const data = snap.data();
      res.json({ connected: !!data.stravaAccessToken, athlete: data.stravaAthlete || null });
    } catch (err) {
      res.json({ connected: false });
    }
  });


startServer();

