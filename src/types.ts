// PolyVerses AI Fitness Coach — Type Definitions
// Extends the architecture with fitness-domain types

// Allow flexible goal strings (server uses both "build_muscle" style and "strength" style)
export type FitnessGoal = string;

export interface FitnessProfile {
  uid?: string;
  email?: string;
  displayName?: string;

  // Goals & level
  goal: FitnessGoal;
  level: 'beginner' | 'intermediate' | 'advanced';
  focus: string[];

  // Constraints
  injuries: string[];
  equipment: string[];
  daysPerWeek: number;
  sessionDuration: number;
  availableDays?: string[];

  // Biometrics (optional)
  weight?: number;
  height?: number;
  age?: number;
  gender?: 'male' | 'female' | 'other' | 'prefer_not_to_say';

  // Consent flags
  healthDataConsent: boolean;
  disclaimerAccepted?: boolean;

  // Special mode
  specialMode?: string;

  // Metadata
  createdAt?: any;
  updatedAt?: any;
  userId?: string;
}

export type HealthDataConsent = { healthDataConsent: boolean; }

export interface WorkoutLogEntry {
  id: string;
  userId: string;

  date: number;                      // Unix ms — workout date
  planId: string;                    // which plan this workout came from
  dayIndex: number;                  // which day of the plan (0 = first day)

  exercises: WorkoutExercise[];

  duration: number;                  // minutes
  overallRpe?: number;               // 1–10 Rate of Perceived Exertion
  notes?: string;

  // Adaptation signals
  completed: boolean;                // whether the user marked it done
  skippedExercises: string[];        // exercise IDs the user skipped
  modifiedExercises: ModifiedExercise[]; // exercises the user changed

  createdAt: number;
  updatedAt: number;
}

export interface WorkoutExercise {
  exerciseId: string;
  name: string;
  category: string;
  primaryMuscles: string[];

  prescribedSets: number;
  prescribedReps: number | string;   // 'AMRAP' or a number
  prescribedRestSeconds: number;
  prescribedRpe?: number;

  sets: ExerciseSet[];
}

export interface ExerciseSet {
  setNumber: number;
  reps: number;
  weight: number;
  rpe?: number;
  completed: boolean;
  note?: string;
}

export interface ModifiedExercise {
  exerciseId: string;
  originalName: string;
  modifiedName: string;
  modificationReason: string;        // 'injury', 'equipment-unavailable', 'too-easy', 'too-hard', 'preference'
  newSets?: number;
  newReps?: number;
}

export interface WeeklyPlan {
  id: string;
  userId: string;

  weekNumber: number;
  startDate: number;                 // Unix ms — Monday of the week
  version: number;                   // incremented on each adaptation

  days: PlanDay[];

  // Origin
  generatedBy: string;               // agent ID, e.g. 'F02'
  adaptedFromPlanId?: string;
  adaptationReason?: string;

  createdAt: number;
  updatedAt: number;
}

export interface PlanDay {
  dayIndex: number;
  date: number;                      // Unix ms — the day this workout is scheduled
  dayLabel: string;                  // 'Monday' etc.
  focus: string;                     // 'Upper Body Strength', 'Full Body', etc.

  recoveryRecommendation?: 'train_normal' | 'reduce_intensity' | 'rest_day';
  recoveryScore?: number;            // 0–100, if wearable data available

  workouts: PlanWorkout[];
}

export interface PlanWorkout {
  id: string;
  name: string;                      // e.g. 'Upper Body Push'
  focus: string;
  estimatedDuration: number;         // minutes
  warmup?: string[];                 // exercise IDs for warmup
  mainExercises: WorkoutExercise[];
  cooldown?: string[];               // exercise IDs for cooldown / stretch
}

export interface PlanExercise {
  exerciseId: string;
  name: string;
  order: number;

  sets: number;
  reps: number | string;
  restSeconds: number;
  rpeTarget?: number;

  notes?: string;                    // e.g. 'Focus on controlled eccentric'
}

export interface WearableDataPoint {
  id: string;
  userId: string;

  source: 'healthkit' | 'googlefit' | 'strava' | 'garmin' | 'whoop' | 'oura';
  timestamp: number;                 // Unix ms

  // Sleep
  sleepDuration?: number;            // minutes
  sleepStartTime?: number;
  sleepEndTime?: number;
  sleepStages?: {
    deep?: number;                   // minutes
    light?: number;
    rem?: number;
    awake?: number;
  };

