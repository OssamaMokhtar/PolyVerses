import { useState, useEffect, useRef } from 'react';
import { EXERCISE_BY_ID } from '../ExerciseLibrary';

interface WorkoutSessionProps {
  day: { dayIndex: number; date: string };
  workout: {
    workoutId: string;
    workoutName: string;
    focus: string;
    duration: number;
    exercises: ExerciseExercise[];
  };
  onComplete: (data: WorkoutCompletionData) => void;
  onSkip: () => void;
}

interface ExerciseExercise {
  exerciseId: string;
  exerciseName: string;
  targetMuscles: string[];
  equipment: string[];
  instructions: string;
  commonMistakes: string[];
  substitutionIds: string[];
  sets: number;
  reps: string;
  rest: number;
  rpeTarget: number;
  allowsSubstitution: boolean;
}

interface SetLog {
  setNumber: number;
  reps: string;
  weight: string;
  rpe: string;
  completed: boolean;
}

interface WorkoutCompletionData {
  workoutId: string;
  dayIndex: number;
  date: string;
  completedSets: SetLog[];
  totalVolume: number;
  rpe: number;
  duration: number;
  notes: string;
}

export function WorkoutSession({ day, workout, onComplete, onSkip }: WorkoutSessionProps) {
  const [activeExercise, setActiveExercise] = useState<number>(0);
  const [setLogs, setSetLogs] = useState<SetLog[]>(() =>
    Array.from({ length: workout.exercises[0]?.sets || 3 }, (_, i) => ({
      setNumber: i + 1,
      reps: '',
      weight: '',
      rpe: '',
      completed: false,
    }))
  );
  const [restTimer, setRestTimer] = useState<number>(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [exerciseDone, setExerciseDone] = useState<Set<number>>(new Set());
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const [notes, setNotes] = useState('');
  const [showSubstitution, setShowSubstitution] = useState<number | null>(null);

  const currentExercise = workout.exercises[activeExercise];
  if (!currentExercise) return null;

  const startRestTimer = () => {
    setRestTimer(currentExercise.rest / 1000);
    setTimerRunning(true);
  };

  useEffect(() => {
    if (!timerRunning) return;
    timerRef.current = setInterval(() => {
      setRestTimer(prev => {
        if (prev <= 1) {
          setTimerRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [timerRunning]);

  const toggleSet = (index: number) => {
    setSetLogs(prev => prev.map((s, i) =>
      i === index ? { ...s, completed: !s.completed } : s
    ));
  };

  const toggleExerciseDone = (exIndex: number) => {
    setExerciseDone(prev => {
      const next = new Set(prev);
      if (next.has(exIndex)) next.delete(exIndex);
      else next.add(exIndex);
      return next;
    });
  };

  const handleComplete = () => {
    const completedSets = setLogs.filter(s => s.completed);
    let totalVolume = 0;
    completedSets.forEach(s => {
      const reps = parseInt(s.reps) || 0;
      const weight = parseFloat(s.weight) || 0;
      totalVolume += reps * weight;
    });
    const avgRpe = completedSets.length > 0
      ? completedSets.reduce((sum, s) => sum + (parseInt(s.rpe) || 0), 0) / completedSets.length
      : 0;

    onComplete({
      workoutId: workout.workoutId,
      dayIndex: day.dayIndex,
      date: day.date,
      completedSets: completedSets.map(s => ({
        ...s,
        reps: s.reps || '0',
        weight: s.weight || '0',
        rpe: s.rpe || '0',
      })),
      totalVolume,
      rpe: Math.round(avgRpe),
      duration: workout.duration,
      notes,
    });
  };

  const handleSkip = () => {
    onSkip();
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const logData = (exIndex: number) => {
    const baseSets = workout.exercises[exIndex]?.sets || 3;
    return Array.from({ length: baseSets }, (_, i) => ({
      setNumber: i + 1,
      reps: '',
      weight: '',
      rpe: '',
      completed: false,
    }));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-[#E4E4E7]">{workout.workoutName}</h2>
          <p className="text-sm text-[#71717A]">{day.date} · {workout.focus} · ~{workout.duration} min</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleSkip}
            className="px-4 py-2 rounded-xl bg-[#27272A] text-[#71717A] hover:bg-[#3A3A40] hover:text-[#E4E4E7] transition-all text-sm font-medium"
          >
            Skip Day
          </button>
          <button
            onClick={handleComplete}
            className="px-5 py-2 rounded-xl bg-[#22C55E] text-white hover:bg-[#16A34A] transition-all text-sm font-medium shadow-lg shadow-[#22C55E]/20"
          >
            Complete Workout
          </button>
        </div>
      </div>

      {/* Exercise tabs */}
      <div className="flex flex-wrap gap-2">
        {workout.exercises.map((ex, idx) => (
          <button
            key={ex.exerciseId}
            onClick={() => { setActiveExercise(idx); setSetLogs(logData(idx)); }}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
              activeExercise === idx
                ? 'bg-[#6366F1] text-white shadow-lg'
                : exerciseDone.has(idx)
                  ? 'bg-[#22C55E]/20 text-[#22C55E]'
                  : 'bg-[#1A1A20] text-[#71717A] hover:bg-[#27272A]'
            }`}
          >
            {ex.exerciseName}
          </button>
        ))}
      </div>

      {/* Current exercise detail */}
      <div className="card p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-[#E4E4E7]">{currentExercise.exerciseName}</h3>
            <p className="text-sm text-[#71717A] mt-1">
              {currentExercise.targetMuscles.join(' · ')} · {currentExercise.equipment.join(', ')}
            </p>
          </div>
          <div className="text-right">
            <div className="text-sm text-[#71717A]">Target</div>
            <div className="text-lg font-bold text-[#E4E4E7]">{currentExercise.sets} × {currentExercise.reps}</div>
            <div className="text-sm text-[#71717A]">RPE {currentExercise.rpeTarget} · Rest {currentExercise.rest / 1000}s</div>
          </div>
        </div>

        {/* Instructions */}
        {currentExercise.instructions && (
          <div className="mb-3 p-3 bg-[#0D0D14] rounded-lg text-sm text-[#71717A] leading-relaxed">
            <span className="text-[#6366F1] font-medium">Instructions:</span> {currentExercise.instructions}
          </div>
        )}

        {/* Common mistakes */}
        {currentExercise.commonMistakes && currentExercise.commonMistakes.length > 0 && (
          <div className="mb-3 p-3 bg-[rgba(239,68,68,0.08)] rounded-lg text-sm text-[#EF4444] border border-[rgba(239,68,68,0.15)]">
            <span className="font-medium">Watch out:</span>
            <ul className="list-disc list-inside mt-1 space-y-0.5">
              {currentExercise.commonMistakes.map((m, i) => <li key={i}>{m}</li>)}
            </ul>
          </div>
        )}

        {/* Set logging table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#27272A]">
                <th className="text-left py-2 px-2 text-[#71717A] font-medium text-xs uppercase">Set</th>
                <th className="text-left py-2 px-2 text-[#71717A] font-medium text-xs uppercase">Reps</th>
                <th className="text-left py-2 px-2 text-[#71717A] font-medium text-xs uppercase">Weight</th>
                <th className="text-left py-2 px-2 text-[#71717A] font-medium text-xs uppercase">RPE</th>
                <th className="text-center py-2 px-2 text-[#71717A] font-medium text-xs uppercase">Done</th>
              </tr>
            </thead>
            <tbody>
              {setLogs.map((setItem, idx) => (
                <tr key={idx} className="border-b border-[#1A1A20]">
                  <td className="py-2 px-2 text-[#71717A] font-medium">{setItem.setNumber}</td>
                  <td className="py-2 px-2">
                    <input
                      type="text"
                      value={setItem.reps}
                      onChange={e => setSetLogs(prev => prev.map((s, i) => i === idx ? { ...s, reps: e.target.value } : s))}
                      placeholder=" reps"
                      className="w-20 bg-[#0D0D14] border border-[#27272A] rounded-lg px-2 py-1.5 text-center text-[#E4E4E7] text-sm focus:border-[#6366F1] focus:outline-none"
                    />
                  </td>
                  <td className="py-2 px-2">
                    <input
                      type="text"
                      value={setItem.weight}
                      onChange={e => setSetLogs(prev => prev.map((s, i) => i === idx ? { ...s, weight: e.target.value } : s))}
                      placeholder=" kg"
                      className="w-20 bg-[#0D0D14] border border-[#27272A] rounded-lg px-2 py-1.5 text-center text-[#E4E4E7] text-sm focus:border-[#6366F1] focus:outline-none"
                    />
                  </td>
                  <td className="py-2 px-2">
                    <input
                      type="text"
                      value={setItem.rpe}
                      onChange={e => setSetLogs(prev => prev.map((s, i) => i === idx ? { ...s, rpe: e.target.value } : s))}
                      placeholder=" RPE"
                      className="w-14 bg-[#0D0D14] border border-[#27272A] rounded-lg px-2 py-1.5 text-center text-[#E4E4E7] text-sm focus:border-[#6366F1] focus:outline-none"
                    />
                  </td>
                  <td className="py-2 px-2 text-center">
                    <button
                      onClick={() => toggleSet(idx)}
                      className={`w-8 h-8 rounded-full transition-all ${
                        setItem.completed ? 'bg-[#22C55E] text-white' : 'bg-[#27272A] text-[#71717A] hover:bg-[#3A3A40]'
                      }`}
                    >
                      {setItem.completed ? '✓' : ''}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Rest timer */}
        {restTimer > 0 && (
          <div className={`mt-4 p-4 rounded-xl text-center ${
            timerRunning
              ? 'bg-[#22C55E]/10 border border-[#22C55E]/30'
              : 'bg-[#1A1A20] border border-[#27272A]'
          }`}>
            <div className={`text-3xl font-bold ${timerRunning ? 'text-[#22C55E]' : 'text-[#E4E4E7]'}`}>
              {formatTime(restTimer)}
            </div>
            <div className="text-xs text-[#71717A] mt-1">Rest period</div>
            <button
              onClick={() => setTimerRunning(false)}
              className="mt-2 text-xs text-[#71717A] hover:text-[#E4E4E7] transition-colors"
            >
              {timerRunning ? 'Cancel rest' : 'Skip rest'}
            </button>
          </div>
        )}

        <button
          onClick={startRestTimer}
          className="mt-4 w-full py-3 rounded-xl bg-[#27272A] text-[#71717A] hover:bg-[#3A3A40] hover:text-[#E4E4E7] transition-all text-sm font-medium"
        >
          Start {currentExercise.rest / 1000}s Rest Timer
        </button>
      </div>

      {/* Substitution modal */}
      {showSubstitution !== null && workout.exercises[showSubstitution]?.allowsSubstitution && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#1A1A20] border border-[#27272A] rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <h3 className="text-lg font-bold text-[#E4E4E7] mb-4">Substitute {workout.exercises[showSubstitution]?.exerciseName}</h3>
            <p className="text-sm text-[#71717A] mb-4">Choose an alternative exercise for the same target muscles:</p>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {workout.exercises[showSubstitution]?.substitutionIds.map(subId => {
                const sub = EXERCISE_BY_ID[subId];
                if (!sub) return null;
                return (
                  <button
                    key={subId}
                    onClick={() => {
                      const newExercises = [...workout.exercises];
                      newExercises[showSubstitution] = {
                        ...newExercises[showSubstitution],
                        exerciseId: subId,
                        exerciseName: sub.name,
                        targetMuscles: sub.muscles,
                        equipment: sub.equipment,
                        instructions: sub.instructions || '',
                        commonMistakes: sub.commonMistakes || [],
                        substitutionIds: sub.substitutionIds || [],
                        sets: newExercises[showSubstitution].sets,
                        reps: newExercises[showSubstitution].reps,
                        rest: newExercises[showSubstitution].rest,
                        rpeTarget: newExercises[showSubstitution].rpeTarget,
                        allowsSubstitution: newExercises[showSubstitution].allowsSubstitution,
                      };
                      // This would require re-render with new workout — for MVP just close
                      setShowSubstitution(null);
                    }}
                    className="w-full text-left px-4 py-3 rounded-xl bg-[#0D0D14] border border-[#27272A] hover:border-[#6366F1] transition-all text-sm"
                  >
                    <div className="font-medium text-[#E4E4E7]">{sub.name}</div>
                    <div className="text-xs text-[#71717A] mt-0.5">{sub.muscles.join(' · ')}</div>
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => setShowSubstitution(null)}
              className="mt-4 w-full py-2 rounded-xl bg-[#27272A] text-[#71717A] hover:bg-[#3A3A40] text-sm font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Exercise action buttons */}
      <div className="flex gap-3">
        {currentExercise.allowsSubstitution && (
          <button
            onClick={() => setShowSubstitution(activeExercise)}
            className="flex-1 py-3 rounded-xl bg-[#1A1A20] border border-[#27272A] text-[#71717A] hover:border-[#6366F1] hover:text-[#6366F1] transition-all text-sm font-medium"
          >
            🔄 Substitute Exercise
          </button>
        )}
        <button
          onClick={() => toggleExerciseDone(activeExercise)}
          className={`flex-1 py-3 rounded-xl text-sm font-medium transition-all ${
            exerciseDone.has(activeExercise)
              ? 'bg-[#22C55E]/20 text-[#22C55E] border border-[#22C55E]/30'
              : 'bg-[#27272A] text-[#71717A] hover:bg-[#3A3A40] hover:text-[#E4E4E7]'
          }`}
        >
          {exerciseDone.has(activeExercise) ? '✓ Marked Done' : 'Mark Exercise Done'}
        </button>
      </div>

      {/* Notes */}
      <div className="mt-4">
        <label className="text-sm text-[#71717A] font-medium block mb-2">Workout Notes (optional)</label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="How did this workout feel? Any pain, PRs, or observations..."
          className="w-full bg-[#0D0D14] border border-[#27272A] rounded-xl px-4 py-3 text-sm text-[#E4E4E7] placeholder-[#52525B] focus:border-[#6366F1] focus:outline-none resize-none h-20"
        />
      </div>
    </div>
  );
}
