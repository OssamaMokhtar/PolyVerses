import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

interface SettingsProps {
  user: { uid: string; email: string; displayName: string | null };
  profile: FitnessProfile | null;
  workoutLogs: WorkoutLogData[];
  onUpdateProfile: (profile: Partial<FitnessProfile>) => void;
  onSignOut: () => void;
  onDeleteData: () => void;
  onExportData: () => void;
}

interface FitnessProfile {
  goal: string;
  level: string;
  injuries: string[];
  equipment: string[];
  daysPerWeek: number;
  sessionDuration: number;
  focus: string[];
  weight?: number;
  height?: number;
  age?: number;
  gender?: string;
  healthDataConsent: boolean;
  specialMode: string;
}

interface WorkoutLogData {
  workoutId: string;
  date: string;
  workoutName: string;
  focus: string;
  totalVolume: number;
  duration: number;
  completedSets: any[];
}

const GOALS = ['build_muscle', 'lose_weight', 'improve_endurance', 'general_fitness', 'maintain'];
const LEVELS = ['beginner', 'intermediate', 'advanced'];
const FOCUS_OPTIONS = ['upper_body', 'lower_body', 'core', 'full_body', 'push', 'pull', 'legs', 'cardio', 'mobility'];
const EQUIPMENT_OPTIONS = ['barbell', 'dumbbells', 'kettlebell', 'resistance_bands', 'bodyweight', 'bench', 'pull_up_bar', 'machine', 'cable', 'none'];
const INJURY_OPTIONS = ['none', 'lower_back', 'right_shoulder', 'left_shoulder', 'right_knee', 'left_knee', 'right_hip', 'left_hip', 'neck', 'ankle', 'elbow', 'wrist'];
const SPECIAL_MODES = ['none', 'glp1', 'postpartum', 'hypertension', 'injury_rehab'];