  // Heart / Recovery
  restingHeartRate?: number;         // bpm
  hrv?: number;                      // ms (RMSSD or SDNN — source-dependent)
  heartRateZones?: {                 // minutes spent in each zone
    zone1?: number;
    zone2?: number;
    zone3?: number;
    zone4?: number;
    zone5?: number;
  };

  // Activity
  steps?: number;
  activeCalories?: number;
  activeMinutes?: number;
  floorsClimbed?: number;

  // Workout sessions (from wearable)
  workoutSessions?: WearableWorkout[];

  // Source-specific
  rawData?: Record<string, unknown>; // passthrough for source-specific fields

  createdAt: number;
}

export interface WearableWorkout {
  startTimestamp: number;
  endTimestamp: number;
  activityType: string;              // 'running', 'cycling', 'rowing', 'strength_training', etc.
  duration: number;                  // minutes
  avgHeartRate?: number;
  maxHeartRate?: number;
  calories?: number;
  distance?: number;                 // meters
  laps?: number;
  avgPace?: number;                  // min/km or min/mile
}

export interface ChatSession {
  id: string;
  userId: string;

  title: string;                     // auto-generated from first message
  createdAt: number;
  updatedAt: number;

  messages: ChatMessage[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  // For assistant messages: which agent generated this
  agentId?: string;
  // Context snapshot at time of generation (for traceability)
  contextSnapshot?: {
    profileVersion: number;
    planId?: string;
    planVersion?: number;
    recentWorkoutIds?: string[];
    recoveryScore?: number;
  };
}

export interface CheckIn {
  id: string;
  userId: string;

  date: number;                      // Unix ms
  workoutId?: string;                // associated workout, if post-workout

  // Subjective measures
  energyLevel: number;               // 1–10
  mood: string;                      // free text or enum
  motivationLevel: number;           // 1–10

  // Physical feedback
  sleepQuality?: number;             // 1–10
  painOrIssues?: string;             // free text
  muscleSoreness?: number;           // 1–10
  stressLevel?: number;              // 1–10

  // Behavioral signals
  workoutCompleted: boolean;
  skippedWorkoutReason?: string;

  createdAt: number;
}

export interface RecoveryAssessment {
  id: string;
  userId: string;

  assessedAt: number;
  recoveryScore: number;             // 0–100
  recommendation: 'train_normal' | 'reduce_intensity' | 'rest_day' | 'active_recovery';

  factors: RecoveryFactor[];

  // Which wearable data was used
  dataSources: string[];
  dataAgeHours: number;              // how old the most recent data is

  generatedBy: string;               // agent ID, e.g. 'F04'
}

export interface RecoveryFactor {
  name: string;                      // 'sleep', 'hrv', 'resting_hr', 'workout_frequency', 'subjective'
  value: number;
  weight: number;                    // 0–1 contribution weight
  notes?: string;
}

export interface NutritionAdvice {
  id: string;
  userId: string;

  assessedAt: number;

  calorieTarget: number;             // kcal/day
  proteinTarget: number;             // g/day
  carbTarget?: number;               // g/day
  fatTarget?: number;                // g/day

  goal: string;                      // 'muscle_gain', 'fat_loss', 'maintenance', etc.
  notes: string[];

  generatedBy: string;
}

export interface UserProgressSnapshot {
  userId: string;
  generatedAt: number;

  // Profile
  profile: FitnessProfile;

  // Current plan
  currentPlanId?: string;
  currentPlanWeek?: number;

  // Stats over a lookback window
  workoutsLast7Days: number;
  workoutsLast30Days: number;
  totalVolumeLast7Days: number;      // sets × reps × weight summed
  estimatedTotalVolumeLast30Days: number;

  // Recovery trend
  avgRecoveryScoreLast7Days: number;
  avgSleepHoursLast7Days: number;

  // Consistency
  streakDays: number;
  longestStreakDays: number;
  workoutsPerWeekAverage: number;

