import { useEffect, useState } from 'react';
import { WorkoutLogEntry } from '../types';

interface ProgressDashboardProps {
  userId: string;
}

interface DisplayWorkout {
  id: string;
  date: number;
  workoutName: string;
  focus: string;
  exercises: { exerciseId: string; name: string; sets: { weight: number; reps: number; completed: boolean }[] }[];
  duration: number;
  completed: boolean;
  rpe?: number;
  notes?: string;
}

export function ProgressDashboard({ userId }: ProgressDashboardProps) {
  const [workouts, setWorkouts] = useState<DisplayWorkout[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | 'all'>('30d');
  const [streak, setStreak] = useState(0);
  const [totalWorkouts, setTotalWorkouts] = useState(0);
  const [totalVolume, setTotalVolume] = useState(0);

  useEffect(() => {
    const fetchProgress = async () => {
      try {
        const [progRes, streakRes] = await Promise.all([
          fetch(`/api/fitness/progress?range=${timeRange}`, {
            headers: { 'x-user-id': userId },
          }),
          fetch('/api/fitness/streaks', {
            headers: { 'x-user-id': userId },
          }),
        ]);
        if (progRes.ok) {
          const prog = await progRes.json();
          setWorkouts(prog.recentWorkouts || []);
          setTotalWorkouts(prog.totalWorkouts || 0);
          setTotalVolume(prog.totalVolume || 0);
        }
        if (streakRes.ok) {
          const streakData = await streakRes.json();
          setStreak(streakData.currentStreak || 0);
        }
      } catch (err) {
        console.error('Failed to fetch progress:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchProgress();
  }, [userId, timeRange]);

  const filteredWorkouts = workouts.filter(w => {
    const cutoff = new Date();
    if (timeRange === '7d') cutoff.setDate(cutoff.getDate() - 7);
    else if (timeRange === '30d') cutoff.setDate(cutoff.getDate() - 30);
    return new Date(w.date) >= cutoff;
  });

  const volumeByDate = filteredWorkouts.reduce((acc, w) => {
    const key = new Date(w.date).toISOString().split('T')[0];
    const vol = w.exercises.reduce((s, e) => s + e.sets.reduce((ss, st) => ss + (st.weight * st.reps), 0), 0);
    acc[key] = (acc[key] || 0) + vol;
    return acc;
  }, {} as Record<string, number>);

  const chartData = Object.entries(volumeByDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, volume]) => ({ date, volume }))
    .slice(-14);

  const maxVolume = Math.max(...chartData.map(d => d.volume), 1);

  const exerciseBest = filteredWorkouts.reduce((acc, w) => {
    w.exercises.forEach(ex => {
      ex.sets.forEach(set => {
        if (!set.completed) return;
        const key = ex.exerciseId;
        if (!acc[key] || set.weight > acc[key].weight) {
          acc[key] = { name: ex.name, weight: set.weight, date: w.date, reps: set.reps };
        }
      });
    });
    return acc;
  }, {} as Record<string, { name: string; weight: number; date: number; reps: number }>);

  const bestExercises = Object.entries(exerciseBest)
    .sort(([, a], [, b]) => b.weight - a.weight)
    .slice(0, 10);

  const avgDuration = filteredWorkouts.length > 0
    ? Math.round(filteredWorkouts.reduce((sum, w) => sum + w.duration, 0) / filteredWorkouts.length)
    : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#27272A] border-t-[#00A3FF]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Workout History</h2>
        <div className="flex gap-1">
          {(['7d', '30d', 'all'] as const).map(range => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                timeRange === range
                  ? 'bg-[#00A3FF]/20 text-[#00A3FF] border border-[#00A3FF]/30'
                  : 'bg-[#1A1A20] text-[#71717A] border border-[#27272A] hover:border-[#3f3f46]'
              }`}
            >
              {range === '7d' ? '7 Days' : range === '30d' ? '30 Days' : 'All'}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-[#1A1A20] rounded-xl p-4 border border-[#27272A]">
          <div className="text-xs text-[#71717A] uppercase tracking-wide">Workouts</div>
          <div className="text-2xl font-bold text-[#E4E4E7] mt-1">{filteredWorkouts.length}</div>
          <div className="text-xs text-[#52525B] mt-0.5">
            {timeRange === '7d' ? 'this week' : timeRange === '30d' ? 'this month' : 'total'}
          </div>
        </div>
        <div className="bg-[#1A1A20] rounded-xl p-4 border border-[#27272A]">
          <div className="text-xs text-[#71717A] uppercase tracking-wide">Volume</div>
          <div className="text-2xl font-bold text-[#6366F1] mt-1">
            {totalVolume >= 1000 ? `${(totalVolume / 1000).toFixed(1)}K` : totalVolume}
          </div>
          <div className="text-xs text-[#52525B] mt-0.5">kg lifted</div>
        </div>
        <div className="bg-[#1A1A20] rounded-xl p-4 border border-[#27272A]">
          <div className="text-xs text-[#71717A] uppercase tracking-wide">Avg Duration</div>
          <div className="text-2xl font-bold text-[#22C55E] mt-1">{avgDuration}</div>
          <div className="text-xs text-[#52525B] mt-0.5">minutes</div>
        </div>
        <div className="bg-[#1A1A20] rounded-xl p-4 border border-[#27272A]">
          <div className="text-xs text-[#71717A] uppercase tracking-wide">Streak</div>
          <div className="text-2xl font-bold text-[#F59E0B] mt-1">{streak}</div>
          <div className="text-xs text-[#52525B] mt-0.5">days</div>
        </div>
      </div>

      {/* Volume trend chart */}
      <div className="bg-[#1A1A20] rounded-xl p-4 border border-[#27272A]">
        <h3 className="text-sm font-semibold text-[#E4E4E7] mb-4">Volume Trend</h3>
        <div className="flex items-end gap-1 h-32">
          {chartData.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-xs text-[#71717A]">
              No workout data yet
            </div>
          ) : (
            chartData.map((d, i) => (
              <div
                key={i}
                className="flex-1 rounded-t bg-[#00A3FF]/60"
                style={{ height: `${(d.volume / maxVolume) * 100}%`, minHeight: '4px' }}
                title={`${d.date}: ${d.volume}kg`}
              />
            ))
          )}
        </div>
        <div className="flex justify-between mt-2 text-xs text-[#71717A]">
          {chartData.length > 0 && (
            <>
              <span>{new Date(chartData[0].date).toLocaleDateString()}</span>
              <span>{new Date(chartData[chartData.length - 1].date).toLocaleDateString()}</span>
            </>
          )}
        </div>
      </div>

      {/* Best lifts */}
      {bestExercises.length > 0 && (
        <div className="bg-[#1A1A20] rounded-xl p-4 border border-[#27272A]">
          <h3 className="text-sm font-semibold text-[#E4E4E7] mb-4">Personal Bests</h3>
          <div className="space-y-2">
            {bestExercises.map(([id, ex], i) => (
              <div key={id} className="flex items-center justify-between py-2 border-b border-[#27272A] last:border-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[#71717A] w-4">{i + 1}.</span>
                  <span className="text-sm text-[#E4E4E7]">{ex.name}</span>
                </div>
                <div className="text-right">
                  <div className="text-sm font-mono font-bold text-[#00A3FF]">{ex.weight}<span className="text-xs text-[#71717A] ml-1">kg</span></div>
                  <div className="text-xs text-[#71717A]">
                    {ex.reps} reps · {new Date(ex.date).toLocaleDateString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent workouts list */}
      <div className="bg-[#1A1A20] rounded-xl p-4 border border-[#27272A]">
        <h3 className="text-sm font-semibold text-[#E4E4E7] mb-4">Recent Workouts</h3>
        {filteredWorkouts.length === 0 ? (
          <div className="text-center py-8 text-[#71717A] text-sm">
            No workouts logged yet. Complete a workout to see it here.
          </div>
        ) : (
          <div className="space-y-2">
            {filteredWorkouts.map(w => (
              <div key={w.id} className="flex items-center justify-between p-3 rounded-lg bg-[#121215] border border-[#27272A]">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-[#E4E4E7] truncate">{w.workoutName}</div>
                  <div className="text-xs text-[#71717A] mt-0.5">
                    {new Date(w.date).toLocaleDateString()} · {w.duration} min · {w.exercises.length} exercises
                    {w.focus ? ` · ${w.focus}` : ''}
                  </div>
                </div>
                <div className="ml-3">
                  <div className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    w.completed
                      ? 'bg-[#10B981]/20 text-[#10B981]'
                      : 'bg-[#EF4444]/20 text-[#EF4444]'
                  }`}>
                    {w.completed ? 'Completed' : 'Skipped'}
                  </div>
                  {w.rpe && (
                    <div className="text-xs text-[#71717A] mt-1">RPE {w.rpe}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
