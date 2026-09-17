import { useState, useEffect, useRef } from 'react';

interface ProgressDashboardProps {
  workoutLogs: WorkoutLogData[];
  loading?: boolean;
}

interface WorkoutLogData {
  workoutId: string;
  date: string;
  workoutName: string;
  focus: string;
  completedSets: CompletedSet[];
  totalVolume: number;
  duration: number;
  rpe: number;
  notes: string;
}

interface CompletedSet {
  exerciseId: string;
  exerciseName: string;
  setNumber: number;
  reps: number;
  weight: number;
  rpe: number;
}

export function ProgressDashboard({ workoutLogs, loading }: ProgressDashboardProps) {
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | 'all'>('30d');

  const filteredLogs = workoutLogs.filter(log => {
    const logDate = new Date(log.date + 'T00:00:00');
    const cutoff = new Date();
    if (timeRange === '7d') { cutoff.setDate(cutoff.getDate() - 7); }
    else if (timeRange === '30d') { cutoff.setDate(cutoff.getDate() - 30); }
    return logDate >= cutoff;
  });

  // Volume trend data for chart
  const volumeByDate = filteredLogs.reduce((acc, log) => {
    const key = log.date;
    acc[key] = (acc[key] || 0) + log.totalVolume;
    return acc;
  }, {} as Record<string, number>);

  const chartData = Object.entries(volumeByDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, volume]) => ({ date, volume }))
    .slice(-14);

  const maxVolume = Math.max(...chartData.map(d => d.volume), 1);

  // Exercise strength progress — track best weight per exercise
  const exerciseBest = filteredLogs.reduce((acc, log) => {
    log.completedSets.forEach(set => {
      const key = set.exerciseId;
      if (!acc[key] || set.weight > acc[key].weight) {
        acc[key] = { exerciseName: set.exerciseName, weight: set.weight, date: log.date, reps: set.reps };
      }
    });
    return acc;
  }, {} as Record<string, { exerciseName: string; weight: number; date: string; reps: number }>);

  const bestExercises = Object.entries(exerciseBest)
    .sort(([, a], [, b]) => b.weight - a.weight)
    .slice(0, 10);

  const totalWorkouts = filteredLogs.length;
  const totalVolumeAll = filteredLogs.reduce((sum, log) => sum + log.totalVolume, 0);
  const avgDuration = filteredLogs.length > 0
    ? Math.round(filteredLogs.reduce((sum, log) => sum + log.duration, 0) / filteredLogs.length)
    : 0;
  const streak = calculateStreak(filteredLogs);

  // Weekly frequency
  const weekFrequency = getWeekFrequency(filteredLogs);

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-[#1A1A20] rounded-xl p-4 border border-[#27272A]">
          <div className="text-xs text-[#71717A] uppercase tracking-wide">Workouts</div>
          <div className="text-2xl font-bold text-[#E4E4E7] mt-1">{totalWorkouts}</div>
          <div className="text-xs text-[#52525B] mt-0.5">
            {timeRange === '7d' ? 'last 7 days' : timeRange === '30d' ? 'last 30 days' : 'all time'}
          </div>
        </div>
        <div className="bg-[#1A1A20] rounded-xl p-4 border border-[#27272A]">
          <div className="text-xs text-[#71717A] uppercase tracking-wide">Volume</div>
          <div className="text-2xl font-bold text-[#6366F1] mt-1">
            {totalVolumeAll >= 1000 ? `${(totalVolumeAll / 1000).toFixed(1)}K` : totalVolumeAll}
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
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-[#E4E4E7]">Volume Trend</h3>
          <div className="flex gap-2">
            {(['7d', '30d', 'all'] as const).map(range => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                  timeRange === range
                    ? 'bg-[#6366F1] text-white'
                    : 'bg-[#0D0D14] text-[#71717A] hover:bg-[#27272A]'
                }`}
              >
                {range === '7d' ? '7D' : range === '30d' ? '30D' : 'ALL'}
              </button>
            ))}
          </div>
        </div>

        {chartData.length > 0 ? (
          <div className="flex items-end gap-1 h-40">
            {chartData.map((point, idx) => {
              const height = (point.volume / maxVolume) * 100;
              const isLatest = idx === chartData.length - 1;
              return (
                <div
                  key={idx}
                  className="flex-1 flex flex-col items-center justify-end group"
                >
                  <div
                    className={`w-full rounded-t-sm transition-all ${
                      isLatest ? 'bg-[#6366F1]' : 'bg-[#27272A] hover:bg-[#3A3A40]'
                    }`}
                    style={{ height: `${Math.max(height, 4)}%` }}
                  />
                  <div className="text-xs text-[#71717A] mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {point.date}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="h-40 flex items-center justify-center text-[#71717A] text-sm">
            No workout data for this period
          </div>
        )}
      </div>

      {/* Exercise strength progress */}
      <div className="bg-[#1A1A20] rounded-xl p-4 border border-[#27272A]">
        <h3 className="text-sm font-semibold text-[#E4E4E7] mb-4">Strength Progress (Best Lifts)</h3>
        {bestExercises.length > 0 ? (
          <div className="space-y-2">
            {bestExercises.map(([exId, data]) => (
              <div
                key={exId}
                className="flex items-center justify-between p-3 rounded-lg bg-[#0D0D14] border border-[#27272A]"
              >
                <div>
                  <div className="text-sm font-medium text-[#E4E4E7]">{data.exerciseName}</div>
                  <div className="text-xs text-[#71717A] mt-0.5">{data.reps} reps · {data.date}</div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-[#22C55E]">{data.weight}</div>
                  <div className="text-xs text-[#71717A]">kg</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6 text-[#71717A] text-sm">
            Log some workouts to see your strength progress
          </div>
        )}
      </div>

      {/* Weekly frequency */}
      <div className="bg-[#1A1A20] rounded-xl p-4 border border-[#27272A]">
        <h3 className="text-sm font-semibold text-[#E4E4E7] mb-3">Weekly Frequency</h3>
        <div className="flex items-end gap-1.5 h-24">
          {weekFrequency.map((count, dayIdx) => {
            const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
            const maxCount = Math.max(...weekFrequency, 1);
            const height = (count / maxCount) * 100;
            return (
              <div key={dayIdx} className="flex-1 flex flex-col items-center justify-end">
                <div
                  className={`w-full rounded-t-sm transition-all ${
                    count > 0 ? 'bg-[#22C55E]' : 'bg-[#27272A]'
                  }`}
                  style={{ height: `${Math.max(height, count > 0 ? 8 : 4)}%` }}
                />
                <div className="text-xs text-[#71717A] mt-2">{dayNames[dayIdx]}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent workouts list */}
      <div className="bg-[#1A1A20] rounded-xl p-4 border border-[#27272A]">
        <h3 className="text-sm font-semibold text-[#E4E4E7] mb-3">Recent Workouts</h3>
        {filteredLogs.length > 0 ? (
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {filteredLogs.slice(0, 10).map(log => (
              <div key={log.workoutId} className="flex items-center justify-between p-3 rounded-lg bg-[#0D0D14] border border-[#27272A]">
                <div>
                  <div className="text-sm font-medium text-[#E4E4E7]">{log.workoutName}</div>
                  <div className="text-xs text-[#71717A] mt-0.5">{log.date} · {log.focus}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-[#22C55E]">{log.totalVolume}kg</div>
                  <div className="text-xs text-[#71717A]">{log.completedSets.length} sets · {log.duration}min</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6 text-[#71717A] text-sm">
            No workouts logged yet
          </div>
        )}
      </div>
    </div>
  );
}

function calculateStreak(logs: WorkoutLogData[]): number {
  if (logs.length === 0) return 0;
  const dates = logs.map(l => l.date).sort().reverse();
  let streak = 1;
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  if (dates[0] !== today && dates[0] !== yesterday) return 0;

  for (let i = 1; i < dates.length; i++) {
    const prev = new Date(dates[i - 1] + 'T00:00:00');
    const curr = new Date(dates[i] + 'T00:00:00');
    const diff = (prev.getTime() - curr.getTime()) / 86400000;
    if (diff === 1) streak++;
    else break;
  }
  return streak;
}

function getWeekFrequency(logs: WorkoutLogData[]): number[] {
  const freq = [0, 0, 0, 0, 0, 0, 0]; // Mon-Sun
  const today = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - ((today.getDay() + 6) % 7) + i);
    const dateStr = d.toISOString().split('T')[0];
    freq[i] = logs.filter(l => l.date === dateStr).length;
  }
  return freq;
}
