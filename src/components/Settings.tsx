import { useState } from 'react';
import { User, Dumbbell, Bell, Shield, Palette, Moon, Sun, LogOut, Trash2, Download } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { FitnessProfile } from '../types';

interface SettingsProps {
  profile: FitnessProfile | null;
  onEditProfile: () => void;
  onSignOut: () => void;
  onDeleteData?: () => void;
}

type Theme = 'dark' | 'light' | 'system';
type NotifPrefs = {
  dailyDigest: boolean;
  workoutReminders: boolean;
  checkInPrompts: boolean;
  adaptationUpdates: boolean;
};

const DEFAULT_NOTIF_PREFS: NotifPrefs = {
  dailyDigest: true,
  workoutReminders: true,
  checkInPrompts: true,
  adaptationUpdates: true,
};

export function Settings({ profile, onEditProfile, onSignOut, onDeleteData }: SettingsProps) {
  const { currentUser } = useAuth();
  const [activeSection, setActiveSection] = useState<'profile' | 'preferences' | 'notifications' | 'appearance' | 'data'>('profile');
  const [notifPrefs, setNotifPrefs] = useState<NotifPrefs>(DEFAULT_NOTIF_PREFS);
  const [theme, setTheme] = useState<Theme>('dark');
  const [deleting, setDeleting] = useState(false);

  const handleNotifChange = (key: keyof NotifPrefs) => {
    setNotifPrefs(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleDeleteData = async () => {
    if (!confirm('This will permanently delete your profile, workout history, plans, and chat history. This cannot be undone. Are you sure?')) return;
    setDeleting(true);
    try {
      await fetch('/api/fitness/delete-user-data', {
        method: 'POST',
        headers: { 'x-user-id': currentUser!.uid },
      });
      onDeleteData?.();
      onSignOut();
    } catch (err) {
      console.error('Failed to delete data:', err);
      alert('Failed to delete data. Please try again.');
      setDeleting(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Section tabs */}
      <div className="flex gap-1 mb-4 flex-wrap">
        {(['profile', 'preferences', 'notifications', 'appearance', 'data'] as const).map(section => (
          <button
            key={section}
            onClick={() => setActiveSection(section)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeSection === section
                ? 'bg-[#00A3FF]/10 text-[#00A3FF] border border-[#00A3FF]/30'
                : 'bg-[#16161A] text-[#A1A1AA] border border-[#27272A] hover:border-[#3f3f46]'
            }`}
          >
            {section.charAt(0).toUpperCase() + section.slice(1)}
          </button>
        ))}
      </div>

      {/* Profile section */}
      {activeSection === 'profile' && (
        <div className="space-y-4">
          <div className="bg-[#121215]/90 backdrop-blur-xl border border-[#27272A] rounded-xl p-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-[#00A3FF]/10 flex items-center justify-center">
                <User className="w-6 h-6 text-[#00A3FF]" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium">{profile?.displayName || 'Your Profile'}</div>
                <div className="text-xs text-[#71717A]">{profile?.email || 'Not signed in'}</div>
              </div>
            </div>

            {profile ? (
              <div className="space-y-2 text-sm">
                <ProfileRow label="Goal" value={profile.goal?.replace(/_/g, ' ') || '—'} />
                <ProfileRow label="Level" value={profile.level || '—'} />
                <ProfileRow label="Focus Areas" value={profile.focus?.join(', ') || '—'} />
                <ProfileRow label="Days / Week" value={profile.daysPerWeek?.toString() || '—'} />
                <ProfileRow label="Session Duration" value={profile.sessionDuration ? `${profile.sessionDuration} min` : '—'} />
                <ProfileRow label="Injuries" value={profile.injuries?.length ? profile.injuries.join(', ') : 'None reported'} />
                <ProfileRow label="Equipment" value={profile.equipment?.join(', ') || 'None specified'} />
                {profile.specialMode && <ProfileRow label="Special Mode" value={profile.specialMode} highlight />}
                <ProfileRow label="Health Data Consent" value={profile.healthDataConsent ? '✅ Enabled' : 'Not set'} />
              </div>
            ) : (
              <div className="text-sm text-[#71717A] text-center py-4">No profile data available.</div>
            )}
          </div>

          <button
            onClick={onEditProfile}
            className="w-full flex items-center gap-2 px-4 py-2.5 bg-[#16161A] border border-[#27272A] rounded-lg text-sm text-[#E4E4E7] hover:bg-[#1A1A1E] hover:border-[#3f3f46] transition font-medium"
          >
            <Dumbbell className="w-4 h-4" />
            Edit Fitness Profile
          </button>
        </div>
      )}

      {/* Preferences */}
      {activeSection === 'preferences' && (
        <div className="bg-[#121215]/90 backdrop-blur-xl border border-[#27272A] rounded-xl p-4 space-y-4">
          <h3 className="text-sm font-semibold">Units & Display</h3>
          <div className="space-y-3">
            <PreferenceRow label="Weight unit" options={['kg', 'lbs']} />
            <PreferenceRow label="Distance unit" options={['km', 'miles']} />
            <PreferenceRow label="Rest timer unit" options={['seconds', 'minutes']} />
          </div>

          <h3 className="text-sm font-semibold mt-4">Coaching Style</h3>
          <div className="space-y-3">
            <PreferenceRow label="Coach personality" options={['Supportive', 'Direct', 'Scientific']} />
            <PreferenceRow label="Detail level" options={['Concise', 'Balanced', 'Detailed']} />
          </div>
        </div>
      )}

      {/* Notifications */}
      {activeSection === 'notifications' && (
        <div className="bg-[#121215]/90 backdrop-blur-xl border border-[#27272A] rounded-xl p-4 space-y-4">
          <h3 className="text-sm font-semibold">Notification Preferences</h3>
          <div className="space-y-3">
            <ToggleRow
              label="Daily Digest"
              description="Morning summary with recovery, today's plan, and motivation"
              active={notifPrefs.dailyDigest}
              onToggle={() => handleNotifChange('dailyDigest')}
            />
            <ToggleRow
              label="Workout Reminders"
              description="Remind me to work out on my scheduled days"
              active={notifPrefs.workoutReminders}
              onToggle={() => handleNotifChange('workoutReminders')}
            />
            <ToggleRow
              label="Check-in Prompts"
              description="Ask how my workout went and how I'm feeling"
              active={notifPrefs.checkInPrompts}
              onToggle={() => handleNotifChange('checkInPrompts')}
            />
            <ToggleRow
              label="Plan Adaptation Updates"
              description="Notify when my plan adapts based on my progress"
              active={notifPrefs.adaptationUpdates}
              onToggle={() => handleNotifChange('adaptationUpdates')}
            />
          </div>
        </div>
      )}

      {/* Appearance */}
      {activeSection === 'appearance' && (
        <div className="bg-[#121215]/90 backdrop-blur-xl border border-[#27272A] rounded-xl p-4 space-y-4">
          <h3 className="text-sm font-semibold">Theme</h3>
          <div className="flex gap-2">
            {(['dark', 'light', 'system'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                className={`flex-1 flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm transition ${
                  theme === t
                    ? 'bg-[#00A3FF]/10 border-[#00A3FF]/30 text-[#00A3FF]'
                    : 'bg-[#16161A] border-[#27272A] text-[#A1A1AA] hover:border-[#3f3f46]'
                }`}
              >
                {t === 'dark' && <Moon className="w-4 h-4" />}
                {t === 'light' && <Sun className="w-4 h-4" />}
                {t === 'system' && <Palette className="w-4 h-4" />}
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Data */}
      {activeSection === 'data' && (
        <div className="space-y-4">
          <div className="bg-[#121215]/90 backdrop-blur-xl border border-[#27272A] rounded-xl p-4">
            <h3 className="text-sm font-semibold mb-3">Your Data</h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between py-2 border-b border-[#27272A]">
                <span className="text-[#A1A1AA]">Workout History</span>
                <button className="text-xs text-[#00A3FF] hover:underline">
                  <Download className="w-3.5 h-3.5 inline mr-1" /> Export
                </button>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-[#27272A]">
                <span className="text-[#A1A1AA]">Chat History</span>
                <button className="text-xs text-[#00A3FF] hover:underline">
                  <Download className="w-3.5 h-3.5 inline mr-1" /> Export
                </button>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-[#A1A1AA]">Plan History</span>
                <button className="text-xs text-[#00A3FF] hover:underline">
                  <Download className="w-3.5 h-3.5 inline mr-1" /> Export
                </button>
              </div>
            </div>
          </div>

          <div className="bg-[#121215]/90 backdrop-blur-xl border border-[#EF4444]/20 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-[#EF4444] mb-2">Danger Zone</h3>
            <p className="text-xs text-[#71717A] mb-3">
              Permanently delete all your data. This cannot be undone.
            </p>
            <button
              onClick={handleDeleteData}
              disabled={deleting}
              className="flex items-center gap-2 px-4 py-2 bg-[#EF4444]/10 border border-[#EF4444]/30 text-[#EF4444] rounded-lg text-sm hover:bg-[#EF4444]/20 transition disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              {deleting ? 'Deleting...' : 'Delete All Data'}
            </button>
          </div>
        </div>
      )}

      {/* Sign out */}
      <div className="mt-4 pt-4 border-t border-[#27272A]">
        <button
          onClick={onSignOut}
          className="flex items-center gap-2 px-4 py-2.5 w-full rounded-lg border border-[#EF4444]/30 text-[#EF4444] hover:bg-[#EF4444]/10 transition text-sm"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </div>

      {/* Disclaimer */}
      <div className="mt-4 p-3 bg-[#F59E0B]/5 border border-[#F59E0B]/20 rounded-lg">
        <div className="flex items-start gap-2">
          <Shield className="w-4 h-4 text-[#F59E0B] shrink-0 mt-0.5" />
          <div className="text-xs text-[#A1A1AA] leading-relaxed">
            <span className="text-[#F59E0B] font-medium">Disclaimer:</span> PolySync provides AI-generated fitness guidance for informational purposes only.
            Always consult a qualified healthcare professional before starting any new exercise program, especially if you have existing injuries or medical conditions.
          </div>
        </div>
      </div>
    </div>
  );
}

function ProfileRow({ label, value, highlight }: { label: string; value: string | undefined; highlight?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-2 ${highlight ? 'bg-[#F59E0B]/5 border-l-2 border-[#F59E0B]' : ''}`}>
      <span className="text-xs text-[#71717A]">{label}</span>
      <span className={`text-sm ${highlight ? 'text-[#F59E0B] font-medium' : 'text-[#E4E4E7]'}`}>{value}</span>
    </div>
  );
}

function PreferenceRow({ label, options }: { label: string; options: string[] }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-[#A1A1AA]">{label}</span>
      <div className="flex gap-1">
        {options.map(opt => (
          <button
            key={opt}
            className="px-2.5 py-1 text-xs rounded border border-[#27272A] bg-[#16161A] text-[#A1A1AA] hover:border-[#00A3FF]/30 transition"
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

function ToggleRow({ label, description, active, onToggle }: {
  label: string;
  description: string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <div>
        <div className="text-sm text-[#E4E4E7] font-medium">{label}</div>
        <div className="text-xs text-[#71717A] mt-0.5">{description}</div>
      </div>
      <button
        onClick={onToggle}
        className={`relative w-10 h-5 rounded-full transition-colors ${
          active ? 'bg-[#00A3FF]' : 'bg-[#27272A]'
        }`}
      >
        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
          active ? 'translate-x-[18px]' : 'translate-x-1'
        }`} />
      </button>
    </div>
  );
}
