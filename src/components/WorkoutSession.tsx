import { useState, useEffect, useCallback, useRef } from 'react';
import { Check, Plus, RotateCcw, Info } from 'lucide-react';
import { EXERCISE_LIBRARY, EXERCISE_BY_ID } from '../ExerciseLibrary';
import { WorkoutExercise, ExerciseSet } from '../types';

interface WorkoutSessionProps {
  workout: { workoutName: string; focus: string; duration: number; exercises: WorkoutExercise[] } | null;
  exerciseLogs: Record<string, ExerciseSet[]>;
  onSetComplete: (exerciseId: string, setNumber: number) => void;
  onLogChange: (exerciseId: string, setIndex: number, data: Partial<ExerciseSet>) => void;
  onStartRestTimer: (seconds: number) => void;
  onNextSet: (exerciseId: string, setNumber: number) => void;
  onSubmitWorkout: (completed: boolean) => void;
  onSubstitute: (exerciseId: string) => void;
}

export function WorkoutSession({
  workout,
  exerciseLogs,
  onSetComplete,
  onLogChange,
  onStartRestTimer,
  onNextSet,
  onSubmitWorkout,
  onSubstitute,
}: WorkoutSessionProps) {
  const [expandedExercise, setExpandedExercise] = useState<string | null>(null);
  const [showSubstitutes, setShowSubstitutes] = useState<string | null>(null);
  const [filterText, setFilterText] = useState('');

  const filteredExercises = workout?.exercises.filter(ex =>
    ex.name.toLowerCase().includes(filterText.toLowerCase()) ||
    ex.primaryMuscles.some(m => m.toLowerCase().includes(filterText.toLowerCase()))
  ) ?? [];

  const toggleExpand = (exerciseId: string) => {
    setExpandedExercise(prev => prev === exerciseId ? null : exerciseId);
  };

  const getLogForSet = (exerciseId: string, setIndex: number) => {
    return exerciseLogs[exerciseId]?.[setIndex] ?? {};
  };

  if (!workout) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Info className="w-12 h-12 text-[#71717A] mb-4" />
        <h3 className="text-lg font-medium mb-2">No workout selected</h3>
        <p className="text-[#71717A] text-sm max-w-md">
          Select a workout from your weekly plan to start logging sets.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="bg-[#121215]/90 backdrop-blur-xl border border-[#27272A] rounded-xl p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex-1">
            <div className="text-xs text-[#71717A] uppercase tracking-wide">Today's Workout</div>
            <h2 className="text-xl font-bold mt-1">{workout.workoutName}</h2>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-sm text-[#A1A1AA]">{workout.focus}</span>
              <span className="text-xs text-[#71717A]">· {workout.duration} min</span>
              {workout.exercises.length > 0 && (
                <span className="text-xs text-[#71717A]">· {workout.exercises.length} exercises</span>
              )}
            </div>
          </div>
        </div>

        {/* Search/filter */}
        <div className="relative mb-3">
          <input
            type="text"
            placeholder="Filter exercises..."
            value={filterText}
            onChange={e => setFilterText(e.target.value)}
            className="w-full px-3 py-2 bg-[#1A1A1E] border border-[#27272A] rounded-lg text-sm text-[#E4E4E7] placeholder-[#71717A] focus:outline-none focus:border-[#00A3FF]/40"
          />
          <RotateCcw className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#71717A] cursor-pointer hover:text-[#E4E4E7]" onClick={() => setFilterText('')} />
        </div>
      </div>

      {/* Exercise list */}
      <div className="space-y-3">
        {filteredExercises.map((exercise, idx) => {
          const logs = exerciseLogs[exercise.exerciseId] ?? [] as ExerciseSet[];
          const isExpanded = expandedExercise === exercise.exerciseId;
          const completedSets = logs.filter(s => s.completed).length;
          const allComplete = completedSets >= exercise.prescribedSets;

          return (
            <div
              key={exercise.exerciseId}
              className="border border-[#27272A] rounded-lg overflow-hidden bg-[#16161A]"
            >
              {/* Exercise header */}
              <div
                className="flex items-center justify-between p-3 bg-[#1A1A1E] border-b border-[#27272A] cursor-pointer hover:bg-[#1F1F24] transition"
                onClick={() => toggleExpand(exercise.exerciseId)}
              >
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded bg-[#00A3FF]/20 flex items-center justify-center shrink-0">
                    <span className="text-[#00A3FF] text-xs font-bold">{idx + 1}</span>
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{exercise.name}</div>
                    <div className="text-xs text-[#71717A] mt-0.5">
                      {exercise.prescribedSets} sets · {exercise.prescribedReps} reps
                      {exercise.prescribedRestSeconds && ` · ${exercise.prescribedRestSeconds}s rest`}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-xs text-[#71717A]">
                    {completedSets}/{exercise.prescribedSets} ✅
                  </div>
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center transition ${
                    allComplete
                      ? 'bg-[#10B981]/20 text-[#10B981]'
                      : 'bg-[#27272A] text-[#71717A]'
                  }`}>
                    {allComplete ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                  </div>
                  <div className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                    <svg className="w-4 h-4 text-[#71717A]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Expanded content */}
              {isExpanded && (
                <div className="border-t border-[#27272A] p-3 space-y-3 animate-in fade-in duration-150">
                  {/* Muscle groups */}
                  <div className="flex items-center gap-2 text-xs text-[#71717A]">
                    <span className="font-medium text-[#A1A1AA]">Target:</span>
                    {exercise.primaryMuscles.join(', ')}
                    {exercise.secondaryMuscles.length > 0 && (
                      <>
                        <span className="text-[#3f3f46]">|</span>
                        <span>Secondary: {exercise.secondaryMuscles.join(', ')}</span>
                      </>
                    )}
                  </div>

                  {/* Sets */}
                  <div className="space-y-2">
                    {Array.from({ length: exercise.prescribedSets }, (_, i) => {
                      const log = logs[i] || {};
                      return (
                        <div key={i} className="flex items-center gap-2 p-2 bg-[#121215] rounded-lg border border-[#27272A]">
                          <div className="w-6 h-6 rounded-full bg-[#1A1A1E] flex items-center justify-center text-xs font-bold text-[#71717A] shrink-0">
                            {i + 1}
                          </div>
                          <div className="flex-1 grid grid-cols-3 gap-2">
                            <input
                              type="number"
                              placeholder="Reps"
                              value={log.reps ?? ''}
                              onChange={e => onLogChange(exercise.exerciseId, i, { reps: Number(e.target.value) || undefined })}
                              className="w-full px-2 py-1.5 bg-[#1A1A1E] border border-[#27272A] rounded text-sm text-[#E4E4E7] placeholder-[#71717A] text-center focus:outline-none focus:border-[#00A3FF]/40"
                            />
                            <input
                              type="number"
                              placeholder="Weight"
                              value={log.weight ?? ''}
                              onChange={e => onLogChange(exercise.exerciseId, i, { weight: Number(e.target.value) || undefined })}
                              className="w-full px-2 py-1.5 bg-[#1A1A1E] border border-[#27272A] rounded text-sm text-[#E4E4E7] placeholder-[#71717A] text-center focus:outline-none focus:border-[#00A3FF]/40"
                            />
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => onSetComplete(exercise.exerciseId, i)}
                                className={`w-7 h-7 rounded-full flex items-center justify-center transition text-xs ${
                                  log.completed
                                    ? 'bg-[#10B981]/20 text-[#10B981] border border-[#10B981]/30'
                                    : 'bg-[#1A1A1E] text-[#71717A] border border-[#27272A] hover:bg-[#27272A]'
                                }`}
                              >
                                {log.completed ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                              </button>
                              {log.rpe !== undefined && (
                                <input
                                  type="number"
                                  min="1"
                                  max="10"
                                  placeholder="RPE"
                                  value={log.rpe}
                                  onChange={e => onLogChange(exercise.exerciseId, i, { rpe: Number(e.target.value) || undefined })}
                                  className="w-14 px-1.5 py-1.5 bg-[#1A1A1E] border border-[#27272A] rounded text-xs text-[#E4E4E7] text-center focus:outline-none focus:border-[#00A3FF]/40"
                                />
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => onStartRestTimer(exercise.prescribedRestSeconds || 60)}
                            className="text-xs text-[#00A3FF] hover:bg-[#00A3FF]/10 px-2 py-1 rounded transition shrink-0"
                            title="Start rest timer"
                          >
                            Rest {exercise.prescribedRestSeconds || 60}s
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  {/* Notes */}
                  <textarea
                    placeholder="Exercise notes (form feel, pain, modifications...)"
                    className="w-full px-3 py-2 bg-[#1A1A1E] border border-[#27272A] rounded-lg text-sm text-[#E4E4E7] placeholder-[#71717A] resize-none focus:outline-none focus:border-[#00A3FF]/40 h-16"
                  />

                  {/* Substitution */}
                  <button
                    onClick={() => setShowSubstitutes(showSubstitutes === exercise.exerciseId ? null : exercise.exerciseId)}
                    className="text-xs text-[#00A3FF] hover:bg-[#00A3FF]/10 px-2 py-1 rounded transition w-full text-left font-medium"
                  >
                    {showSubstitutes === exercise.exerciseId ? 'Hide alternatives' : `Can't do this? See alternatives (${exercise.substitutions?.length || 0})`}
                  </button>

                  {showSubstitutes === exercise.exerciseId && (
                    <div className="bg-[#121215] border border-[#27272A] rounded-lg p-3 space-y-2 animate-in fade-in duration-150">
                      <div className="text-xs text-[#71717A] font-medium mb-1">Alternative exercises:</div>
                      {exercise.substitutions?.map(subId => {
                        const sub = EXERCISE_BY_ID[subId];
                        if (!sub) return null;
                        return (
                          <button
                            key={subId}
                            onClick={() => onSubstitute(exercise.exerciseId)}
                            className="w-full text-left p-2 rounded bg-[#1A1A1E] border border-[#27272A] hover:border-[#00A3FF]/30 transition text-sm"
                          >
                            <div className="font-medium text-[#E4E4E7]">{sub.name}</div>
                            <div className="text-xs text-[#71717A] mt-0.5">
                              {sub.primaryMuscles.join(', ')} · {sub.equipment.join(', ')}
                            </div>
                          </button>
                        );
                      })}
                      {(!exercise.substitutions || exercise.substitutions.length === 0) && (
                        <div className="text-xs text-[#71717A]">No alternatives available in the library.</div>
                      )}
                    </div>
                  )}

                  {/* Common mistakes */}
                  {exercise.commonMistakes && exercise.commonMistakes.length > 0 && (
                    <div className="bg-[#F59E0B]/5 border border-[#F59E0B]/20 rounded-lg p-3">
                      <div className="flex items-center gap-1.5 text-xs text-[#F59E0B] font-medium mb-1.5">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                        </svg>
                        Common mistakes to avoid
                      </div>
                      <ul className="text-xs text-[#A1A1AA] space-y-1 list-disc list-inside">
                        {exercise.commonMistakes.map((mistake, i) => (
                          <li key={i}>{mistake}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {filteredExercises.length === 0 && (
          <div className="text-center py-8 text-[#71717A] text-sm">
            No exercises match "{filterText}"
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 mt-4 pt-4 border-t border-[#27272A]">
        <button
          onClick={() => onSubmitWorkout(false)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-[#EF4444]/30 text-[#EF4444] hover:bg-[#EF4444]/10 transition text-sm font-medium"
        >
          <Pause className="w-4 h-4" />
          Skip Workout
        </button>
        <button
          onClick={() => onSubmitWorkout(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#10B981] text-white hover:bg-[#10B981]/90 transition text-sm font-medium"
        >
          <Check className="w-4 h-4" />
          Complete Workout
        </button>
      </div>

      <div className="mt-3 text-xs text-[#71717A] flex items-center gap-1 justify-center">
        <Info className="w-3.5 h-3.5" />
        Log your sets honestly — this data powers your plan adaptation and progress tracking.
      </div>
    </div>
  );
}
