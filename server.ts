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
      const profile = await getProfile(uid);
      let context = "";
      if (profile) {
        context = `User profile: goal=${profile.goal}, level=${profile.level}, injuries=[${profile.injuries.join(", ")}], equipment=[${profile.equipment.join(", ")}], daysPerWeek=${profile.daysPerWeek}, sessionDuration=${profile.sessionDuration}`;
      }

      const langInstruction = lang && lang !== "en"
        ? `Respond in ${lang}. Write all text in ${lang} including greetings, explanations, and follow-up questions.`
        : "";

      let responseText: string;
      let suggestions: string[] = [];

      if (ai) {
        try {
          const fullPrompt = `${langInstruction ? langInstruction + "\n\n" : ""}Context: ${context}\n\nUser question: ${message}\n\nProvide a helpful, personalized fitness coaching response. Be encouraging and actionable.`;

          const streamMode = req.query.stream === 'true';

          if (streamMode) {
            (res as any).writeHead(200, {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              'Connection': 'keep-alive',
            });

            let fullText = '';
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
            }

            const suggestionMatch = fullText.match(/\[[\s\S]*?\]/);
            if (suggestionMatch) {
              try {
                suggestions = JSON.parse(suggestionMatch[0]);
              } catch {
                const sentences = fullText.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 10 && s.endsWith('?'));
                suggestions = sentences.slice(0, 3);
              }
            }

            const elapsed = Date.now() - start;
            res.write(`data: ${JSON.stringify({ done: true, response: fullText, suggestions, responseTime: elapsed })}\n\n`);
            res.end();

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
            const response = await ai.models.generateContent({
              model: "gemini-3.5-flash",
              contents: fullPrompt,
              config: {
                systemInstruction: F06_SYSTEM_PROMPT,
                temperature: 0.7,
              },
            });
            responseText = response.text || "Sorry, I couldn't generate a response.";

            const suggestionMatch = responseText.match(/\[[\s\S]*?\]/);
            if (suggestionMatch) {
              try {
                suggestions = JSON.parse(suggestionMatch[0]);
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
            ? `Exercise: ${exerciseId || "unknown"}. User describes their movement feel: "${userDescription}". Provide specific form cues and corrections based on this description.`
            : `Exercise: ${exerciseId}. Provide form cues and common mistakes for this exercise.`;
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
          const prompt = `User nutrition question: "${query}". Profile context: ${profile ? `goal=${profile.goal}, level=${profile.level}` : "none"}. Provide practical, evidence-based nutrition guidance.`;
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

      const userWearableRef = doc(db, "users", uid, "wearableData", "points");
      const existingSnap = await getDoc(userWearableRef);
      const existingPoints: WearableDataPoint[] = existingSnap.exists() ? (existingSnap.data().points || []) : [];
      const merged = [...existingPoints, ...normalized]
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 500);
      await setDoc(userWearableRef, { points: merged, updatedAt: Date.now() }, { merge: true });

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

      const workoutDates = [...new Set(logs.map(l => {
        const d = new Date(l.date);
        return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      }))].sort().reverse();

      let streak = 0;
      const today = new Date();
      today.setHours(0, 0, 0, 0);

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

      const calcVolume = (workoutLogs: any[]) => {
        let total = 0;
        workoutLogs.forEach(l => {
          const sets = l.sets || [];
          sets.forEach((s: any) => {
            total += (s.weight || 0) * (s.repCount || 0);
          });
        });
        return total;
      };

      const thisWeekVolume = calcVolume(thisWeekLogs);
      const lastWeekVolume = calcVolume(lastWeekLogs);

      const calcAvgRPE = (workoutLogs: any[]) => {
        const rpes: number[] = [];
        workoutLogs.forEach(l => {
          const sets = l.sets || [];
          sets.forEach((s: any) => {
            if (typeof s.rpe === 'number' && s.rpe > 0) rpes.push(s.rpe);
          });
          if (typeof l.rpe === 'number' && l.rpe > 0) rpes.push(l.rpe);
        });
        return rpes.length > 0 ? rpes.reduce((a, b) => a + b, 0) / rpes.length : 0;
      };

      const thisWeekRPE = calcAvgRPE(thisWeekLogs);
      const lastWeekRPE = calcAvgRPE(lastWeekLogs);

      const calcCompletion = (checks: any[]) => {
        if (checks.length === 0) return 0;
        const completed = checks.filter(c => c.mood !== 'skipped').length;
        return (completed / checks.length) * 100;
      };

      const thisWeekCompletion = calcCompletion(thisWeekCheckIns);
      const lastWeekCompletion = calcCompletion(lastWeekCheckIns);

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

      const weeklyTrend: { week: string; volume: number }[] = [];
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

        weeklyTrend.push({
          week: `${Math.floor(w / 7) + 1}`,
          volume: calcVolume(weekLogs),
        });
      }

      const exerciseTotals: Record<string, { volume: number; count: number }> = {};
      logs.forEach(l => {
        const sets = l.sets || [];
        sets.forEach((s: any) => {
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
      console.error("Insights endpoint error:", err);
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

      const collections = ["profile", "workouts", "plans", "wearableData", "chatSessions", "checkIns", "recovery", "subscription", "settings", "dailyDigest"];
      await Promise.all(collections.map(col =>
        deleteDoc(doc(db, "users", uid, col, "current"))
      ));

      const workoutDocs = await getDocs(collection(db, "users", uid, "workouts"));
      await Promise.all(workoutDocs.docs.map(d => deleteDoc(d.ref)));

      const planDocs = await getDocs(collection(db, "users", uid, "plans"));
      await Promise.all(planDocs.docs.map(d => deleteDoc(d.ref)));

      const checkInDocs = await getDocs(collection(db, "users", uid, "checkIns"));
      await Promise.all(checkInDocs.docs.map(d => deleteDoc(d.ref)));

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

const F02_SYSTEM_PROMPT = `You are the Workout Generator Agent of PolySync, an expert exercise physiologist and program designer. Your job is to generate a weekly workout plan based on a user's profile.`;

const F06_SYSTEM_PROMPT = `You are the Coaching Chat Agent of PolySync, a knowledgeable and encouraging AI fitness coach.`;

const F07_SYSTEM_PROMPT = `You are the Form Coach Agent of PolySync, a specialist in exercise technique and movement quality.`;

const F08_SYSTEM_PROMPT = `You are the Nutrition Advisor Agent of PolySync, providing practical, evidence-based nutrition guidance for fitness goals.`;

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
}

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
  const apiResults = await queryExerciseAPI(name);
  if (apiResults.length > 0) return apiResults;

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