export function Settings({ user, profile, workoutLogs, onUpdateProfile, onSignOut, onDeleteData, onExportData }: SettingsProps) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<FitnessProfile>>(profile ? { ...profile } : {
    goal: 'general_fitness',
    level: 'intermediate',
    injuries: [],
    equipment: ['dumbbells'],
    daysPerWeek: 4,
    sessionDuration: 45,
    focus: ['full_body'],
    healthDataConsent: false,
    specialMode: 'none',
  });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (profile) {
      setForm({
        goal: profile.goal,
        level: profile.level,
        injuries: profile.injuries,
        equipment: profile.equipment,
        daysPerWeek: profile.daysPerWeek,
        sessionDuration: profile.sessionDuration,
        focus: profile.focus,
        weight: profile.weight,
        height: profile.height,
        age: profile.age,
        gender: profile.gender,
        healthDataConsent: profile.healthDataConsent,
        specialMode: profile.specialMode,
      });
    }
  }, [profile]);

  const handleSave = () => {
    onUpdateProfile(form);
    setEditing(false);
  };

  const handleCancel = () => {
    setForm(profile ? { ...profile } : {
      goal: 'general_fitness',
      level: 'intermediate',
      injuries: [],
      equipment: ['dumbbells'],
      daysPerWeek: 4,
      sessionDuration: 45,
      focus: ['full_body'],
      healthDataConsent: false,
      specialMode: 'none',
    });
    setEditing(false);
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Profile Section */}
      <div className="bg-[#1A1A20] rounded-xl p-5 border border-[#27272A]">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-[#E4E4E7]">Your Profile</h3>
          {!editing ? (
            <button
              onClick={() => setEditing(true)}
              className="text-sm text-[#6366F1] hover:text-[#52525B] transition-colors font-medium"
            >
              Edit Profile
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                className="px-3 py-1.5 rounded-lg bg-[#22C55E] text-white text-sm font-medium hover:bg-[#16A34A] transition-colors"
              >
                Save
              </button>
              <button
                onClick={handleCancel}
                className="px-3 py-1.5 rounded-lg bg-[#27272A] text-[#71717A] text-sm font-medium hover:bg-[#3A3A40] transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        {editing ? (
          <div className="space-y-4">
            {/* Goal */}
            <div>
              <label className="text-xs text-[#71717A] font-medium uppercase tracking-wide mb-1.5 block">Fitness Goal</label>
              <select
                value={form.goal || 'general_fitness'}
                onChange={e => setForm({ ...form, goal: e.target.value })}
                className="w-full bg-[#0D0D14] border border-[#27272A] rounded-lg px-3 py-2.5 text-sm text-[#E4E4E7] focus:border-[#6366F1] focus:outline-none"
              >
                {GOALS.map(g => (
                  <option key={g} value={g}>{g.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
                ))}
              </select>
            </div>

            {/* Level + Days row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-[#71717A] font-medium uppercase tracking-wide mb-1.5 block">Experience Level</label>
                <select
                  value={form.level || 'intermediate'}
                  onChange={e => setForm({ ...form, level: e.target.value })}
                  className="w-full bg-[#0D0D14] border border-[#27272A] rounded-lg px-3 py-2.5 text-sm text-[#E4E4E7] focus:border-[#6366F1] focus:outline-none"
                >
                  {LEVELS.map(l => (
                    <option key={l} value={l}>{l.charAt(0).toUpperCase() + l.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-[#71717A] font-medium uppercase tracking-wide mb-1.5 block">Days / Week</label>
                <select
                  value={form.daysPerWeek || 4}
                  onChange={e => setForm({ ...form, daysPerWeek: parseInt(e.target.value) })}
                  className="w-full bg-[#0D0D14] border border-[#27272A] rounded-lg px-3 py-2.5 text-sm text-[#E4E4E7] focus:border-[#6366F1] focus:outline-none"
                >
                  {[2, 3, 4, 5, 6].map(d => (
                    <option key={d} value={d}>{d} days</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Session duration */}
            <div>
              <label className="text-xs text-[#71717A] font-medium uppercase tracking-wide mb-1.5 block">Session Duration (minutes)</label>
              <select
                value={form.sessionDuration || 45}
                onChange={e => setForm({ ...form, sessionDuration: parseInt(e.target.value) })}
                className="w-full bg-[#0D0D14] border border-[#27272A] rounded-lg px-3 py-2.5 text-sm text-[#E4E4E7] focus:border-[#6366F1] focus:outline-none"
              >
                {[20, 30, 40, 45, 50, 60, 75, 90].map(d => (
                  <option key={d} value={d}>{d} min</option>
                ))}
              </select>
            </div>

            {/* Injuries */}
            <div>
              <label className="text-xs text-[#71717A] font-medium uppercase tracking-wide mb-1.5 block">Injuries / Restrictions</label>
              <div className="flex flex-wrap gap-2">
                {INJURY_OPTIONS.map(inj => (
                  <button
                    key={inj}
                    onClick={() => {
                      const current = form.injuries || [];
                      if (inj === 'none') {
                        setForm({ ...form, injuries: [] });
                      } else if (current.includes(inj)) {
                        setForm({ ...form, injuries: current.filter(i => i !== inj) });
                      } else {
                        setForm({ ...form, injuries: [...current, inj] });
                      }
                    }}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                      (inj === 'none' && (!form.injuries || form.injuries.length === 0)) ||
                      form.injuries?.includes(inj)
                        ? 'bg-[#6366F1] text-white'
                        : 'bg-[#0D0D14] text-[#71717A] border border-[#27272A] hover:border-[#3A3A40]'
                    }`}
                  >
                    {inj === 'none' ? 'None' : inj.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
                  </button>
                ))}
              </div>
            </div>

            {/* Equipment */}
            <div>
              <label className="text-xs text-[#71717A] font-medium uppercase tracking-wide mb-1.5 block">Available Equipment</label>
              <div className="flex flex-wrap gap-2">
                {EQUIPMENT_OPTIONS.map(eq => (
                  <button
                    key={eq}
                    onClick={() => {
                      const current = form.equipment || [];
                      if (current.includes(eq)) {
                        setForm({ ...form, equipment: current.filter(e => e !== eq) });
                      } else {
                        setForm({ ...form, equipment: [...current, eq] });
                      }
                    }}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                      form.equipment?.includes(eq)
                        ? 'bg-[#22C55E] text-white'
                        : 'bg-[#0D0D14] text-[#71717A] border border-[#27272A] hover:border-[#3A3A40]'
                    }`}
                  >
                    {eq.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
                  </button>
                ))}
              </div>
            </div>

            {/* Focus areas */}
            <div>
              <label className="text-xs text-[#71717A] font-medium uppercase tracking-wide mb-1.5 block">Focus Areas</label>
              <div className="flex flex-wrap gap-2">
                {FOCUS_OPTIONS.map(f => (
                  <button
                    key={f}
                    onClick={() => {
                      const current = form.focus || ['full_body'];
                      if (current.includes(f)) {
                        const next = current.filter(x => x !== f);
                        setForm({ ...form, focus: next.length > 0 ? next : ['full_body'] });
                      } else {
                        setForm({ ...form, focus: [...current, f] });
                      }
                    }}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                      form.focus?.includes(f)
                        ? 'bg-[#6366F1] text-white'
                        : 'bg-[#0D0D14] text-[#71717A] border border-[#27272A] hover:border-[#3A3A40]'
                    }`}
                  >
                    {f.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
                  </button>
                ))}
              </div>
            </div>

            {/* Biometrics */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-[#71717A] font-medium uppercase tracking-wide mb-1.5 block">Weight (kg)</label>
                <input
                  type="number"
                  value={form.weight || ''}
                  onChange={e => setForm({ ...form, weight: parseFloat(e.target.value) || undefined })}
                  placeholder="kg"
                  className="w-full bg-[#0D0D14] border border-[#27272A] rounded-lg px-3 py-2.5 text-sm text-[#E4E4E7] placeholder-[#52525B] focus:border-[#6366F1] focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-[#71717A] font-medium uppercase tracking-wide mb-1.5 block">Height (cm)</label>
                <input
                  type="number"
                  value={form.height || ''}
                  onChange={e => setForm({ ...form, height: parseFloat(e.target.value) || undefined })}
                  placeholder="cm"
                  className="w-full bg-[#0D0D14] border border-[#27272A] rounded-lg px-3 py-2.5 text-sm text-[#E4E4E7] placeholder-[#52525B] focus:border-[#6366F1] focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-[#71717A] font-medium uppercase tracking-wide mb-1.5 block">Age</label>
                <input
                  type="number"
                  value={form.age || ''}
                  onChange={e => setForm({ ...form, age: parseInt(e.target.value) || undefined })}
                  placeholder="years"
                  className="w-full bg-[#0D0D14] border border-[#27272A] rounded-lg px-3 py-2.5 text-sm text-[#E4E4E7] placeholder-[#52525B] focus:border-[#6366F1] focus:outline-none"
                />
              </div>
            </div>

            {/* Health consent */}
            <div className="flex items-start gap-3 p-3 rounded-lg bg-[#22C55E]/5 border border-[#22C55E]/20">
              <input
                type="checkbox"
                id="healthConsent"
                checked={form.healthDataConsent || false}
                onChange={e => setForm({ ...form, healthDataConsent: e.target.checked })}
                className="mt-0.5 w-4 h-4 rounded border-[#27272A] bg-[#0D0D14] text-[#22C55E] focus:ring-[#22C55E] focus:ring-offset-0"
              />
              <label htmlFor="healthConsent" className="text-sm text-[#E4E4E7] cursor-pointer select-none">
                I consent to share my health/wearable data with PolySync for personalized coaching.
                <span className="block text-[#71717A] text-xs mt-1">This allows recovery analysis from Apple Health / Google Fit data. You can revoke this at any time.</span>
              </label>
            </div>

            {/* Special mode */}
            <div>
              <label className="text-xs text-[#71717A] font-medium uppercase tracking-wide mb-1.5 block">Special Mode</label>
              <select
                value={form.specialMode || 'none'}
                onChange={e => setForm({ ...form, specialMode: e.target.value })}
                className="w-full bg-[#0D0D14] border border-[#27272A] rounded-lg px-3 py-2.5 text-sm text-[#E4E4E7] focus:border-[#6366F1] focus:outline-none"
              >
                {SPECIAL_MODES.map(sm => (
                  <option key={sm} value={sm}>
                    {sm === 'none' ? 'None' : sm === 'glp1' ? 'GLP-1 Medication' :
                      sm === 'postpartum' ? 'Postpartum' : sm === 'hypertension' ? 'Hypertension' : 'Injury Rehab'}
                  </option>
                ))}
              </select>
              {form.specialMode && form.specialMode !== 'none' && (
                <p className="text-xs text-[#71717A] mt-1.5">
                  {form.specialMode === 'glp1' && "Programming optimized for GLP-1 users: strength-preserving, recovery-aware, lower-intensity cardio."}
                  {form.specialMode === 'postpartum' && "Postpartum-safe programming with gradual progression and pelvic floor considerations."}
                  {form.specialMode === 'hypertension' && " cardiovascular-safe programming with appropriate intensity management."}
                  {form.specialMode === 'injury_rehab' && "Programming designed to work around injuries with safe substitutions and modified intensity."}
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-[#71717A] uppercase tracking-wide mb-1">Goal</div>
              <div className="text-sm font-medium text-[#E4E4E7]">
                {(form.goal || profile?.goal || 'general_fitness').replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
              </div>
            </div>
            <div>
              <div className="text-xs text-[#71717A] uppercase tracking-wide mb-1">Level</div>
              <div className="text-sm font-medium text-[#E4E4E7]">
                {(form.level || profile?.level || 'intermediate').charAt(0).toUpperCase() + (form.level || profile?.level || 'intermediate').slice(1)}
              </div>
            </div>
            <div>
              <div className="text-xs text-[#71717A] uppercase tracking-wide mb-1">Days/Week</div>
              <div className="text-sm font-medium text-[#E4E4E7]">{form.daysPerWeek || profile?.daysPerWeek || 4}</div>
            </div>
            <div>
              <div className="text-xs text-[#71717A] uppercase tracking-wide mb-1">Session Duration</div>
              <div className="text-sm font-medium text-[#E4E4E7]">{(form.sessionDuration || profile?.sessionDuration || 45)} min</div>
            </div>
            <div className="col-span-2">
              <div className="text-xs text-[#71717A] uppercase tracking-wide mb-1">Injuries</div>
              <div className="text-sm text-[#E4E4E7]">
                {form.injuries && form.injuries.length > 0
                  ? form.injuries.map(i => i.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())).join(', ')
                  : 'None'}
              </div>
            </div>
            <div className="col-span-2">
              <div className="text-xs text-[#71717A] uppercase tracking-wide mb-1">Equipment</div>
              <div className="text-sm text-[#E4E4E7]">
                {(form.equipment || profile?.equipment || ['dumbbells']).map(e => e.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())).join(', ')}
              </div>
            </div>
            <div className="col-span-2">
              <div className="text-xs text-[#71717A] uppercase tracking-wide mb-1">Focus Areas</div>
              <div className="text-sm text-[#E4E4E7]">
                {(form.focus || profile?.focus || ['full_body']).map(f => f.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())).join(', ')}
              </div>
            </div>
            <div className="col-span-2">
              <div className="text-xs text-[#71717A] uppercase tracking-wide mb-1">Health Data Consent</div>
              <div className="text-sm text-[#E4E4E7]">
                {form.healthDataConsent ? '✅ Consented' : '❌ Not consented'}
              </div>
            </div>
            <div className="col-span-2">
              <div className="text-xs text-[#71717A] uppercase tracking-wide mb-1">Special Mode</div>
              <div className="text-sm text-[#E4E4E7]">
                {form.specialMode && form.specialMode !== 'none'
                  ? form.specialMode.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())
                  : 'None'}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Account Section */}
      <div className="bg-[#1A1A20] rounded-xl p-5 border border-[#27272A]">
        <h3 className="text-lg font-semibold text-[#E4E4E7] mb-4">Account</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between py-2 border-b border-[#27272A] last:border-0">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#6366F1] to-[#A855F7] flex items-center justify-center text-white font-bold text-xs">
                {user.displayName?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase() || 'U'}
              </div>
              <div>
                <div className="text-sm font-medium text-[#E4E4E7]">{user.displayName || user.email?.split('@')[0]}</div>
                <div className="text-xs text-[#71717A]">{user.email}</div>
              </div>
            </div>
          </div>
          <button
            onClick={onSignOut}
            className="w-full py-2.5 rounded-lg bg-[#0D0D14] border border-[#27272A] text-sm text-[#71717A] hover:bg-[#27272A] hover:text-[#E4E4E7] transition-all font-medium"
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* Data Management Section */}
      <div className="bg-[#1A1A20] rounded-xl p-5 border border-[#27272A]">
        <h3 className="text-lg font-semibold text-[#E4E4E7] mb-4">Data Management</h3>

        <div className="space-y-3">
          <button
            onClick={onExportData}
            className="w-full py-2.5 rounded-lg bg-[#0D0D14] border border-[#27272A] text-sm text-[#71717A] hover:bg-[#27272A] hover:text-[#E4E4E7] transition-all font-medium flex items-center justify-between"
          >
            <span>Export My Data</span>
            <span className="text-xs text-[#52525B]">(JSON/CSV)</span>
          </button>

          <div className="flex items-center justify-between py-2 border-b border-[#27272A]">
            <div className="text-sm text-[#E4E4E7]">
              <span className="text-[#22C55E]">{workoutLogs.length}</span> workouts logged
            </div>
          </div>

          {showDeleteConfirm ? (
            <div className="p-3 rounded-lg bg-[#EF4444]/10 border border-[#EF4444]/30">
              <p className="text-sm text-[#EF4444] font-medium mb-3">⚠️ Are you sure?</p>
              <p className="text-xs text-[#71717A] mb-3">This will permanently delete all your workout logs, plans, progress data, and chat history. This action cannot be undone.</p>
              <div className="flex gap-2">
                <button
                  onClick={() => { onDeleteData(); setShowDeleteConfirm(false); }}
                  className="flex-1 py-2 rounded-lg bg-[#EF4444] text-white text-sm font-medium hover:bg-[#DC2626] transition-colors"
                >
                  Yes, Delete Everything
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 py-2 rounded-lg bg-[#27272A] text-[#71717A] text-sm font-medium hover:bg-[#3A3A40] transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="w-full py-2.5 rounded-lg bg-[#0D0D14] border border-[#EF4444]/30 text-sm text-[#EF4444] hover:bg-[#EF4444]/10 transition-all font-medium"
            >
              🗑️ Delete All My Data
            </button>
          )}

          <p className="text-xs text-[#52525B] pt-2">
            By using PolySync, you agree to our{' '}
            <a href="#" className="text-[#6366F1] hover:underline">Terms of Service</a> and{' '}
            <a href="#" className="text-[#6366F1] hover:underline">Privacy Policy</a>.
            All data is stored securely in Firebase. You have the right to request deletion at any time.
          </p>
        </div>
      </div>

      {/* About */}
      <div className="mt-4 p-4 bg-[#121215]/90 backdrop-blur-xl border border-[#27272A] rounded-xl text-xs text-[#71717A]">
        <p className="font-medium text-[#E4E4E7] mb-2">About PolySync</p>
        <p className="leading-relaxed">
          AI Fitness Coach Platform · Version 1.0<br />
          Built with React + Firebase + Gemini AI<br />
          <a href="https://github.com/OssamaMokhtar/PolyVerses" className="text-[#00A3FF] hover:underline" target="_blank" rel="noopener noreferrer">
            View on GitHub →
          </a>
        </p>
      </div>
    </div>
  );
}