  // Body weight trend (if user logs it)
  weightEntries: WeightEntry[];
  weightChange30Days?: number;
}

export interface WeightEntry {
  date: number;
  weight: number;
  note?: string;
}

// ─── Agent & Orchestration Types (fitness-flavored) ───────────────────

export type FitnessAgentId =
  | 'F00' | 'F01' | 'F02' | 'F03' | 'F04'
  | 'F05' | 'F06' | 'F07' | 'F08' | 'F09'
  | 'F10' | 'F11';

export interface FitnessAgent {
  id: FitnessAgentId;
  name: string;
  priority: 'High' | 'Medium' | 'Low';
  role: string;
  description: string;
  tools: string[];
  status: 'idle' | 'running' | 'completed' | 'waiting' | 'failed';
}

export interface FitnessWorkflowStep {
  id: string;
  agentId: FitnessAgentId;
  agentName: string;
  action: string;
  timestamp: string;
  output: string;
  status: 'success' | 'warning' | 'error' | 'pending';
  priority: 'High' | 'Medium' | 'Low';
  confidenceScore?: number;
}

export interface FitnessHumanGate {
  id: string;
  agentId: FitnessAgentId;
  agentName: string;
  title: string;
  description: string;
  type: 'approve' | 'modify' | 'rerun' | 'pause';
  schema: Record<string, unknown>;
  agentOutput: {
    detectedRisk?: string;
    recommendedAction?: string;
    overrideAllowedFor?: string;
  };
  status: 'pending' | 'approved' | 'modified' | 'rerun' | 'paused';
}

// ─── API Request / Response Types ──────────────────────────────────────

export interface GeneratePlanRequest {
  userId: string;
  profile: FitnessProfile;
  weekNumber?: number;
  adaptationSourcePlanId?: string;
  recoveryScore?: number;
}

export interface GeneratePlanResponse {
  plan: WeeklyPlan;
  rationale: string;                 // agent explanation of choices
  warnings?: string[];               // e.g. 'Injury noted: left knee — avoid deep squats'
}

export interface ChatRequest {
  userId: string;
  message: string;
  chatSessionId?: string;
  context: {
    profile: FitnessProfile;
    currentPlanId?: string;
    recentWorkoutIds?: string[];
    recoveryScore?: number;
    wearableDataAgeHours?: number;
  };
}

export interface ChatResponse {
  reply: string;
  agentId: FitnessAgentId;
  suggestions?: string[];            // follow-up prompts the coach suggests
}

export type SubscriptionTier = 'free' | 'premium' | 'elite';

export interface UserSubscription {
  userId: string;
  tier: SubscriptionTier;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  currentPeriodStart?: number;
  currentPeriodEnd?: number;
  cancelledAt?: number;
  updatedAt: number;
}

export const TIER_FEATURES: Record<SubscriptionTier, string[]> = {
  free: [
    'Basic weekly workout plan (non-adaptive)',
    'Exercise library access',
    'Workout logging',
    'Progress dashboard',
    '5 chat sessions per week',
  ],
  premium: [
    'Fully adaptive weekly plans (progressive overload)',
    'Unlimited coaching chat',
    'Apple HealthKit / Google Fit integration',
    'Recovery-based plan adaptation',
    'Daily digest notifications',
    'Motivation coach (sentiment analysis)',
    'Plan adaptation on workout completion',
    'Exercise substitution engine',
  ],
  elite: [
    'Everything in Premium',
    'All wearable integrations (Strava, Garmin, WHOOP, Oura)',
    'Nutrition advisor agent (calorie/macro targets)',
    'GLP-1 / special population mode',
    'Text-based form coaching',
    'Priority support',
    'Early access to new features (CV form analysis, AR coaching)',
  ],
};

// ─── Legacy / Server-Compatibility Types ────────────────────────────
// These support the server.ts endpoint signatures and
// PolyVerses-era code paths in components.

export interface ServerCompatibilityPlanOutputV0 {
  weekNumber: number;
  startDate: string;
  endDate: string;
  days: ServerCompatibilityDayV0[];
  version: number;
  userId?: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface ServerCompatibilityDayV0 {
  dayIndex: number;
  date: string;
  recoveryRecommendation?: string;
  workouts: ServerCompatibilityWorkoutV0[];
}

export interface PlanChange {
  type: 'added_exercise' | 'removed_exercise' | 'modified_volume' | 'modified_intensity' | 'swapped_day' | 'rest_day_added' | 'rest_day_removed';
  description: string;
  affectedDayIndex?: number;
  affectedExerciseId?: string;
}

export interface ServerCompatibilityWorkoutV0 {
  workoutId: string;
  workoutName: string;
  focus: string;
  duration: number;
  exercises: ExerciseInputCompat[];
}

export interface ServerCompatibilityExerciseInputV0 {
  id: string;
  name: string;
  category: string;
  muscles: string[];             // ExerciseLibrary uses `muscles`; server compat alias
  targetMuscles: string[];       // types.ts canonical name
  secondaryMuscles: string[];
  equipment: string[];
  difficulty: string;
  instructions: string;
  commonMistakes: string[];
  substitutionIds: string[];
  videoUrl?: string;
}

export interface ExerciseInputCompat {
  id: string;
  name: string;
  category: string;
  muscles: string[];
  targetMuscles: string[];
  secondaryMuscles: string[];
  equipment: string[];
  difficulty: string;
  instructions: string;
  commonMistakes: string[];
  substitutionIds: string[];
  videoUrl?: string;
}

export type ExerciseInput = ExerciseInputCompat;
export type PlanOutput = ServerCompatibilityPlanOutputV0;
export type PlanOutputCompat = ServerCompatibilityPlanOutputV0;
export type RecoveryInput = ServerCompatRecoveryInput;
export type CheckInInput = ServerCompatCheckInInput;
export type NutritionRequest = ServerCompatNutritionRequest;
export type NutritionResponse = ServerCompatNutritionResponse;
export type DailyWorkday = ServerCompatibilityDayV0;
export type Exercise = ExerciseInputCompat;
export interface ServerCompatibilityLog {
  userId?: string;
  planId: string;
  dayIndex: number;
  workoutName: string;
  focus: string;
  exercises: WorkoutExercise[];
  totalDuration?: number;
  rpe?: number;
  notes?: string;
  completed: boolean;
  skipped: boolean;
  modified: boolean;
  substitutions?: { exerciseId: string; reason: string }[];
  createdAt: any;
}

export interface ServerCompatibilitySubstitute {
  exerciseId: string;
  name: string;
  targetMuscles: string[];
  equipment: string[];
  difficulty: string;
  reason: string;
}

// Server helper request/response bundles (legacy)
export interface ServerCompatLogWorkoutRequest {
  userId: string;
  planId: string;
  dayIndex: number;
  exercises: WorkoutExercise[];
  duration: number;
  overallRpe?: number;
  notes?: string;
  completed: boolean;
  skippedExercises?: string[];
  modifiedExercises?: ModifiedExercise[];
}

export interface ServerCompatRecoveryRequest {
  userId: string;
  wearableData: WearableDataPoint[];
  recentWorkoutCount: number;
  checkInData?: CheckIn[];
}

export interface ServerCompatRecoveryResponse {
  assessment: RecoveryAssessment;
  recommendation: 'train_normal' | 'reduce_intensity' | 'rest_day' | 'active_recovery';
  explanation: string;
}

export interface ServerCompatAdaptPlanRequest {
  userId: string;
  currentPlanId: string;
  completedWorkouts: string[];
  skippedWorkouts: string[];
  recoveryAssessment?: RecoveryAssessment;
  userFeedback?: string;
}

export interface ServerCompatAdaptPlanResponse {
  adaptedPlan: WeeklyPlan;
  changes: PlanChange[];
  rationale: string;
}

export interface ServerCompatRecoveryInput {
  sleepDuration?: number;
  sleepQuality?: number;
  hrv?: number;
  restingHeartRate?: number;
  steps?: number;
  activeCalories?: number;
  workoutFrequency?: number;
  energyLevel?: number;
  mood?: number;
  motivationLevel?: number;
}

export interface ServerCompatChatRequestLegacy {
  message: string;
  sessionId?: string;
}

export interface ServerCompatChatResponseLegacy {
  response: string;
  sandbox: boolean;
}

export interface ServerCompatNutritionRequest {
  query: string;
  profile?: FitnessProfile;
}

export interface ServerCompatNutritionResponse {
  guidance: string;
  disclaimer: string;
  sandbox: boolean;
}

export interface ServerCompatCheckInInput {
  workoutId?: string;
  energyLevel?: number;       // 1-5
  mood?: number;              // 1-5
  painOrIssues?: string;
  sleepQuality?: number;      // 1-5
  sleepDuration?: number;     // minutes
  motivationLevel?: number;   // 1-5
  workoutCompleted?: boolean;
  notes?: string;
}
