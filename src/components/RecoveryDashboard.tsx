import React, { useState, useEffect } from 'react';
import { Activity, Heart, Moon, Zap, TrendingDown, TrendingUp, AlertTriangle, Check } from 'lucide-react';
import { WearableDataPoint, RecoveryAssessment } from '../types';
import { auth, db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';

interface RecoveryDashboardProps {
  userId: string;
}

export function RecoveryDashboard({ userId }: RecoveryDashboardProps) {
  const [loading, setLoading] = useState(true);
  const [wearableData, setWearableData] = useState<WearableDataPoint[]>([]);
  const [assessment, setAssessment] = useState<RecoveryAssessment | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchRecovery = async () => {
      try {
        const res = await fetch('/api/fitness/recovery', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
          body: JSON.stringify({ wearableData: [] }),
        });
        if (res.ok) {
          const data = await res.json();
          setAssessment(data.assessment || null);
        }
        // Also fetch wearable data
        const wearableRef = doc(db, 'users', userId, 'wearableData', 'current');
        const wearableSnap = await getDoc(wearableRef);
        if (wearableSnap.exists()) {
          setWearableData(wearableSnap.data().points || []);
        }
      } catch (err) {
        setError('Failed to load recovery data');
      } finally {
        setLoading(false);
      }
    };
    fetchRecovery();
  }, [userId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#27272A] border-t-[#00A3FF]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-[#121215]/90 backdrop-blur-xl border border-[#27272A] rounded-xl p-4">
        <div className="text-red-400 text-sm">{error}</div>
      </div>
    );
  }

  const score = assessment?.recoveryScore ?? 50;
  const recommendation = assessment?.recommendation ?? 'train_normal';

  const getScoreColor = (s: number) => {
    if (s >= 70) return 'text-[#10B981]';
    if (s >= 40) return 'text-[#F59E0B]';
    return 'text-[#EF4444]';
  };

  const getScoreBg = (s: number) => {
    if (s >= 70) return 'bg-[#10B981]/20';
    if (s >= 40) return 'bg-[#F59E0B]/20';
    return 'bg-[#EF4444]/20';
  };

  const getRecommendationLabel = (rec: string) => {
    switch (rec) {
      case 'train_normal': return 'Train Normal';
      case 'reduce_intensity': return 'Reduce Intensity';
      case 'rest_day': return 'Rest Day';
      case 'active_recovery': return 'Active Recovery';
      default: return 'Train Normal';
    }
  };

  const getRecommendationIcon = (rec: string) => {
    switch (rec) {
      case 'train_normal': return <Check className="w-4 h-4 text-[#10B981]" />;
      case 'reduce_intensity': return <TrendingDown className="w-4 h-4 text-[#F59E0B]" />;
      case 'rest_day': return <Moon className="w-4 h-4 text-[#71717A]" />;
      case 'active_recovery': return <Zap className="w-4 h-4 text-[#00A3FF]" />;
      default: return <Check className="w-4 h-4 text-[#10B981]" />;
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Score Card */}
      <div className="bg-[#121215]/90 backdrop-blur-xl border border-[#27272A] rounded-xl p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Recovery Score</h2>
          <Activity className="w-5 h-5 text-[#71717A]" />
        </div>

        <div className="flex items-center gap-6">
          <div className={`${getScoreBg(score)} ${getScoreColor(score)} rounded-full h-20 w-20 flex items-center justify-center`}>
            <span className="text-3xl font-bold">{score}</span>
            <span className="text-xs ml-1">/100</span>
          </div>
          <div className="flex-1">
            <div className="text-sm text-[#A1A1AA] mb-1">Today's Recommendation</div>
            <div className="flex items-center gap-2">
              {getRecommendationIcon(recommendation)}
              <span className="text-lg font-medium">{getRecommendationLabel(recommendation)}</span>
            </div>
            {assessment?.factors && assessment.factors.length > 0 && (
              <div className="mt-3 space-y-1">
                {assessment.factors.slice(0, 3).map((f, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-[#71717A]">
                    <span className="mt-0.5">·</span>
                    <span>{f.weight > 0 ? `${f.weight * 100}%` : ''}: {f.description}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Wearable Data Summary */}
      {wearableData.length > 0 && (
        <div className="bg-[#121215]/90 backdrop-blur-xl border border-[#27272A] rounded-xl p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Wearable Data</h2>
            <Heart className="w-5 h-5 text-[#71717A]" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <DataPoint label="Resting HR" value={wearableData[0]?.restingHeartRate ? `${wearableData[0].restingHeartRate} bpm` : '—'} unit="bpm" icon={<Heart className="w-4 h-4" />} />
            <DataPoint label="HRV" value={wearableData[0]?.hrv ? `${wearableData[0].hrv} ms` : '—'} unit="ms" icon={<TrendingUp className="w-4 h-4" />} />
            <DataPoint label="Sleep" value={wearableData[0]?.sleepDuration ? `${Math.round(wearableData[0].sleepDuration / 60)}h ${Math.round(wearableData[0].sleepDuration % 60)}m` : '—'} unit="sleep" icon={<Moon className="w-4 h-4" />} />
            <DataPoint label="Steps" value={wearableData[0]?.steps ? `${wearableData[0].steps.toLocaleString()}` : '—'} unit="steps" icon={<Activity className="w-4 h-4" />} />
          </div>

          {wearableData.length > 1 && (
            <div className="mt-3 pt-3 border-t border-[#27272A]">
              <div className="text-xs text-[#71717A]">Last updated: {new Date(wearableData[0].timestamp).toLocaleString()}</div>
            </div>
          )}
        </div>
      )}

      {/* Connect Wearable Prompt */}
      {wearableData.length === 0 && (
        <div className="bg-[#121215]/90 backdrop-blur-xl border border-[#27272A] rounded-xl p-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-[#F59E0B]" />
            <div>
              <div className="text-sm font-medium">Connect a wearable</div>
              <div className="text-xs text-[#71717A] mt-1">
                Connect Apple HealthKit or Google Fit to get recovery scores and personalized recommendations.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DataPoint({ label, value, unit, icon }: { label: string; value: string; unit: string; icon: React.ReactNode }) {
  return (
    <div className="bg-[#16161A] rounded-lg p-3">
      <div className="flex items-center gap-2 text-xs text-[#71717A] mb-2">
        {icon}
        {label}
      </div>
      <div className="text-lg font-medium text-[#E4E4E7]">{value}</div>
    </div>
  );
}
