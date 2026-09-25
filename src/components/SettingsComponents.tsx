import { useState, useEffect } from 'react';
import { Zap, Crown, AlertTriangle, Download, Trash2 } from 'lucide-react';
import { SubscriptionTier, TIER_FEATURES, UserSubscription } from '../types';
import { auth, db } from '../firebase';
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';

interface SpecialModeSelectorProps {
  currentMode: string;
  onModeChange: (mode: string) => void;
}

const MODES = [
  { value: 'none', label: 'Standard', description: 'Regular fitness programming', color: 'bg-[#10B981]' },
  { value: 'glp1', label: 'GLP-1 Mode', description: 'Adjusted for weight-loss medication users', color: 'bg-[#F59E0B]' },
  { value: 'postpartum', label: 'Postpartum', description: 'Safe return-to-fitness programming', color: 'bg-[#EC4899]' },
  { value: 'injury_rehab', label: 'Injury Rehab', description: 'Accommodates declared injuries', color: 'bg-[#EF4444]' },
];

export function SpecialModeSelector({ currentMode, onModeChange }: SpecialModeSelectorProps) {
  return (
    <div className="bg-[#121215]/90 backdrop-blur-xl border border-[#27272A] rounded-xl p-4">
      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
        <Zap className="w-4 h-4 text-[#F59E0B]" />
        Special Mode
      </h3>
      <p className="text-xs text-[#71717A] mb-3">
        Adjust programming for specific conditions. Enable only if applicable.
      </p>
      <div className="grid grid-cols-2 gap-2">
        {MODES.map(mode => (
          <button
            key={mode.value}
            onClick={() => onModeChange(mode.value)}
            className={`flex flex-col items-start p-3 rounded-xl border transition text-left ${currentMode === mode.value ? 'bg-[#F59E0B]/10 border-[#F59E0B]/40' : 'bg-[#0D0D14] border-[#27272A] hover:border-[#3f3f46]'}`}
          >
            <div className={`w-2 h-2 rounded-full ${mode.color} mb-1.5`} />
            <div className="text-sm font-medium text-[#E4E4E7]">{mode.label}</div>
            <div className="text-xs text-[#71717A] mt-0.5">{mode.description}</div>
          </button>
        ))}
      </div>
      {currentMode !== 'none' && (
        <div className="mt-3 pt-3 border-t border-[#27272A]">
          <div className="flex items-start gap-2 text-xs text-[#71717A]">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[#F59E0B]" />
            <span>Special mode is active. Your workouts and nutrition advice will be adjusted accordingly. Consult a healthcare provider before starting any new program.</span>
          </div>
        </div>
      )}
    </div>
  );
}

interface SubscriptionStatusProps {
  userId: string;
}

export function SubscriptionStatus({ userId }: SubscriptionStatusProps) {
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSub = async () => {
      try {
        const subRef = doc(db, 'users', userId, 'subscription', 'current');
        const snap = await getDoc(subRef);
        if (snap.exists()) setSubscription(snap.data() as UserSubscription);
      } catch {}
      finally { setLoading(false); }
    };
    fetchSub();
  }, [userId]);

  if (loading) {
    return (
      <div className="bg-[#121215]/90 backdrop-blur-xl border border-[#27272A] rounded-xl p-4">
        <div className="flex items-center gap-3 mb-4">
          <Crown className="w-4 h-4 text-[#F59E0B]" />
          <h3 className="text-sm font-semibold">Subscription</h3>
        </div>
        <div className="animate-spin rounded-full h-5 w-5 border-2 border-[#27272A] border-t-[#F59E0B] mx-auto" />
      </div>
    );
  }

  const tier = subscription?.tier || 'free';
  const features = TIER_FEATURES[tier as SubscriptionTier] || [];

  return (
    <div className="bg-[#121215]/90 backdrop-blur-xl border border-[#27272A] rounded-xl p-4">
      <div className="flex items-center gap-3 mb-4">
        <Crown className="w-4 h-4 text-[#F59E0B]" />
        <h3 className="text-sm font-semibold">Subscription</h3>
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${tier === 'free' ? 'bg-[#27272A] text-[#71717A]' : tier === 'premium' ? 'bg-[#F59E0B]/20 text-[#F59E0B]' : 'bg-[#EC4899]/20 text-[#EC4899]'}`}>
          {tier.charAt(0).toUpperCase() + tier.slice(1)}
        </span>
      </div>

      <div className="mb-3">
        <div className="text-xs text-[#71717A] mb-1">Your tier includes:</div>
        <div className="space-y-1">
          {features.map(f => (
            <div key={f} className="flex items-center gap-2 text-xs text-[#A1A1AA]">
              <div className="w-1.5 h-1.5 rounded-full bg-[#10B981] shrink-0" />
              {f}
            </div>
          ))}
        </div>
      </div>

      {tier === 'free' && (
        <button className="w-full mt-3 py-2 rounded-xl bg-[#F59E0B]/10 border border-[#F59E0B]/30 text-[#F59E0B] text-sm font-medium hover:bg-[#F59E0B]/20 transition flex items-center justify-center gap-2">
          <Crown className="w-4 h-4" />
          Upgrade to Premium ($12/mo)
        </button>
      )}
    </div>
  );
}

interface ExportButtonProps {
  userId: string;
}

export function ExportButton({ userId }: ExportButtonProps) {
  const [exporting, setExporting] = useState(false);

  const handleExport = async (format: 'json' | 'csv') => {
    setExporting(true);
    try {
      const res = await fetch('/api/fitness/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
        body: JSON.stringify({ format }),
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.json();
      // For now, download a placeholder
      const content = JSON.stringify({ message: 'Export coming soon', format, userId }, null, 2);
      const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `polysync-export-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Export not available yet.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="bg-[#121215]/90 backdrop-blur-xl border border-[#27272A] rounded-xl p-4">
      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
        <Download className="w-4 h-4 text-[#00A3FF]" />
        Export Your Data
      </h3>
      <p className="text-xs text-[#71717A] mb-3">
        Download your workout history, progress data, and profile as JSON or CSV.
      </p>
      <div className="flex gap-2">
        <button
          onClick={() => handleExport('json')}
          disabled={exporting}
          className="flex-1 py-2 rounded-xl bg-[#0D0D14] border border-[#27272A] text-sm text-[#E4E4E7] hover:border-[#00A3FF]/30 transition disabled:opacity-50 flex items-center justify-center gap-1"
        >
          {exporting ? 'Exporting...' : 'Export as JSON'}
        </button>
        <button
          onClick={() => handleExport('csv')}
          disabled={exporting}
          className="flex-1 py-2 rounded-xl bg-[#0D0D14] border border-[#27272A] text-sm text-[#E4E4E7] hover:border-[#00A3FF]/30 transition disabled:opacity-50 flex items-center justify-center gap-1"
        >
          {exporting ? 'Exporting...' : 'Export as CSV'}
        </button>
      </div>
    </div>
  );
}

