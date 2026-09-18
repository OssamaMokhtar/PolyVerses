import { Target, Dumbbell, Play, ChevronUp, ChevronDown } from 'lucide-react';
import { PlanDay, PlanWorkout } from '../types';

interface WeeklyPlanProps {
  plan: {
    id: string;
    weekNumber: number;
    startDate: number;
    version: number;
    days: PlanDay[];
  } | null;
  onGenerate: () => void;
  onStartSession: (dayIndex: number) => void;
  expandedDay: number | null;
  onToggleDay: (dayIndex: number) => void;
}

export function WeeklyPlan({ plan, onGenerate, onStartSession, expandedDay, onToggleDay }: WeeklyPlanProps) {
  if (!plan) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Target className="w-12 h-12 text-[#71717A] mb-4" />
        <h3 className="text-lg font-medium mb-2">No plan yet</h3>
        <p className="text-[#71717A] text-sm max-w-md mb-4">
          Generate your first weekly workout plan to see it here.
        </p>
        <button
          onClick={onGenerate}
          className="px-4 py-2 bg-[#00A3FF] text-white rounded-lg text-sm font-medium hover:bg-[#00A3FF]/90 transition"
        >
          Generate My Plan
        </button>
      </div>
    );
  }

  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const fullLabels = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const today = new Date();
  const todayIndex = today.getDay() === 0 ? 6 : today.getDay() - 1;

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="bg-[#121215]/90 backdrop-blur-xl border border-[#27272A] rounded-xl p-4 mb-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">Weekly Plan</h2>
            <div className="text-xs text-[#71717A] mt-0.5">
              Week of {new Date(plan.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              · Week {plan.weekNumber} · Version {plan.version}
            </div>
          </div>
          <button
            onClick={onGenerate}
            className="text-xs text-[#00A3FF] hover:bg-[#00A3FF]/10 px-3 py-1.5 rounded-lg transition font-medium"
          >
            Regenerate
          </button>
        </div>

        {/* Day grid */}
        <div className="grid grid-cols-7 gap-2">
          {plan.days.map((day, idx) => {
            const isExpanded = expandedDay === idx;
            const isToday = day.dayIndex === todayIndex;
            const workoutCount = day.workouts.length;

            const workout = day.workouts[0];

            return (
              <div
                key={idx}
                onClick={() => onToggleDay(idx)}
                className={`relative rounded-lg border p-3 text-center cursor-pointer transition-all ${
                  isExpanded
                    ? 'bg-[#00A3FF]/10 border-[#00A3FF]/30 shadow-sm'
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
                <div className="text-[10px] mb-1 text-[#52525B] tracking-wide">
                  {fullLabels[idx].slice(0, 3)}
                </div>
                {isExpanded ? (
                  <ChevronUp className="w-4 h-4 text-[#00A3FF] mx-auto" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-[#71717A] mx-auto" />
                )}
                {isExpanded && workout && (
                  <div className="mt-2 text-left px-1">
                    <div className="flex items-center gap-1.5">
                      <Play className="w-3 h-3 text-[#00A3FF] shrink-0" />
                      <span className="text-xs font-medium text-[#E4E4E7]">{workout.name}</span>
                    </div>
                    <div className="text-[11px] text-[#71717A] mt-0.5 pl-4">
                      {workout.focus} · {workout.estimatedDuration}min · {workout.mainExercises.length} exercises
                    </div>
                    {idx === todayIndex && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onStartSession(idx); }}
                        className="mt-2 text-xs bg-[#10B981]/10 text-[#10B981] border border-[#10B981]/30 rounded py-1 px-2 hover:bg-[#10B981]/20 transition font-medium"
                      >
                        Start Workout →
                      </button>
                    )}
                  </div>
                )}
                {!isExpanded && workoutCount > 0 && (
                  <div className="mt-1.5 text-[11px] text-[#A1A1AA]">
                    {workoutCount} workout{workoutCount > 1 ? 's' : ''}
                  </div>
                )}
                {!isExpanded && workoutCount === 0 && (
                  <div className="mt-1.5 text-[11px] text-[#3f3f46]">Rest day</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-[#71717A]">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-[#00A3FF]/5 border border-[#00A3FF]/20" />
          <span>Today</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-[#16161A] border border-[#27272A]" />
          <span>Other days</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-[#10B981]/5 border border-[#10B981]/30" />
          <span>Completed</span>
        </div>
      </div>

      <div className="mt-3 text-xs text-[#71717A] flex items-center gap-1 justify-center">
        <Target className="w-3.5 h-3.5" />
        Tap a day to expand. Start today's workout to begin logging.
      </div>
    </div>
  );
}
