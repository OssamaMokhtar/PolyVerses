import { useState } from 'react';
import { Zap, Heart, Moon, Smile, AlertTriangle, ChevronRight } from 'lucide-react';

interface CheckInProps {
  workoutId?: string;
  onComplete?: () => void;
}

interface CheckInData {
  energyLevel: number;
  mood: string;
  motivationLevel: number;
  sleepQuality: number;
  sleepDuration: number;
  painOrIssues: string;
  muscleSoreness: number;
  workoutCompleted: boolean;
  notes: string;
}

const MOOD_OPTIONS = [
  { value: 'great', label: 'Great', icon: Smile, color: 'text-[#10B981]' },
  { value: 'good', label: 'Good', icon: Smile, color: 'text-[#22C55E]' },
  { value: 'okay', label: 'Okay', icon: Zap, color: 'text-[#F59E0B]' },
  { value: 'tired', label: 'Tired', icon: Zap, color: 'text-[#F59E0B]' },
  { value: 'sore', label: 'Sore', icon: AlertTriangle, color: 'text-[#EF4444]' },
  { value: 'frustrated', label: 'Frustrated', icon: AlertTriangle, color: 'text-[#EF4444]' },
];

export function CheckInForm({ workoutId, onComplete }: CheckInProps) {
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [data, setData] = useState<CheckInData>({
    energyLevel: 5,
    mood: 'okay',
    motivationLevel: 5,
    sleepQuality: 5,
    sleepDuration: 7,
    painOrIssues: '',
    muscleSoreness: 5,
    workoutCompleted: true,
    notes: '',
  });

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const res = await fetch('/api/fitness/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': 'current-user' },
        body: JSON.stringify({
          energyLevel: data.energyLevel,
          mood: data.mood,
          motivationLevel: data.motivationLevel,
          sleepQuality: data.sleepQuality,
          sleepDuration: data.sleepDuration,
          painOrIssues: data.painOrIssues,
          muscleSoreness: data.muscleSoreness,
          workoutCompleted: data.workoutCompleted,
          workoutId,
          notes: data.notes,
        }),
      });
      if (res.ok) {
        setSubmitted(true);
        onComplete?.();
      }
    } catch (err) {
      console.error('Check-in failed:', err);
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="bg-[#121215]/90 backdrop-blur-xl border border-[#10B981]/30 rounded-xl p-6 text-center animate-in fade-in zoom-in duration-200">
        <div className="w-12 h-12 rounded-full bg-[#10B981]/20 flex items-center justify-center mx-auto mb-4">
          <Zap className="w-6 h-6 text-[#10B981]" />
        </div>
        <h3 className="text-lg font-semibold text-[#E4E4E7]">Check-in saved</h3>
        <p className="text-sm text-[#71717A] mt-1">
          Thanks for sharing how you're feeling. Your coach will use this to adjust your programming.
        </p>
        {onComplete && (
          <button
            onClick={onComplete}
            className="mt-4 px-4 py-2 bg-[#00A3FF] text-white rounded-lg text-sm font-medium hover:bg-[#00A3FF]/90 transition w-full"
          >
            Done
          </button>
        )}
      </div>
    );
  }

  const rangeSlider = (value: number, onChange: (v: number) => void, label: string, lowColor: string, highColor: string) => (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs text-[#71717A]">{label}</label>
        <span className="text-sm font-medium" style={{ color: value <= 3 ? '#EF4444' : value <= 6 ? '#F59E0B' : '#10B981' }}>
          {value}/10
        </span>
      </div>
      <div className="relative h-2 bg-[#27272A] rounded-full">
        <div
          className="absolute h-full rounded-full transition-all"
          style={{ width: `${value * 10}%`, backgroundColor: value <= 3 ? '#EF4444' : value <= 6 ? '#F59E0B' : '#10B981' }}
        />
      </div>
      <div className="flex justify-between mt-1">
        <button
          onClick={() => onChange(Math.max(1, value - 1))}
          className="w-8 h-8 rounded text-xs font-medium bg-[#1A1A20] border border-[#27272A] hover:bg-[#27272A] transition text-[#E4E4E7]"
        >
          −
        </button>
        <span className="flex-1 text-center text-xs text-[#71717A]">1</span>
        <span className="flex-1 text-center text-xs text-[#71717A]">10</span>
        <button
          onClick={() => onChange(Math.min(10, value + 1))}
          className="w-8 h-8 rounded text-xs font-medium bg-[#1A1A20] border border-[#27272A] hover:bg-[#27272A] transition text-[#E4E4E7]"
        >
          +
        </button>
      </div>
    </div>
  );

  return (
    <div className="bg-[#121215]/90 backdrop-blur-xl border border-[#27272A] rounded-xl p-6 animate-in fade-in zoom-in duration-200">
      <div className="flex items-center gap-3 mb-5">
        <Heart className="w-5 h-5 text-[#F59E0B]" />
        <div>
          <h3 className="text-lg font-semibold">How are you feeling?</h3>
          <p className="text-xs text-[#71717A]">Post-workout check-in — helps your coach adjust your plan</p>
        </div>
      </div>

      {/* Mood selector */}
      <div className="mb-5">
        <label className="text-xs text-[#71717A] block mb-2">How's your mood right now?</label>
        <div className="flex flex-wrap gap-2">
          {MOOD_OPTIONS.map(option => {
            const Icon = option.icon;
            const active = data.mood === option.value;
            return (
              <button
                key={option.value}
                onClick={() => setData(prev => ({ ...prev, mood: option.value }))}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border transition text-sm ${active ? 'bg-[#F59E0B]/20 border-[#F59E0B]/40 text-[#F59E0B]' : 'bg-[#1A1A20] border-[#27272A] text-[#71717A] hover:border-[#3f3f46]'}`}
              >
                <Icon className={`w-4 h-4 ${option.color}`} />
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Sliders */}
      <div className="space-y-1">
        {rangeSlider(data.energyLevel, v => setData(prev => ({ ...prev, energyLevel: v })), 'Energy Level', '#EF4444', '#10B981')}
        {rangeSlider(data.muscleSoreness, v => setData(prev => ({ ...prev, muscleSoreness: v })), 'Muscle Soreness', '#EF4444', '#10B981')}
        {rangeSlider(data.sleepQuality, v => setData(prev => ({ ...prev, sleepQuality: v })), 'Sleep Quality', '#EF4444', '#10B981')}
        {rangeSlider(data.motivationLevel, v => setData(prev => ({ ...prev, motivationLevel: v })), 'Motivation Level', '#EF4444', '#10B981')}
      </div>

      {/* Sleep duration */}
      <div className="mb-5">
        <label className="text-xs text-[#71717A] block mb-2">Sleep duration (hours)</label>
        <div className="flex items-center gap-2">
          <Moon className="w-4 h-4 text-[#71717A]" />
          <input
            type="number"
            min={0}
            max={16}
            value={data.sleepDuration}
            onChange={e => setData(prev => ({ ...prev, sleepDuration: Number(e.target.value) || 0 }))}
            className="w-20 px-3 py-1.5 bg-[#1A1A20] border border-[#27272A] rounded-lg text-sm text-[#E4E4E7] text-center focus:outline-none focus:border-[#00A3FF]/40"
          />
          <span className="text-xs text-[#71717A]">hours</span>
        </div>
      </div>

      {/* Pain/issues text */}
      <div className="mb-5">
        <label className="text-xs text-[#71717A] block mb-1">Any pain or issues to report? (optional)</label>
        <textarea
          value={data.painOrIssues}
          onChange={e => setData(prev => ({ ...prev, painOrIssues: e.target.value }))}
          placeholder="e.g. Lower back feels tight, knees are sore..."
          className="w-full px-3 py-2 bg-[#1A1A20] border border-[#27272A] rounded-lg text-sm text-[#E4E4E7] placeholder-[#71717A] h-20 resize-none focus:outline-none focus:border-[#00A3FF]/40"
        />
      </div>

      {/* Notes */}
      <div className="mb-5">
        <label className="text-xs text-[#71717A] block mb-1">Anything else? (optional)</label>
        <textarea
          value={data.notes}
          onChange={e => setData(prev => ({ ...prev, notes: e.target.value }))}
          placeholder="Any other feedback for your coach..."
          className="w-full px-3 py-2 bg-[#1A1A20] border border-[#27272A] rounded-lg text-sm text-[#E4E4E7] placeholder-[#71717A] h-16 resize-none focus:outline-none focus:border-[#00A3FF]/40"
        />
      </div>

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="w-full py-2.5 bg-[#10B981] text-white rounded-lg text-sm font-medium hover:bg-[#10B981]/90 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {submitting ? (
          <>
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
            Saving...
          </>
        ) : (
          <>
            <Zap className="w-4 h-4" />
            Save Check-in
          </>
        )}
      </button>
    </div>
  );
}