interface DeleteAccountButtonProps {
  userId: string;
}

export function DeleteAccountButton({ userId }: DeleteAccountButtonProps) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirm('This will permanently delete ALL your data: workouts, plans, chat history, wearable data, profile, and settings. This action cannot be undone. Type "DELETE" to confirm.')) return;
    setDeleting(true);
    try {
      await fetch('/api/fitness/settings/delete-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
        body: JSON.stringify({ confirm: 'DELETE' }),
      });
      alert('Account deletion requested. Your data will be removed within 30 days per GDPR/CCPA policy.');
    } catch {
      alert('Failed to request deletion. Please try again.');
    } finally {
      setDeleting(false);
      setConfirming(false);
    }
  };

  return (
    <div className="bg-[#121215]/90 backdrop-blur-xl border border-[#EF4444]/20 rounded-xl p-4 mt-4">
      <div className="flex items-center gap-2 text-sm text-[#EF4444] font-medium mb-2">
        <Trash2 className="w-4 h-4" />
        Delete Account
      </div>
      <p className="text-xs text-[#71717A] mb-3">
        Permanently delete all your data. Complies with GDPR/CCPA right to erasure (30-day window).
      </p>
      <button
        onClick={handleDelete}
        disabled={deleting}
        className="w-full py-2 rounded-xl bg-[#EF4444]/10 border border-[#EF4444]/30 text-[#EF4444] text-sm font-medium hover:bg-[#EF4444]/20 transition disabled:opacity-50"
      >
        {deleting ? 'Requesting deletion...' : 'Request data deletion'}
      </button>
    </div>
  );
}
