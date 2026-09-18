import { useState, useEffect } from 'react';
import { BarChart3, TrendingUp, Calendar, Flame, Dumbbell } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

interface WorkoutSummary {
  totalWorkouts: number;
  totalVolume: number;
  avgRpe: number;
  currentStreak: number;
  longestStreak: number;
  workoutsByWeek: { week: string; count: number }[];
  topExercises: { name: string; totalSets: number; totalReps: number; totalWeight: number }[];
  volumeByMuscle: Record<string, number>;
}

export function ProgressDashboard() {
  const [summary, setSummary] = useState<WorkoutSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const { currentUser } = useAuth();

  useEffect(() => {
    if (!currentUser) { setLoading(false); return; }
    fetchProgress();
  }, [currentUser]);

  const fetchProgress = async () => {
    try {
      const res = await fetch('/api/fitness/progress', {
        headers: { 'x-user-id': currentUser!.uid }
      });
      if (res.ok) {
        const data = await res.json();
        setSummary(data.summary);
      }
    } catch (err) {
      console.error('Failed to fetch progress:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-[#00A3FF] border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-sm text-[#71717A]">Loading progress...</p>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <BarChart3 className="w-12 h-12 text-[#71717A] mb-4" />
        <h3 className="text-lg font-medium mb-2">No progress yet</h3>
        <p className="text-[#71717A] text-sm max-w-md mb-4">
          Complete your first workout to start seeing your progress here.
        </p>
        <div className="flex items-center gap-2 text-xs text-[#3f3f46]">
          <Dumbbell className="w-3.5 h-3.5" />
          <span>Your workout history will appear here</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col space-y-4">
      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          icon={<TrendingUp className="w-4 h-4" />}
          label="Total Workouts"
          value={summary.totalWorkouts}
          subtext="All time"
          color="blue"
        />
        <StatCard
          icon={<Dumbbell className="w-4 h-4" />}
          label="Total Volume"
          value={formatVolume(summary.totalVolume)}
          subtext="Sets × Reps × Weight"
          color="green"
        />
        <StatCard
          icon={<Flame className="w-4 h-4" />}
          label="Current Streak"
          value={`${summary.currentStreak} days`}
          subtext={`Best: ${summary.longestStreak} days`}
          color="orange"
        />
        <StatCard
          icon={<BarChart3 className="w-4 h-4" />}
          label="Avg RPE"
          value={summary.avgRpe > 0 ? summary.avgRpe.toFixed(1) : '—'}
          subtext="Rate of Perceived Exertion"
          color="purple"
        />
      </div>

      {/* Workouts this week */}
      <div className="bg-[#121215]/90 backdrop-blur-xl border border-[#27272A] rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Calendar className="w-4 h-4 text-[#00A3FF]" />
          <h3 className="text-sm font-semibold">This Week</h3>
        </div>
        {summary.workoutsByWeek.length > 0 ? (
          <div className="space-y-2">
            {summary.workoutsByWeek.map((week, idx) => (
              <div key={idx} className="flex items-center justify-between text-sm">
                <span className="text-[#A1A1AA]">{week.week}</span>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-[#1A1A1E] rounded-full overflow-hidden max-w-[160px]">
                    <div
                      className="h-full bg-[#00A3FF] rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, (week.count / 7) * 100)}%` }}
                    />
                  </div>
                  <span className="text-[#E4E4E7] font-medium w-6 text-right">{week.count}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-[#71717A] text-center py-4">
            No workouts logged this week yet.
          </div>
        )}
      </div>

      {/* Top exercises */}
      {summary.topExercises && summary.topExercises.length > 0 && (
        <div className="bg-[#121215]/90 backdrop-blur-xl border border-[#27272A] rounded-xl p-4">
          <h3 className="text-sm font-semibold mb-3">Top Exercises</h3>
          <div className="space-y-2">
            {summary.topExercises.slice(0, 5).map((ex, idx) => (
              <div key={idx} className="flex items-center justify-between py-2 border-b border-[#27272A] last:border-0">
                <div className="flex items-center gap-3">
                  <span className="w-5 text-xs text-[#71717A] font-medium text-center">#{idx + 1}</span>
                  <span className="text-sm text-[#E4E4E7] truncate max-w-[160px]">{ex.name}</span>
                </div>
                <div className="text-xs text-[#71717A] text-right">
                  <div>{ex.totalSets} sets</div>
                  <div>{ex.totalReps} reps</div>
                  {ex.totalWeight > 0 && <div className="text-[#A1A1AA]">{formatWeight(ex.totalWeight)}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-3 text-xs text-[#71717A] flex items-center gap-1 justify-center">
        <BarChart3 className="w-3.5 h-3.5" />
        Progress updates after each completed workout.
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, subtext, color }: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  subtext: string;
  color: 'blue' | 'green' | 'orange' | 'purple';
}) {
  const colorMap = {
    blue: 'text-[#00A3FF] bg-[#00A3FF]/10 border-[#00A3FF]/20',
    green: 'text-[#10B981] bg-[#10B981]/10 border-[#10B981]/20',
    orange: 'text-[#F59E0B] bg-[#F59E0B]/10 border-[#F59E0B]/20',
    purple: 'text-[#8B5CF6] bg-[#8B5CF6]/10 border-[#8B5CF6]/20',
  };

  return (
    <div className="bg-[#121215]/90 backdrop-blur-xl border border-[#27272A] rounded-xl p-4">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${colorMap[color]}`}>
        {icon}
      </div>
      <div className="text-2xl font-bold text-[#F4F4F5]">{value}</div>
      <div className="text-xs text-[#A1A1AA] mt-0.5">{label}</div>
      <div className="text-[11px] text-[#52525B] mt-0.5">{subtext}</div>
    </div>
  );
}

function formatVolume(vol: number): string {
  if (vol >= 1000000) return `${(vol / 1000000).toFixed(1)}M`;
  if (vol >= 1000) return `${(vol / 1000).toFixed(1)}K`;
  return vol.toString();
}

function formatWeight(w: number): string {
  if (w >= 1000) return `${(w / 1000).toFixed(1)}K kg`;
  return `${w} kg`;
}
