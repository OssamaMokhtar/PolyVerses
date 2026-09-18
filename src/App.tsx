import { useState, useEffect } from 'react';
import { FitnessOnboarding } from './components/FitnessOnboarding';
import { ThinkSurface } from './components/ThinkSurface';
import { ObservabilityDashboard } from './components/ObservabilityDashboard';
import { 
  Target, Dumbbell, Activity, Heart, Clock, BarChart3, Users, Zap, 
  ChevronUp, ChevronDown, Pause, Play, Plus, Minus, Clock as ClockIcon,
  Sparkles, Check, AlertTriangle, Settings, LogOut, Brain
} from 'lucide-react';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { FitnessProfile, WeeklyPlan, WorkoutLogEntry } from './types';
import { EXERCISE_LIBRARY } from './ExerciseLibrary';

type FitnessTab = 'today' | 'weekly' | 'progress' | 'coach' | 'settings';
type PmTab = 'think' | 'observe';

export default function App() {
  const [onboarded, setOnboarded] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<FitnessTab | PmTab>('today');
  const [profile, setProfile] = useState<FitnessProfile | null>(null);
  const [plan, setPlan] = useState<WeeklyPlan | null>(null);
  const [todayWorkout, setTodayWorkout] = useState<{ day: any; workout: any } | null>(null);
  const [expandedDay, setExpandedDay] = useState<number | null>(null);
  const [restTimer, setRestTimer] = useState<number | null>(null);
  const [currentSet, setCurrentSet] = useState<{ exerciseId: string; setNumber: number } | null>(null);
  const [exerciseLogs, setExerciseLogs] = useState<Record<string, any[]>>({});
  const [showCoachPanel, setShowCoachPanel] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        try {
          // Check if profile exists
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

  // Fetch plan when profile is loaded
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
    // Auto-start rest timer for next set
    // (in a real app, you'd get rest time from the exercise config)
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
          name: EXERCISE_LIBRARY[parseInt(exId)]?.name || exId,
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
        body: JSON.stringify(workoutData)
      });
      if (res.ok) {
        alert('Workout logged! Your plan will adapt for next week.');
        setExerciseLogs({});
        setTodayWorkout(null);
        fetchPlan();
      }
    } catch (err) {
      console.error("Failed to log workout:", err);
    }
  };

  const tabs: { id: FitnessTab | PmTab; icon: any; label: string }[] = [
    { id: 'today', icon: Activity, label: "Today's Workout" },
    { id: 'weekly', icon: Target, label: 'Weekly Plan' },
    { id: 'progress', icon: BarChart3, label: 'Progress' },
    { id: 'coach', icon: Sparkles, label: 'Coach Chat' },
    { id: 'settings', icon: Settings, label: 'Settings' },
    { id: 'think', icon: Brain, label: 'PM Workbench' },
    { id: 'observe', icon: Activity, label: 'Observability' },
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
                  className={`relative rounded-lg border p-3 text-center cursor-pointer transition-all ${
                    isExpanded
                      ? 'bg-[#00A3FF]/10 border-[#00A3FF]/30'
                      : isToday
                      ? 'bg-[#00A3FF]/5 border-[#00A3FF]/20'
                      : 'bg-[#16161A] border-[#27272A] hover:border-[#3f3f46]'
                  }`}
                >
                  <div className={`text-xs font-medium mb-1 ${
                    isToday ? 'text-[#00A3FF]' : 'text-[#71717A]'
                  }`}>
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
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <BarChart3 className="w-12 h-12 text-[#71717A] mb-4" />
        <h3 className="text-lg font-medium mb-2">Progress Dashboard</h3>
        <p className="text-[#71717A] text-sm max-w-md">
          Track your strength trends, workout frequency, and volume over time.
          Coming soon — log your first workout to see data here.
        </p>
      </div>
    );
  };

  const renderCoachChat = () => {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Sparkles className="w-12 h-12 text-[#71717A] mb-4" />
        <h3 className="text-lg font-medium mb-2">Coach Chat</h3>
        <p className="text-[#71717A] text-sm max-w-md">
          Chat with your AI fitness coach. Ask about form, nutrition, recovery, or get motivation.
          Coming soon — the conversational coach is in development.
        </p>
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

            <button className="w-full flex items-center gap-3 p-3 rounded-lg border border-[#27272A] hover:bg-[#16161A] transition text-left">
              <ClockIcon className="w-4 h-4 text-[#00A3FF]" />
              <div className="flex-1">
                <div className="text-sm font-medium">Notifications</div>
                <div className="text-xs text-[#71717A]">Daily digest, workout reminders</div>
              </div>
              <ChevronRight className="w-4 h-4 text-[#71717A]" />
            </button>

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
          <div className="font-medium text-[#E4E4E7] mb-2">About PolyVerses</div>
          <div>
            PolyVerses PM Workbench · Version 1.0<br/>
            Built with React + Firebase + Gemini AI<br/>
            <a href="https://github.com/OssamaMokhtar/PolyVerses" className="text-[#00A3FF] hover:underline" target="_blank" rel="noopener noreferrer">
              View on GitHub →
            </a>
          </div>
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
        <span className="font-mono text-xs text-[#00A3FF] tracking-widest uppercase">Loading PolyVerses...</span>
      </div>
    );
  }

  if (!onboarded) {
    return <FitnessOnboarding currentUser={currentUser} onComplete={handleOnboardingComplete} />;
  }

  return (
    <div className="min-h-screen bg-[#0C0C0E] text-[#E4E4E7] flex flex-col selection:bg-[#00A3FF]/30 selection:text-[#E4E4E7] p-2 md:p-4 border-[6px] md:border-[10px] border-[#1A1A1E] font-sans relative">
      {/* Background gradient */}
      <div className="absolute top-0 left-0 right-0 h-[250px] bg-gradient-to-b from-[#00A3FF]/5 via-transparent to-transparent blur-3xl pointer-events-none" />

      {/* Header */}
      <header className="bg-[#121215]/90 backdrop-blur-xl border border-[#27272A] px-4 py-3 rounded-xl z-30 flex items-center justify-between gap-4 shadow-xl mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#00A3FF]/10 text-[#00A3FF] border border-[#00A3FF]/20 rounded-lg shrink-0">
            <Activity className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold tracking-wider uppercase font-mono text-[#F4F4F5]">PolyVerses</h1>
              <span className="text-[9px] font-bold font-mono text-[#00A3FF] px-1.5 py-0.5 bg-[#00A3FF]/10 border border-[#00A3FF]/30 rounded uppercase">
                PM Workbench
              </span>
            </div>
            <div className="text-xs text-[#71717A] mt-0.5">
              {profile?.goal?.replace('_', ' ') || 'Get started'}
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

      {/* Tab navigation */}
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

      {/* Tab content */}
      <div className="flex-1">
        {activeTab === 'today' && renderToday()}
        {activeTab === 'weekly' && renderWeeklyPlan()}
        {activeTab === 'progress' && renderProgress()}
        {activeTab === 'coach' && renderCoachChat()}
        {activeTab === 'settings' && renderSettings()}
        {activeTab === 'think' && <ThinkSurface className="p-4" />}
        {activeTab === 'observe' && <ObservabilityDashboard className="p-4" />}
      </div>

      {/* Footer disclaimer */}
      <div className="mt-4 text-xs text-[#71717A] text-center border-t border-[#27272A] pt-3">
        PolyVerses provides AI-powered product management assistance. Always validate AI-generated recommendations against your product context and stakeholder input.
      </div>
    </div>
  );
}