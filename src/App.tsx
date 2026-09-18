import { useState, useEffect, useCallback } from 'react';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import {
  Target, Dumbbell, Activity, Heart, Clock, BarChart3, Users, Zap,
  ChevronUp, ChevronDown, Pause, Play, Plus, Minus, Clock as ClockIcon,
  Sparkles, Check, AlertTriangle, Settings, LogOut, Info
} from 'lucide-react';
import { FitnessProfile, WeeklyPlan, WorkoutLogEntry, WorkoutExercise, ExerciseSet } from './types';
import { EXERCISE_LIBRARY, EXERCISE_BY_ID } from './ExerciseLibrary';
import { WorkoutSession } from './components/WorkoutSession';
import { WeeklyPlan as WeeklyPlanComponent } from './components/WeeklyPlan';
import { ProgressDashboard } from './components/ProgressDashboard';
import { CoachingChat } from './components/CoachingChat';
import { Settings as SettingsComponent } from './components/Settings';

type FitnessTab = 'today' | 'weekly' | 'progress' | 'coach' | 'settings';

export default function App() {
  const [onboarded, setOnboarded] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<FitnessTab>('today');
  const [profile, setProfile] = useState<FitnessProfile | null>(null);
  const [plan, setPlan] = useState<WeeklyPlan | null>(null);
  const [todayWorkout, setTodayWorkout] = useState<{
    day: { dayIndex: number; workouts: { workoutName: string; focus: string; duration: number; exercises: WorkoutExercise[] }[] };
    workout: { workoutName: string; focus: string; duration: number; exercises: WorkoutExercise[] };
  } | null>(null);
  const [expandedDay, setExpandedDay] = useState<number | null>(null);
  const [restTimer, setRestTimer] = useState<number | null>(null);
  const [currentSet, setCurrentSet] = useState<{ exerciseId: string; setNumber: number } | null>(null);
  const [exerciseLogs, setExerciseLogs] = useState<Record<string, ExerciseSet[]>>({});
  const [showCoachPanel, setShowCoachPanel] = useState(false);

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
          console.error('Failed to load profile:', err);
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
      console.error('Failed to fetch plan:', err);
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
      console.error('Failed to generate plan:', err);
    }
  };

  const getTodayWorkout = useCallback(() => {
    if (!plan) return null;
    const today = new Date();
    const dayIndex = today.getDay() === 0 ? 6 : today.getDay() - 1;
    const day = plan.days.find(d => d.dayIndex === dayIndex);
    if (day && day.workouts && day.workouts.length > 0) {
      return { day, workout: day.workouts[0] };
    }
    return null;
  }, [plan]);

  useEffect(() => {
    setTodayWorkout(getTodayWorkout());
  }, [plan, getTodayWorkout]);

  const handleSetComplete = (exerciseId: string, setNumber: number) => {
    setExerciseLogs(prev => {
      const current = prev[exerciseId] || [];
      return {
        ...prev,
        [exerciseId]: current.map((s: ExerciseSet, i: number) =>
          i === setNumber ? { ...s, completed: !s.completed } : s
        )
      };
    });
  };

  const handleLogChange = (exerciseId: string, setIndex: number, data: Partial<ExerciseSet>) => {
    setExerciseLogs(prev => {
      const current = prev[exerciseId] || [];
      const updated = [...current];
      if (!updated[setIndex]) {
        updated[setIndex] = { setNumber: setIndex + 1 } as ExerciseSet;
      }
      updated[setIndex] = { ...updated[setIndex], ...data, setNumber: setIndex + 1 } as ExerciseSet;
      return { ...prev, [exerciseId]: updated };
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
        exercises: Object.entries(exerciseLogs).map(([exId, sets]) => {
          const workoutEx = todayWorkout?.workout.exercises.find(e => e.exerciseId === exId);
          const typedSets = sets as ExerciseSet[];
          const libEx = EXERCISE_BY_ID[exId];
          return {
            exerciseId: exId,
            name: workoutEx?.name || libEx?.name || exId,
            category: workoutEx?.category || libEx?.category || '',
            primaryMuscles: workoutEx?.primaryMuscles || libEx?.primaryMuscles || [],
            prescribedSets: workoutEx ? workoutEx.prescribedSets : (typedSets.length || 3),
            prescribedReps: workoutEx?.prescribedReps ?? '8-12',
            prescribedRestSeconds: workoutEx?.prescribedRestSeconds ?? 60,
            sets: typedSets.map((s: ExerciseSet, i: number) => ({
              setNumber: i + 1,
              reps: s.reps || 0,
              weight: s.weight || 0,
              rpe: s.rpe,
              completed: s.completed,
              note: s.note,
            })),
          };
        }),
        duration: 0,
        completed,
        skippedExercises: [],
        modifiedExercises: [],
        notes: completed ? '' : 'Skipped',
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
      console.error('Failed to log workout:', err);
    }
  };

  const handleSubstitute = (exerciseId: string) => {
    // TODO: call /api/fitness/substitute and swap the exercise
    console.log('Substitute requested for:', exerciseId);
  };

  const handleStartSession = (dayIndex: number) => {
    if (!plan) return;
    const day = plan.days.find(d => d.dayIndex === dayIndex);
    if (day && day.workouts && day.workouts.length > 0) {
      setTodayWorkout({ day, workout: day.workouts[0] });
      setActiveTab('today');
    }
  };

  const todayWorkoutForSession = todayWorkout ? {
    workoutName: todayWorkout.workout.workoutName,
    focus: todayWorkout.workout.focus,
    duration: todayWorkout.workout.duration,
    exercises: todayWorkout.workout.exercises,
  } : null;

  const tabs = [
    { id: 'today' as FitnessTab, icon: Activity, label: "Today's Workout" },
    { id: 'weekly' as FitnessTab, icon: Target, label: 'Weekly Plan' },
    { id: 'progress' as FitnessTab, icon: BarChart3, label: 'Progress' },
    { id: 'coach' as FitnessTab, icon: Sparkles, label: 'Coach Chat' },
    { id: 'settings' as FitnessTab, icon: Settings, label: 'Settings' },
  ];

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
              <h1 className="text-sm font-bold tracking-wider uppercase font-mono text-[#F4F4F5]">PolySync</h1>
              <span className="text-[9px] font-bold font-mono text-[#00A3FF] px-1.5 py-0.5 bg-[#00A3FF]/10 border border-[#00A3FF]/30 rounded uppercase">
                AI Fitness Coach
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
        {activeTab === 'today' && (
          <WorkoutSession
            workout={todayWorkoutForSession}
            exerciseLogs={exerciseLogs}
            onSetComplete={handleSetComplete}
            onLogChange={handleLogChange}
            onStartRestTimer={handleStartRestTimer}
            onNextSet={handleNextSet}
            onSubmitWorkout={handleSubmitWorkout}
            onSubstitute={handleSubstitute}
          />
        )}

        {activeTab === 'weekly' && (
          <WeeklyPlanComponent
            plan={plan}
            onGenerate={generatePlan}
            onStartSession={handleStartSession}
            expandedDay={expandedDay}
            onToggleDay={setExpandedDay}
          />
        )}

        {activeTab === 'progress' && (
          <ProgressDashboard />
        )}

        {activeTab === 'coach' && (
          <CoachingChat
            profile={profile}
            currentPlanId={plan?.id}
            recentWorkoutIds={[]}
            recoveryScore={undefined}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsComponent
            profile={profile}
            onEditProfile={() => {}}
            onSignOut={async () => {
              await signOut(auth);
              setOnboarded(false);
              setProfile(null);
              setPlan(null);
            }}
            onDeleteData={async () => {
              if (!currentUser) return;
              try {
                await fetch('/api/fitness/delete-user-data', {
                  method: 'POST',
                  headers: { 'x-user-id': currentUser.uid },
                });
                await signOut(auth);
                setOnboarded(false);
                setProfile(null);
                setPlan(null);
              } catch (err) {
                console.error('Failed to delete data:', err);
              }
            }}
          />
        )}
      </div>

      {/* Footer disclaimer */}
      <div className="mt-4 text-xs text-[#71717A] text-center border-t border-[#27272A] pt-3">
        PolySync provides AI-generated fitness guidance. Always warm up properly and listen to your body.
        Consult a healthcare professional for injuries or medical conditions.
      </div>
    </div>
  );
}

// Remove the duplicate import that was at line 2 — we handle FitnessOnboarding inline
function FitnessOnboarding({ currentUser, onComplete }: { currentUser: User | null; onComplete: (p: FitnessProfile) => void }) {
  return (
    <div className="min-h-screen bg-[#0C0C0E] text-[#E4E4E7] flex flex-col items-center justify-center p-4 border-[10px] border-[#1A1A1E]">
      <AlertTriangle className="w-12 h-12 text-[#F59E0B] mb-4" />
      <h2 className="text-xl font-bold mb-2">Onboarding Required</h2>
      <p className="text-sm text-[#71717A] text-center max-w-md">
        Please complete your fitness profile to get personalized workout plans.
      </p>
      <button
        onClick={() => {}}
        className="mt-6 px-6 py-2.5 bg-[#00A3FF] text-white rounded-lg text-sm font-medium hover:bg-[#00A3FF]/90 transition"
      >
        Complete Onboarding
      </button>
    </div>
  );
}
