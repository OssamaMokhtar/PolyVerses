fix: TypeScript type unification + missing type additions

- types.ts: goal field broadened to string union covering server+component values
- types.ts: date field changed to string (ISO) in CrossTrainingPlanEntry
- types.ts: priority field added to PlanFitResponse, addDayToPlanInput, WeeklyPlanInput
- types.ts: HealthDataConsent exported as type alias from SubmittedHealthDataConsent
- types.ts: missing interfaces added (WeightLogEntry, NutritionGoal, MealSuggestion,
  MealPlanDay, MealPlan, NutritionLogEntry, SupplementLog, InjuryNote,
  RiskLevel, FatigueNote, EMAMethod, EMASession, RatedEffort, PeriodizationBlock,
  PeriodizationCycle, AdaptationPhase, AdaptationRecommendation, SleepQualityScore,
  StressIndexInput, StressIndexOutput, InjuryPreventive, CardioZone,
  HeartRateValue, HRVReading, UserPreference, UserPreferences)
- types.ts: spread operator replaced with explicit field mapping in FitnessProfile extends
- types.ts: split: interfaces in one block, type aliases + exports in another
- ExerciseLibrary.ts: getSubstitutes renamed to getSubstituteExercises for API consistency
- App.tsx: fitness tab child components conditionally rendered on user authenticated state
- server.ts: generateDeterministicPlan uses startOfWeek() for date anchor (was formatDate string)
- server.ts: mapToWorkoutSessionInput explicit field mapping for ScheduleConflict (was spread)
- server.ts: mapPlanDayToPlanFitResponse explicit field mapping for Priority (was spread)
- server.ts: type import paths normalized: removed duplicate relative imports alongside "src/" imports
- server.ts: helper function return types and signature params aligned to types.ts definitions
