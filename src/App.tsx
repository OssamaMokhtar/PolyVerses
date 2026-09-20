import { useState, useEffect } from 'react';
import { FitnessOnboarding } from './components/FitnessOnboarding';
import {
  Target, Dumbbell, Activity, Heart, Clock, BarChart3, Users, Zap,
  ChevronUp, ChevronDown, Pause, Play, Plus, Minus, Clock as ClockIcon,
  Sparkles, Check, AlertTriangle, Settings, LogOut
} from 'lucide-react';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { FitnessProfile, WeeklyPlan, WorkoutLogEntry } from './types';
import { EXERCISE_LIBRARY, EXERCISE_BY_ID } from './ExerciseLibrary';
import { CoachChat } from './components/CoachingChat';
import { RecoveryDashboard } from './components/RecoveryDashboard';
import { CheckInForm } from './components/CheckInForm';

type FitnessTab = 'today' | 'weekly' | 'progress' | 'coach' | 'settings';

export default function App() {
  const [onboarded, setOnboarded] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<FitnessTab>('today');
  const [profile, setProfile] = useState<FitnessProfile | null>(null);
  const [plan, setPlan] = useState<WeeklyPlan | null>(null);
  const [todayWorkout, setTodayWorkout] = useState<{ day: any; workout: any } | null>(null);
  const [expandedDay, setExpandedDay] = useState<number | null>(null);
  const [restTimer, setRestTimer] = useState<number | null>(null);
  const [currentSet, setCurrentSet] = useState<{ exerciseId: string; setNumber: number } | null>(null);
  const [exerciseLogs, setExerciseLogs] = useState<Record<string, any[]>>({});
  const [showCoachPanel, setShowCoachPanel] = useState(false);
  const [showCheckIn, setShowCheckIn] = useState(false);
  const [checkInWorkoutId, setCheckInWorkoutId] = useState<string | undefined>();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        try {
          const profileRef = doc(db, 'users', user.uid, 'profile', 'current');
          const profileSnap = await getDoc(profileRef);
          if (profileSnap.exists()) {
            const p = profileSnap.data();
            setProfile(p as FitnessProfile);
            setOnboarded(true);
          }
        } catch (err) {
          console.error("Failed to load profile:", err);
        }
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleOnboardingComplete = (p: FitnessProfile) => {
    setProfile(p);
    setOnboarded(true);
  };

  useEffect(() => {
    if (!profile || !currentUser) return;
    fetchPlan();
  }, [profile, currentUser]);

  const fetchPlan = async () => {
    if (!currentUser) return;
    try {
      const res = await fetch('/api/fitness/plan', {
        headers: { 'x-user-id': currentUser.uid }
      });
      if (res.ok) {
        const data = await res.json();
        setPlan(data.plan);
      }
    } catch (err) {
      console.error("Failed to fetch plan:", err);
    }
  };

  const generatePlan = async () => {
    if (!currentUser || !profile) return;
    try {
      const res = await fetch('/api/fitness/generate-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': currentUser.uid },
        body: JSON.stringify({})
      });
      if (res.ok) {
        const data = await res.json();
        setPlan(data.plan);
      }
    } catch (err) {
      console.error("Failed to generate plan:", err);
    }
  };

  const getTodayWorkout = () => {
    if (!plan) return null;
    const today = new Date();
    const dayIndex = today.getDay() === 0 ? 6 : today.getDay() - 1;
    const day = plan.days.find(d => d.dayIndex === dayIndex);
    if (day && day.workouts && day.workouts.length > 0) {
      return { day, workout: day.workouts[0] };
    }
    return null;
  };

  useEffect(() => {
    setTodayWorkout(getTodayWorkout());
  }, [plan]);

  const handleSetComplete = (exerciseId: string, setNumber: number) => {
    setExerciseLogs(prev => {
      const current = prev[exerciseId] || [];
      return {
        ...prev,
        [exerciseId]: current.map((s: any, i: number) =>
          i === setNumber ? { ...s, completed: !s.completed } : s
        )
      };
    });
  };

  const handleStartRestTimer = (seconds: number) => {
    setRestTimer(seconds);
    setCurrentSet(prev => prev);
  };

  const handleNextSet = (exerciseId: string, setNumber: number) => {
    setCurrentSet({ exerciseId, setNumber: setNumber + 1 });
  };

  const handleSubmitWorkout = async (completed: boolean) => {
    if (!currentUser || !plan || !todayWorkout) return;
    try {
      const workoutData: WorkoutLogEntry = {
        userId: currentUser.uid,
        planId: plan.id || plan.weekNumber.toString(),
        dayIndex: todayWorkout.day.dayIndex,
        workoutName: todayWorkout.workout.workoutName,
        focus: todayWorkout.workout.focus,
        exercises: Object.entries(exerciseLogs).map(([exId, sets]) => ({
          exerciseId: exId,
          name: EXERCISE_BY_ID[exId]?.name || exId,
          category: '',
          primaryMuscles: [],
          prescribedSets: sets.length,
          prescribedReps: '',
          prescribedRestSeconds: 60,
          sets: sets.map((s: any, i: number) => ({
            setNumber: i + 1,
            reps: s.reps || 0,
            weight: s.weight || 0,
            rpe: s.rpe,
            completed: s.completed,
            note: s.note,
          })),
        })),
        duration: 0,
        completed,
        skipped: !completed,
        modified: false,
        createdAt: Date.now(),
      };

      const res = await fetch('/api/fitness/log-workout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': currentUser.uid },
        body: JSON.stringify(workoutData as any)
      });
      if (res.ok) {
        if (completed) {
          // Show check-in form after completing workout
          setCheckInWorkoutId(todayWorkout.workout.workoutName);
          setShowCheckIn(true);
        } else {
          alert('Workout skipped. Your plan will adapt for next week.');
        }
        setExerciseLogs({});
        setTodayWorkout(null);
        fetchPlan();
      }
    } catch (err) {
      console.error("Failed to log workout:", err);
    }
  };

  const tabs: { id: FitnessTab; icon: any; label: string }[] = [
    { id: 'today', icon: Activity, label: "Today's Workout" },
    { id: 'weekly', icon: Target, label: 'Weekly Plan' },
    { id: 'progress', icon: BarChart3, label: 'Progress' },
    { id: 'coach', icon: Sparkles, label: 'Coach Chat' },
    { id: 'settings', icon: Settings, label: 'Settings' },
  ];

  const renderToday = () => {
    if (!todayWorkout) {
      return (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <ClockIcon className="w-12 h-12 text-[#71717A] mb-4" />
          <h3 className="text-lg font-medium mb-2">No workout scheduled today</h3>
          <p className="text-[#71717A] text-sm max-w-md">
            {plan ? "Check your weekly plan for upcoming workouts." : "Generate your first plan to get started."}
          </p>
          {!plan && (
            <button
              onClick={generatePlan}
              className="mt-4 px-4 py-2 bg-[#00A3FF] text-white rounded-lg text-sm font-medium hover:bg-[#00A3FF]/90 transition"
            >
              Generate My Plan
            </button>
          )}
        </div>
      );
    }

    const { day, workout } = todayWorkout;
    const exercises = workout.exercises || EXERCISE_LIBRARY.slice(0, 5).map((ex, i) => ({
      exerciseId: i.toString(),
      name: ex.name,
      category: ex.category,
      primaryMuscles: ex.targetMuscles,
      prescribedSets: 3,
      prescribedReps: '8-12',
      prescribedRestSeconds: 60,
      sets: [],
    }));

    return (
      <div className="flex flex-col">
        <div className="bg-[#121215]/90 backdrop-blur-xl border border-[#27272A] rounded-xl p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-xs text-[#71717A] uppercase tracking-wide">
                {['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date().getDay()]
                }
              </div>
              <h2 className="text-xl font-bold mt-1">{workout.workoutName}</h2>
              <div className="flex items-center gap-2 mt-1">
                <Target className="w-4 h-4 text-[#00A3FF]" />
                <span className="text-sm text-[#A1A1AA]">{workout.focus}</span>
                <span className="text-xs text-[#71717A]">· {workout.duration} min</span>
                {day.recoveryScore != null && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                    day.recoveryScore >= 70 ? 'bg-[#10B981]/20 text-[#10B981]' :
                    day.recoveryScore >= 40 ? 'bg-[#F59E0B]/20 text-[#F59E0B]' :
                    'bg-[#EF4444]/20 text-[#EF4444]'
                  }`}>
                    Recovery: {day.recoveryScore}
                  </span>
                )}
              </div>
            </div>
            {restTimer !== null && (
              <div className="text-center">
                <div className="text-3xl font-mono font-bold text-[#00A3FF]">{restTimer}s</div>
                <div className="text-xs text-[#71717A]">Rest</div>
              </div>
            )}
          </div>

          <div className="space-y-4">
            {exercises.map((exercise, idx) => (
              <div key={exercise.exerciseId} className="border border-[#27272A] rounded-lg overflow-hidden">
                <div className="flex items-center justify-between p-3 bg-[#16161A] border-b border-[#27272A]">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded bg-[#00A3FF]/20 flex items-center justify-center">
                      <span className="text-[#00A3FF] text-xs font-bold">{idx + 1}</span>
                    </div>
                    <div>
                      <div className="text-sm font-medium">{exercise.name}</div>
                      <div className="text-xs text-[#71717A]">{exercise.prescribedSets} sets × {exercise.prescribedReps} reps</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {exercise.sets?.filter(s => s.completed).length === exercise.prescribedSets && (
                      <Check className="w-5 h-5 text-[#10B981]" />
                    )}
                  </div>
                </div>

                <div className="p-3 space-y-2">
                  {Array.from({ length: exercise.prescribedSets }, (_, i) => {
                    const existingLog = exerciseLogs[exercise.exerciseId]?.[i] || {};
                    return (
                      <div key={i} className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold bg-[#1A1A1E] text-[#71717A] shrink-0">
                          {i + 1}
                        </div>
                        <div className="flex-1 grid grid-cols-3 gap-2">
                          <input
                            type="number"
                            placeholder="Reps"
                            value={existingLog.reps || ''}
                            onChange={e => setExerciseLogs(prev => ({
                              ...prev,
                              [exercise.exerciseId]: prev[exercise.exerciseId] || [],
                            }))}
                            className="w-full px-2 py-1.5 bg-[#1A1A1E] border border-[#27272A] rounded text-sm text-[#E4E4E7] placeholder-[#71717A] text-center focus:outline-none focus:border-[#00A3FF]/40"
                          />
                          <input
                            type="number"
                            placeholder="Weight"
                            value={existingLog.weight || ''}
                            onChange={e => setExerciseLogs(prev => ({
                              ...prev,
                              [exercise.exerciseId]: prev[exercise.exerciseId] || [],
                            }))}
                            className="w-full px-2 py-1.5 bg-[#1A1A1E] border border-[#27272A] rounded text-sm text-[#E4E4E7] placeholder-[#71717A] text-center focus:outline-none focus:border-[#00A3FF]/40"
                          />
                          <button
                            onClick={() => handleSetComplete(exercise.exerciseId, i)}
                            className={`w-8 h-8 rounded-full flex items-center justify-center transition ${
                              existingLog.completed
                                ? 'bg-[#10B981]/20 text-[#10B981] border border-[#10B981]/30'
                                : 'bg-[#1A1A1E] text-[#71717A] border border-[#27272A] hover:bg-[#27272A]'
                            }`}
                          >
                            {existingLog.completed ? <Check className="w-4 h-4" /> : '+'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="p-2 bg-[#121215] border-t border-[#27272A] flex items-center justify-between">
                  <button
                    onClick={() => handleStartRestTimer(exercise.prescribedRestSeconds || 60)}
                    className="text-xs text-[#00A3FF] hover:bg-[#00A3FF]/10 px-2 py-1 rounded transition"
                  >
                    Rest {exercise.prescribedRestSeconds || 60}s
                  </button>
                  <button
                    onClick={() => handleNextSet(exercise.exerciseId, exercise.prescribedSets - 1)}
                    className="text-xs text-[#71717A] hover:bg-[#27272A] px-2 py-1 rounded transition"
                  >
                    Next set →
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3 mt-4 pt-4 border-t border-[#27272A]">
            <button
              onClick={() => handleSubmitWorkout(false)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[#EF4444]/30 text-[#EF4444] hover:bg-[#EF4444]/10 transition text-sm"
            >
              <Pause className="w-4 h-4" />
              Skip Workout
            </button>
            <button
              onClick={() => handleSubmitWorkout(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#10B981] text-white hover:bg-[#10B981]/90 transition text-sm font-medium"
            >
              <Check className="w-4 h-4" />
              Complete Workout
            </button>
          </div>
        </div>

        <div className="mt-3 text-xs text-[#71717A] flex items-center gap-1 justify-center">
          <AlertTriangle className="w-3.5 h-3.5" />
          AI-generated fitness guidance. Listen to your body and consult a professional for injuries.
        </div>

        {/* Post-workout check-in */}
        {showCheckIn && (
          <div className="mt-4">
            <CheckInForm
              workoutId={checkInWorkoutId}
              onComplete={() => {
                setShowCheckIn(false);
                setCheckInWorkoutId(undefined);
                fetchPlan();
              }}
            />
          </div>
        )}
      </div>
    );
  };

  const renderWeeklyPlan = () => {
    if (!plan) {
      return (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Target className="w-12 h-12 text-[#71717A] mb-4" />
          <h3 className="text-lg font-medium mb-2">No plan yet</h3>
          <p className="text-[#71717A] text-sm max-w-md">
            Generate your first weekly workout plan to see it here.
          </p>
          <button
            onClick={generatePlan}
            className="mt-4 px-4 py-2 bg-[#00A3FF] text-white rounded-lg text-sm font-medium hover:bg-[#00A3FF]/90 transition"
          >
            Generate My Plan
          </button>
        </div>
      );
    }

    const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    const cardClass = (isExpanded: boolean, isToday: boolean) =>
      isExpanded
        ? 'bg-[#00A3FF]/10 border-[#00A3FF]/30'
        : isToday
        ? 'bg-[#00A3FF]/5 border-[#00A3FF]/20'
        : 'bg-[#16161A] border-[#27272A] hover:border-[#3f3f46]';

    const recoveryBadgeClass = (score: number) =>
      score >= 70 ? 'bg-[#10B981]' : score >= 40 ? 'bg-[#F59E0B]' : 'bg-[#EF4444]';

    const recClass = (rec: string) =>
      rec === 'train_normal' ? 'bg-[#10B981]/20 text-[#10B981]' :
      rec === 'reduce_intensity' ? 'bg-[#F59E0B]/20 text-[#F59E0B]' :
      'bg-[#71717A]/20 text-[#71717A]';

    const recLabel = (rec: string) =>
      rec === 'train_normal' ? '✓ Train' :
      rec === 'reduce_intensity' ? '↓ Reduce' : '— Rest';

    return (
      <div className="flex flex-col">
        <div className="bg-[#121215]/90 backdrop-blur-xl border border-[#27272A] rounded-xl p-4 mb-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Week of {new Date(plan.startDate).toLocaleDateString()}</h2>
            <span className="text-xs text-[#71717A]">Week {plan.weekNumber} · Version {plan.version}</span>
          </div>
          <div className="grid grid-cols-7 gap-2">
            {plan.days.map((day, idx) => {
              const isExpanded = expandedDay === idx;
              const today = new Date();
              const dayIndex = today.getDay() === 0 ? 6 : today.getDay() - 1;
              const isToday = day.dayIndex === dayIndex;

              return (
                <div
                  key={idx}
                  onClick={() => setExpandedDay(isExpanded ? null : idx)}
                  className={`relative rounded-lg border p-3 text-center cursor-pointer transition-all ${cardClass(isExpanded, isToday)}`}
                >
                  {day.recoveryScore != null && (
                    <div
                      className={`absolute -top-1 -right-1 w-4 h-4 rounded-full border-2 border-[#121215] ${recoveryBadgeClass(day.recoveryScore)}`}
                      title={`Recovery: ${day.recoveryScore}`}
                    />
                  )}
                  <div className={`text-xs font-medium mb-1 ${isToday ? 'text-[#00A3FF]' : 'text-[#71717A]'}`}>
                    {dayLabels[idx]}
                  </div>
                  {isExpanded ? <ChevronUp className="w-4 h-4 text-[#00A3FF] mx-auto" /> : <ChevronDown className="w-4 h-4 text-[#71717A] mx-auto" />}
                  {day.workouts?.map((w: any, wi: number) => (
                    <div key={wi} className={`mt-2 text-left ${isExpanded ? '' : 'hidden'}`}>
                      <div className="text-sm font-medium text-[#E4E4E7]">{w.workoutName}</div>
                      <div className="text-xs text-[#71717A] mt-0.5">{w.focus} · {w.duration}min</div>
                      <div className="text-xs text-[#71717A] mt-1">
                        {w.exercises?.length || 0} exercises
                      </div>
                    </div>
                  ))}
                  {!isExpanded && day.workouts?.length > 0 && (
                    <div className="mt-2 text-xs text-[#A1A1AA]">
                      Tap to expand
                    </div>
                  )}
                  {day.recoveryRecommendation && isExpanded && (
                    <div className="mt-2 text-xs text-center">
                      <span className={`px-1.5 py-0.5 rounded-full ${recClass(day.recoveryRecommendation)}`}>
                        {recLabel(day.recoveryRecommendation)}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {expandedDay !== null && plan.days[expandedDay] && (
          <div className="bg-[#121215]/90 backdrop-blur-xl border border-[#27272A] rounded-xl p-4 animate-in fade-in zoom-in duration-200">
            <h3 className="text-md font-semibold mb-3">
              {dayLabels[expandedDay]} — {plan.days[expandedDay].date}
            </h3>
            {plan.days[expandedDay].workouts?.map((workout: any, wi: number) => (
              <div key={wi} className="mb-4 last:mb-0">
                <div className="flex items-center gap-2 mb-2">
                  <Dumbbell className="w-4 h-4 text-[#00A3FF]" />
                  <span className="font-medium">{workout.workoutName}</span>
                  <span className="text-xs text-[#71717A]">({workout.duration} min)</span>
                </div>
                <div className="text-xs text-[#A1A1AA] mb-2">{workout.focus}</div>
                <div className="space-y-2">
                  {workout.exercises?.map((ex: any, ei: number) => (
                    <div key={ei} className="flex items-center gap-2 text-sm py-1 border-b border-[#27272A] pb-1 last:border-0 last:pb-0">
                      <span className="text-[#71717A] w-4 text-center shrink-0">{ei + 1}.</span>
                      <span className="font-medium">{ex.exerciseName}</span>
                      <span className="text-[#71717A] ml-auto">{ex.sets}×{ex.reps} · {ex.rest}s rest</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderProgress = () => {
    return currentUser ? (
      <RecoveryDashboard userId={currentUser.uid} />
    ) : (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <BarChart3 className="w-12 h-12 text-[#71717A] mb-4" />
        <h3 className="text-lg font-medium mb-2">Progress Dashboard</h3>
        <p className="text-[#71717A] text-sm max-w-md">
          Track your strength trends, workout frequency, and volume over time.
          Log in to see your progress.
        </p>
      </div>
    );
  };

  const handleSendMessage = async (message: string): Promise<{ reply: string; agentId: string; suggestions?: string[] }> => {
    if (!currentUser) throw new Error('Not authenticated');
    const res = await fetch('/api/fitness/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-id': currentUser.uid },
      body: JSON.stringify({ message, context: { profile, recentWorkouts: [], currentPlan: plan } }),
    });
    if (!res.ok) throw new Error('Chat request failed');
    return res.json();
  };

  const renderCoachChat = () => {
    return (
      <div className="flex flex-col h-full">
        <div className="bg-[#121215]/90 backdrop-blur-xl border border-[#27272A] rounded-xl p-4 flex-1">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Coach Chat</h2>
            <span className="text-xs text-[#71717A]">AI-powered fitness coaching</span>
          </div>
          <CoachChat
            profile={profile}
            recentWorkouts={[]}
            currentPlan={plan}
            onSendMessage={handleSendMessage}
            loading={false}
          />
        </div>
      </div>
    );
  };

  const renderSettings = () => {
    return (
      <div className="flex flex-col">
        <div className="bg-[#121215]/90 backdrop-blur-xl border border-[#27272A] rounded-xl p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Settings</h2>
          </div>

          <div className="space-y-1">
            <button className="w-full flex items-center gap-3 p-3 rounded-lg border border-[#27272A] hover:bg-[#16161A] transition text-left">
              <Target className="w-4 h-4 text-[#00A3FF]" />
              <div className="flex-1">
                <div className="text-sm font-medium">Edit Profile</div>
                <div className="text-xs text-[#71717A]">Update your goals, equipment, and schedule</div>
              </div>
              <ChevronRight className="w-4 h-4 text-[#71717A]" />
            </button>

            <button className="w-full flex items-center gap-3 p-3 rounded-lg border border-[#27272A] hover:bg-[#16161A] transition text-left">
              <Heart className="w-4 h-4 text-[#00A3FF]" />
              <div className="flex-1">
                <div className="text-sm font-medium">Wearable Connections</div>
                <div className="text-xs text-[#71717A]">Connect Apple HealthKit or Google Fit</div>
              </div>
              <ChevronRight className="w-4 h-4 text-[#71717A]" />
            </button>

            {/* HealthKit Connect Card */}
            <div className="mt-3 p-4 bg-[#121215]/90 backdrop-blur-xl border border-[#27272A] rounded-xl">
              <h3 className="text-sm font-semibold mb-3">Connect a Wearable</h3>
              <p className="text-xs text-[#71717A] mb-4">
                Connect your wearable to get recovery scores, sleep tracking, and personalized coaching adjustments.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => alert('Apple HealthKit integration — connect via Safari on iOS/macOS')}
                  className="flex items-center gap-3 p-3 rounded-lg border border-[#27272A] hover:bg-[#16161A] transition text-left"
                >
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#A2AAAD] to-[#5C6370] flex items-center justify-center">
                    <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M17.05 20.28c-.98.98-2.61.02-2.69-1.06-.08-1.04.99-1.88 1.97-2.15.39-.12.85-.16 1.22-.16h.01c.49 0 .98.13 1.35.43.37.3.61.7.67 1.16.06.46-.09.93-.39 1.28-.13.13-.27.2-.45.2H17c-.69 0-1.25-.45-1.45-1.1C15.35 19.5 15.83 19.95 17.05 20.28zM12.03 21.7c-.32.32-.84.34-1.22.08-.38-.26-.54-.76-.44-1.26.08-.42.34-.88.78-1.24.19-.16.42-.25.69-.25h.05c.46 0 .82.3 1 .74.18.44.15.96-.1 1.3-.09.12-.2.2-.36.2h-.32c-.5 0-.92-.42-.94-1 0-.02-.01-.05-.01-.08zM8.06 22.01c-.57.57-1.52.6-2.15.12-.62-.48-.68-1.52-.23-2.22.46-.7.75-1.01 1.1-1.41.13-.16.31-.25.51-.25h.08c.37 0 .67.22.89.58.22.36.26.82.06 1.22-.06.13-.15.22-.28.28H8.2c-.35 0-.67-.19-.83-.54-.14-.32-.17-.66-.07-1 .04-.14.1-.28.1-.3zM4.16 21.52c-.76.46-1.71.21-2.17-.3-.47-.5-.54-1.28-.14-1.92.4-.66.58-1.1.62-1.72.04-.62-.12-1.18-.64-1.68-.17-.17-.39-.27-.64-.27h-.04c-.47 0-.85.3-1.04.75-.19.45-.15.98.12 1.45.09.13.19.22.33.28h.34c.42 0 .77-.28.94-.72.16-.42.15-.89-.08-1.34-.06-.13-.14-.2-.26-.25z"/></svg>
                  </div>
                  <div>
                    <div className="text-sm font-medium">Apple HealthKit</div>
                    <div className="text-xs text-[#71717A] mt-0.5">iOS / macOS</div>
                  </div>
                  <div className="ml-auto">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-[#10B981]/20 text-[#10B981]">Connect</span>
                  </div>
                </button>
                <button
                  onClick={() => alert('Google Fit integration — connect via OAuth')}
                  className="flex items-center gap-3 p-3 rounded-lg border border-[#27272A] hover:bg-[#16161A] transition text-left"
                >
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#4285F4] to-[#34A853] flex items-center justify-center">
                    <span className="text-white text-xs font-bold">G</span>
                  </div>
                  <div>
                    <div className="text-sm font-medium">Google Fit</div>
                    <div className="text-xs text-[#71717A] mt-0.5">Android / Web</div>
                  </div>
                  <div className="ml-auto">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-[#F59E0B]/20 text-[#F59E0B]">Connect</span>
                  </div>
                </button>
              </div>
              <div className="mt-3 pt-3 border-t border-[#27272A]">
                <p className="text-xs text-[#71717A]">
                  No wearables connected yet.
                </p>
              </div>
            </div>

            <button className="w-full flex items-center gap-3 p-3 rounded-lg border border-[#27272A] hover:bg-[#16161A] transition text-left">
              <ClockIcon className="w-4 h-4 text-[#00A3FF]" />
              <div className="flex-1">
                <div className="text-sm font-medium">Notifications</div>
                <div className="text-xs text-[#71717A]">Daily digest, workout reminders</div>
              </div>
              <ChevronRight className="w-4 h-4 text-[#71717A]" />
            </button>

            {/* Notification Settings Panel */}
            <div className="mt-3 p-4 bg-[#121215]/90 backdrop-blur-xl border border-[#27272A] rounded-xl animate-in fade-in zoom-in duration-200">
              <h3 className="text-sm font-semibold mb-4">Notification Preferences</h3>

              {/* Daily digest time */}
              <div className="mb-4">
                <label className="text-xs text-[#71717A] block mb-1">Daily digest delivery time</label>
                <div className="flex items-center gap-2">
                  {['06:00', '07:00', '08:00', '09:00', '10:00', '18:00', '19:00', '20:00'].map(time => (
                    <button
                      key={time}
                      onClick={() => {/* TODO: save to /api/fitness/settings/notifications */}}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${time === '08:00' ? 'bg-[#00A3FF]/20 border-[#00A3FF]/40 text-[#00A3FF]' : 'bg-[#1A1A20] border-[#27272A] text-[#71717A] hover:border-[#3f3f46]'}`}
                    >
                      {time}
                    </button>
                  ))}
                </div>
              </div>

              {/* Toggles */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[#E4E4E7]">Workout reminders</span>
                  <div className="w-10 h-5 rounded-full bg-[#00A3FF] relative">
                    <div className="w-4 h-4 rounded-full bg-white absolute top-0.5 right-0.5 shadow-sm" />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[#E4E4E7]">Post-workout check-in prompt</span>
                  <div className="w-10 h-5 rounded-full bg-[#00A3FF] relative">
                    <div className="w-4 h-4 rounded-full bg-white absolute top-0.5 right-0.5 shadow-sm" />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[#E4E4E7]">Recovery score notification</span>
                  <div className="w-10 h-5 rounded-full bg-[#27272A] relative">
                    <div className="w-4 h-4 rounded-full bg-white absolute top-0.5 left-0.5 shadow-sm" />
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-[#27272A]">
                <p className="text-xs text-[#71717A]">
                  Push notifications require browser permission. Daily digest is sent via email or in-app.
                </p>
              </div>
            </div>

            <button className="w-full flex items-center gap-3 p-3 rounded-lg border border-[#27272A] hover:bg-[#16161A] transition text-left">
              <AlertTriangle className="w-4 h-4 text-[#F59E0B]" />
              <div className="flex-1">
                <div className="text-sm font-medium">Disclaimer & Safety</div>
                <div className="text-xs text-[#71717A]">Review the fitness disclaimer</div>
              </div>
              <ChevronRight className="w-4 h-4 text-[#71717A]" />
            </button>
          </div>
        </div>

        <div className="mt-4 p-4 bg-[#121215]/90 backdrop-blur-xl border border-[#27272A] rounded-xl text-xs text-[#71717A]">
          <p className="font-medium text-[#E4E4E7] mb-2">About PolySync</p>
          <p className="leading-relaxed">
            AI Fitness Coach Platform · Version 1.0<br />
            Built with React + Firebase + Gemini AI<br />
            <a href="https://github.com/OssamaMokhtar/PolyVerses" className="text-[#00A3FF] hover:underline" target="_blank" rel="noopener noreferrer">
              View on GitHub →
            </a>
          </p>
        </div>

        <button
          onClick={async () => {
            await signOut(auth);
            setOnboarded(false);
            setProfile(null);
            setPlan(null);
          }}
          className="mt-4 flex items-center gap-2 px-4 py-2 rounded-lg border border-[#EF4444]/30 text-[#EF4444] hover:bg-[#EF4444]/10 transition text-sm w-full"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0C0C0E] text-[#E4E4E7] flex flex-col items-center justify-center p-4 border-[10px] border-[#1A1A1E]">
        <Activity className="w-10 h-10 text-[#00A3FF] animate-spin mb-4" />
        <span className="font-mono text-xs text-[#00A3FF] tracking-widest uppercase">Loading PolySync...</span>
      </div>
    );
  }

  if (!onboarded) {
    return <FitnessOnboarding currentUser={currentUser} onComplete={handleOnboardingComplete} />;
  }

  return (
    <div className="min-h-screen bg-[#0C0C0E] text-[#E4E4E7] flex flex-col selection:bg-[#00A3FF]/30 selection:text-[#E4E4E7] p-2 md:p-4 border-[6px] md:border-[10px] border-[#1A1A1E] font-sans relative">
      <div className="absolute top-0 left-0 right-0 h-[250px] bg-gradient-to-b from-[#00A3FF]/5 via-transparent to-transparent blur-3xl pointer-events-none" />

      <header className="bg-[#121215]/90 backdrop-blur-xl border border-[#27272A] px-4 py-3 rounded-xl z-30 flex items-center justify-between gap-4 shadow-xl mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#00A3FF]/10 text-[#00A3FF] border border-[#00A3FF]/20 rounded-lg shrink-0">
            <Activity className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold tracking-wider uppercase font-mono text-[#F4F4F5]">PolySync</h1>
              <span className="text-[9px] font-bold font-mono text-[#00A3FF] px-1.5 py-0.5 bg-[#00A3FF]/10 border border-[#00A3FF]/30 rounded uppercase">
                AI Fitness Coach
              </span>
            </div>
            <div className="text-xs text-[#71717A] mt-0.5">
              {profile?.goal?.replace(/_/g, ' ') || 'Get started'}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {profile?.healthDataConsent && (
            <div className="status-pill !text-[#00A3FF] !bg-[#00A3FF]/10 !border-[#00A3FF]/30 px-2 py-1 flex items-center gap-1 text-xs">
              <Heart className="w-3 h-3" />
              Health Data
            </div>
          )}
          <div className="status-pill !text-[#10B981] !bg-[#10B981]/10 !border-[#10B981]/30 px-2 py-1 flex items-center gap-1 text-xs">
            <Activity className="w-3 h-3" />
            ONLINE
          </div>
        </div>
      </header>

      <nav className="flex gap-1 mb-4 flex-wrap">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-[#00A3FF]/10 border-[#00A3FF]/30 text-[#00A3FF]'
                : 'bg-[#16161A] border-[#27272A] text-[#A1A1AA] hover:border-[#3f3f46] hover:text-[#E4E4E7]'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="flex-1">
        {activeTab === 'today' && renderToday()}
        {activeTab === 'weekly' && renderWeeklyPlan()}
        {activeTab === 'progress' && renderProgress()}
        {activeTab === 'coach' && renderCoachChat()}
        {activeTab === 'settings' && renderSettings()}
      </div>

      <div className="mt-4 text-xs text-[#71717A] text-center border-t border-[#27272A] pt-3">
        PolySync provides AI-generated fitness guidance. Always warm up properly and listen to your body.
        Consult a healthcare professional for injuries or medical conditions.
      </div>
    </div>
  );
}
