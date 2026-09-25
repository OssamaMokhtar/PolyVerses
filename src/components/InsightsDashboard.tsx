import { useEffect, useState, type ReactNode } from 'react';
import { TrendingUp, TrendingDown, Award, Flame, Calendar, BarChart3, ArrowUp, ArrowDown, AlertTriangle } from 'lucide-react';

interface InsightsDashboardProps {
  userId: string;
}

interface InsightData {
  periodLabel: string;
  workoutsThisPeriod: number;
  workoutsLastPeriod: number;
  completionRate: number;
  completionRateLast: number;
  totalVolume: number;
  totalVolumeLast: number;
  avgRPE: number;
  avgRPELast: number;
  currentStreak: number;
  longestStreak: number;
  weeklyVolumeTrend: { week: string; volume: number }[];
  topExercises: { name: string; totalVolume: number; count: number }[];
  recoveryTrend: { date: string; score: number }[];
}

export function InsightsDashboard({ userId }: InsightsDashboardProps) {
  const [data, setData] = useState<InsightData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/fitness/insights', {
        headers: { 'x-user-id': userId },
        signal,
      });
      if (!res.ok) throw new Error('Failed to load insights');
      const json = await res.json();
      setData(json);
    } catch (err) {
      if (err instanceof CancelError) return;
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData(), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [userId]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#27272A] border-t-[#6366F1] mb-3" />
        <p className="text-sm text-[#71717A]">Loading your insights...</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="bg-[#121215]/90 backdrop-blur-xl border border-[#EF4444]/20 rounded-xl p-4">
        <div className="flex items-center gap-2 text-[#EF4444] text-sm font-medium mb-2">
          <AlertTriangle className="w-4 h-4" />
          Couldn't load insights
        </div>
        <p className="text-xs text-[#71717A] mb-3">{error}</p>
        <button onClick={handleRefresh} className="text-xs text-[#6366F1] hover:underline">
          Try again
        </button>
      </div>
    );
  }

  if (!data) return null;

  const workoutChange = data.workoutsThisPeriod - data.workoutsLastPeriod;
  const volumeChange = data.totalVolume - data.totalVolumeLast;
  const rpeChange = data.avgRPE - data.avgRPELast;
  const completionChange = data.completionRate - data.completionRateLast;

  const trendIcon = (change: number) => {
    if (change > 0) return <TrendingUp className="w-4 h-4 text-[#10B981]" />;
    if (change < 0) return <TrendingDown className="w-4 h-4 text-[#EF4444]" />;
    return <BarChart3 className="w-4 h-4 text-[#71717A]" />;
  };

  const trendClass = (change: number) => {
    if (change > 0) return 'text-[#10B981]';
    if (change < 0) return 'text-[#EF4444]';
    return 'text-[#71717A]';
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Award className="w-5 h-5 text-[#F59E0B]" />
          <h3 className="text-base font-semibold">Your Insights</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#71717A]">{data.periodLabel}</span>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-1.5 rounded-lg border border-[#27272A] hover:border-[#6366F1]/30 transition text-[#71717A] hover:text-[#6366F1] disabled:opacity-50"
            title="Refresh"
          >
            <svg className={refreshing ? 'animate-spin' : ''} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
          </button>
        </div>
      </div>

      {/* Streak banner */}
      <div className="bg-gradient-to-r from-[#F59E0B]/10 to-[#F59E0B]/5 border border-[#F59E0B]/20 rounded-xl p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#F59E0B]/20 flex items-center justify-center">
            <Flame className="w-5 h-5 text-[#F59E0B]" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold text-[#E4E4E7]">Current Streak</div>
            <div className="text-2xl font-bold text-[#F59E0B]">{data.currentStreak} days</div>
            <div className="text-xs text-[#71717A]">Personal best: {data.longestStreak} days</div>
          </div>
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 gap-3">
        <MetricCard
          icon={<Calendar className="w-4 h-4" />}
          label="Workouts"
          value={data.workoutsThisPeriod}
          change={workoutChange}
          unit="vs last period"
          trendIcon={trendIcon(workoutChange)}
          trendClass={trendClass(workoutChange)}
        />
        <MetricCard
          icon={<Award className="w-4 h-4" />}
          label="Completion Rate"
          value={`${Math.round(data.completionRate)}%`}
          change={completionChange}
          unit={`${Math.round(data.completionRateLast)}%`}
          trendIcon={trendIcon(completionChange)}
          trendClass={trendClass(completionChange)}
        />
        <MetricCard
          icon={<TrendingUp className="w-4 h-4" />}
          label="Total Volume"
          value={data.totalVolume >= 1000 ? `${(data.totalVolume / 1000).toFixed(1)}k kg` : `${data.totalVolume} kg`}
          change={volumeChange}
          unit={data.totalVolumeLast >= 1000 ? `${(data.totalVolumeLast / 1000).toFixed(1)}k kg` : `${data.totalVolumeLast} kg`}
          trendIcon={trendIcon(volumeChange)}
          trendClass={trendClass(volumeChange)}
        />
        <MetricCard
          icon={<Flame className="w-4 h-4" />}
          label="Avg RPE"
          value={data.avgRPE.toFixed(1)}
          change={rpeChange}
          unit={data.avgRPELast.toFixed(1)}
          trendIcon={trendIcon(rpeChange)}
          trendClass={trendClass(rpeChange)}
        />
      </div>

      {/* Weekly volume trend */}
      {data.weeklyVolumeTrend && data.weeklyVolumeTrend.length > 0 && (
        <div className="bg-[#121215]/90 backdrop-blur-xl border border-[#27272A] rounded-xl p-4">
          <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-[#00A3FF]" />
            Weekly Volume Trend
          </h4>
          <div className="flex items-end gap-2 h-24">
            {data.weeklyVolumeTrend.map((w, i) => {
              const maxVol = Math.max(...data.weeklyVolumeTrend.map(x => x.volume), 1);
              const height = (w.volume / maxVol) * 100;
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full bg-[#6366F1]/60 rounded-t transition-all hover:bg-[#6366F1] transition-colors" style={{ height: `${height}%` }} />
                  <div className="text-xs text-[#71717A]">{w.week}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Top exercises */}
      {data.topExercises && data.topExercises.length > 0 && (
        <div className="bg-[#121215]/90 backdrop-blur-xl border border-[#27272A] rounded-xl p-4">
          <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-[#F59E0B]" />
            Most Used Exercises
          </h4>
          <div className="space-y-2">
            {data.topExercises.slice(0, 5).map((ex, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-6 text-xs font-medium text-[#71717A] shrink-0">{i + 1}</div>
                <div className="flex-1">
                  <div className="text-sm text-[#E4E4E7]">{ex.name}</div>
                  <div className="text-xs text-[#71717A]">{ex.count} sessions · {ex.totalVolume >= 1000 ? `${(ex.totalVolume / 1000).toFixed(1)}k kg` : `${ex.totalVolume} kg`} total</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({ icon, label, value, change, unit, trendIcon: tIcon, trendClass: tClass }: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  change: number;
  unit: string;
  trendIcon: ReactNode;
  trendClass: string;
}) {
  const isPositive = change > 0;
  return (
    <div className="bg-[#121215]/90 backdrop-blur-xl border border-[#27272A] rounded-xl p-4">
      <div className="flex items-center gap-2 text-[#71717A] text-xs mb-2">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-xl font-bold text-[#E4E4E7] mb-1">{value}</div>
      <div className="flex items-center gap-1 text-xs">
        {isPositive && <ArrowUp className="w-3 h-3" />}
        {!isPositive && change < 0 && <ArrowDown className="w-3 h-3" />}
        <span className={`${tClass} ${!isPositive && change < 0 ? 'ml-1' : ''}`}>
          {change !== 0 ? `${isPositive ? '+' : ''}${change}` : '0'}
        </span>
        <span className="text-[#71717A] ml-1">{unit}</span>
        <div className="ml-auto">{tIcon}</div>
      </div>
    </div>
  );
}

class CancelError extends Error {
  constructor() {
    super('Cancelled');
    this.name = 'CancelError';
  }
}
