import { useState } from 'react';
import { EXERCISE_LIBRARY } from '../ExerciseLibrary';

interface WeeklyPlanProps {
  plan: {
    weekNumber: number;
    startDate: string;
    endDate: string;
    days: DayData[];
    version: number;
  } | null;
  onStartWorkout: (day: DayData) => void;
  loading?: boolean;
}

interface DayData {
  dayIndex: number;
  date: string;
  workouts: WorkoutPreview[];
  recoveryScore?: number;
  recommendation?: string;
}

interface WorkoutPreview {
  workoutId: string;
  workoutName: string;
  focus: string;
  duration: number;
  exerciseCount: number;
}

export function WeeklyPlan({ plan, onStartWorkout, loading }: WeeklyPlanProps) {
  const getDayName = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-[#71717A]">Loading your weekly plan...</div>
      </div>
    );
  }

  if (!plan || plan.days.length === 0) {
    return (
      <div className="py-20 text-center">
        <div className="text-4xl mb-4">🏋️</div>
        <h3 className="text-xl font-bold text-[#E4E4E7] mb-2">No Plan Yet</h3>
        <p className="text-[#71717A] max-w-md mx-auto">
          Complete your onboarding profile and we'll generate a personalized weekly workout plan for you.
        </p>
      </div>
    );
  }

  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="space-y-6">
      {/* Plan header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-[#E4E4E7]">Your Weekly Plan</h2>
          <p className="text-sm text-[#71717A]">
            Week {plan.weekNumber} · {getDayName(plan.startDate)} – {getDayName(plan.endDate)}
          </p>
        </div>
        <div className="text-xs text-[#71717A] bg-[#0D0D14] px-3 py-1.5 rounded-lg border border-[#27272A]">
          Version {plan.version}
        </div>
      </div>

      {/* 7-day grid */}
      <div className="grid grid-cols-7 gap-2">
        {plan.days.map((day, idx) => {
          const isToday = day.date === today;
          const hasWorkout = day.workouts.length > 0;
          const isPast = day.date < today;
          const isFuture = day.date > today;

          return (
            <div
              key={day.dayIndex}
              className={`relative rounded-xl p-3 ${
                isToday
                  ? 'bg-[#6366F1]/15 border-2 border-[#6366F1]'
                  : isPast
                    ? 'bg-[#0D0D14] border border-[#27272A]/50 opacity-60'
                    : 'bg-[#1A1A20] border border-[#27272A]'
              }`}
            >
              {isToday && (
                <div className="absolute -top-2 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-[#6366F1] text-white text-xs rounded-full font-medium whitespace-nowrap">
                  TODAY
                </div>
              )}

              <div className="text-xs text-[#71717A] font-medium mb-1 truncate">
                {getDayName(day.date).split(',')[0]}
              </div>
              <div className="text-xs text-[#52525B] mb-2">
                {new Date(day.date + 'T00:00:00').getDate()}
              </div>

              {hasWorkout ? (
                <div className="space-y-1.5">
                  {day.workouts.slice(0, 2).map(w => (
                    <div
                      key={w.workoutId}
                      className="text-xs bg-[#0D0D14] rounded-lg px-2 py-1.5 truncate cursor-pointer hover:bg-[#27272A] transition-colors"
                      onClick={() => onStartWorkout(day)}
                    >
                      <span className="text-[#E4E4E7] font-medium">{w.workoutName}</span>
                      <span className="text-[#52525B] ml-1">{w.duration}min</span>
                    </div>
                  ))}
                  {day.workouts.length > 2 && (
                    <div className="text-xs text-[#71717A] text-center pt-1">
                      +{day.workouts.length - 2} more
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-xs text-[#52525B] text-center py-2 italic">
                  {isFuture ? 'Rest day' : 'No workout'}
                </div>
              )}

              {/* Recovery badge */}
              {day.recoveryScore !== undefined && (
                <div className={`mt-2 text-xs font-medium ${
                  day.recoveryScore >= 75 ? 'text-[#22C55E]' :
                  day.recoveryScore >= 50 ? 'text-[#F59E0B]' :
                  'text-[#EF4444]'
                }`}>
                  Recovery: {day.recoveryScore}/100
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-[#71717A] pt-2 border-t border-[#27272A]">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-[#6366F1]/15 border border-[#6366F1]"></div>
          <span>Today</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-[#1A1A20] border border-[#27272A]"></div>
          <span>Upcoming</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-[#0D0D14] border border-[#27272A]/50"></div>
          <span>Past</span>
        </div>
      </div>

      {/* Week summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-[#1A1A20] rounded-xl p-3 border border-[#27272A]">
          <div className="text-xs text-[#71717A]">Total Workouts</div>
          <div className="text-lg font-bold text-[#E4E4E7]">{plan.days.filter(d => d.workouts.length > 0).length}</div>
        </div>
        <div className="bg-[#1A1A20] rounded-xl p-3 border border-[#27272A]">
          <div className="text-xs text-[#71717A]">Total Duration</div>
          <div className="text-lg font-bold text-[#E4E4E7]">
            {Math.round(plan.days.reduce((sum, d) => sum + (d.workouts.reduce((s, w) => s + w.duration, 0) || 0), 0))} min
          </div>
        </div>
        <div className="bg-[#1A1A20] rounded-xl p-3 border border-[#27272A]">
          <div className="text-xs text-[#71717A]">Exercises</div>
          <div className="text-lg font-bold text-[#E4E4E7]">
            {plan.days.reduce((sum, d) => sum + d.workouts.reduce((s, w) => s + w.exerciseCount, 0), 0)}
          </div>
        </div>
      </div>

      {/* Empty state for week with no workouts */}
      {plan.days.every(d => d.workouts.length === 0) && (
        <div className="py-8 text-center">
          <p className="text-[#71717A]">Your plan is being generated. Check back soon!</p>
        </div>
      )}
    </div>
  );
}
