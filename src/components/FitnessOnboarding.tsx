import { useState } from 'react';
import { motion } from 'motion/react';
import { Cpu, Heart, Dumbbell, Clock, Target, AlertTriangle, Check, ChevronRight, Sparkles, Info } from 'lucide-react';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { FitnessProfile } from '../types';

interface FitnessOnboardingProps {
  currentUser: import('firebase/auth').User | null;
  onComplete: (profile: FitnessProfile) => void;
}

const GOALS = [
  { id: 'build_muscle', label: 'Build Muscle', icon: Dumbbell, description: 'Gain strength and muscle mass with progressive overload' },
  { id: 'lose_weight', label: 'Lose Weight', icon: Heart, description: 'Burn fat and improve body composition' },
  { id: 'improve_endurance', label: 'Improve Endurance', icon: Clock, description: 'Run longer, recover faster, boost stamina' },
  { id: 'general_fitness', label: 'General Fitness', icon: Target, description: 'Stay active, balanced, and healthy' },
  { id: 'maintain', label: 'Maintain', icon: Sparkles, description: 'Keep your current fitness level consistent' },
];

const LEVELS = [
  { id: 'beginner', label: 'Beginner', description: 'New to structured training or returning after a long break' },
  { id: 'intermediate', label: 'Intermediate', description: 'Consistent training for 6+ months, comfortable with basic exercises' },
  { id: 'advanced', label: 'Advanced', description: 'Experienced lifter/athlete with 2+ years of consistent training' },
];

const EQUIPMENT_OPTIONS = [
  { id: 'none', label: 'Bodyweight Only', icon: Target },
  { id: 'dumbbells', label: 'Dumbbells', icon: Dumbbell },
  { id: 'barbell', label: 'Barbell', icon: Dumbbell },
  { id: 'kettlebell', label: 'Kettlebell', icon: Dumbbell },
  { id: 'resistance_bands', label: 'Resistance Bands', icon: Target },
  { id: 'pull_up_bar', label: 'Pull-up Bar', icon: Dumbbell },
  { id: 'bench', label: 'Bench', icon: Dumbbell },
  { id: 'smith_machine', label: 'Smith Machine', icon: Dumbbell },
  { id: 'cable_machine', label: 'Cable Machine', icon: Dumbbell },
  { id: 'cardio_machine', label: 'Cardio Machine', icon: Heart },
];

const INJURY_PRESETS = [
  'none',
  'right_shoulder',
  'left_shoulder',
  'right_elbow',
  'left_elbow',
  'right_wrist',
  'left_wrist',
  'lower_back',
  'upper_back',
  'right_knee',
  'left_knee',
  'right_ankle',
  'left_ankle',
  'neck',
  'hip',
];

const DAYS_PER_WEEK_OPTIONS = [
  { value: 2, label: '2 days', description: 'Light schedule, good for beginners or busy weeks' },
  { value: 3, label: '3 days', description: 'Balanced schedule, full-body each session' },
  { value: 4, label: '4 days', description: 'Upper/lower split, good progression rate' },
  { value: 5, label: '5 days', description: 'Dedicated split, faster progress' },
  { value: 6, label: '6 days', description: 'High frequency, for committed athletes' },
];

const SESSION_DURATION_OPTIONS = [
  { value: 30, label: '30 min', description: 'Quick, focused sessions' },
  { value: 45, label: '45 min', description: 'Standard workout length' },
  { value: 60, label: '60 min', description: 'Full warm-up, workout, cool-down' },
  { value: 75, label: '75 min', description: 'Extended sessions with accessories' },
  { value: 90, label: '90 min', description: 'Comprehensive training sessions' },
];

const FOCUS_AREAS = [
  { id: 'full_body', label: 'Full Body' },
  { id: 'upper_body', label: 'Upper Body' },
  { id: 'lower_body', label: 'Lower Body' },
  { id: 'core', label: 'Core' },
  { id: 'cardio', label: 'Cardio' },
  { id: 'mobility', label: 'Mobility' },
  { id: 'arms', label: 'Arms' },
  { id: 'chest', label: 'Chest' },
  { id: 'back', label: 'Back' },
  { id: 'legs', label: 'Legs' },
];

export function FitnessOnboarding({ currentUser, onComplete }: FitnessOnboardingProps) {
  const [step, setStep] = useState(1);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Step 1 - Auth
  const [showAuthPrompt, setShowAuthPrompt] = useState(!currentUser);

  // Step 2 - Goal
  const [selectedGoal, setSelectedGoal] = useState<string | null>(null);

  // Step 3 - Level
  const [selectedLevel, setSelectedLevel] = useState<string | null>(null);

  // Step 4 - Injuries
  const [injuries, setInjuries] = useState<string[]>([]);
  const [injuryOther, setInjuryOther] = useState('');

  // Step 5 - Equipment
  const [selectedEquipment, setSelectedEquipment] = useState<string[]>([]);

  // Step 6 - Schedule
  const [daysPerWeek, setDaysPerWeek] = useState<number | null>(null);
  const [sessionDuration, setSessionDuration] = useState<number | null>(null);

  // Step 7 - Focus areas
  const [selectedFocus, setSelectedFocus] = useState<string[]>([]);

  // Step 8 - Biometrics (optional)
  const [age, setAge] = useState('');
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');

  // Step 8b - Special mode (GLP-1, etc.)
  const [specialMode, setSpecialMode] = useState<string>('none');

  const SPECIAL_MODES = [
    { id: 'none', label: 'None', description: 'Standard fitness programming' },
    { id: 'glp1', label: 'GLP-1 Medication', description: 'Taking GLP-1 agonists (Wegovy, Ozempic, Mounjaro, etc.) — modified intensity and recovery emphasis' },
    { id: 'postpartum', label: 'Postpartum', description: 'Recently gave birth — modified exercises, pelvic floor focus, gradual progression' },
    { id: 'injury_rehab', label: 'Injury Rehabilitation', description: 'Active injury rehab — modified exercises, avoid aggravating movements' },
    { id: 'senior', label: 'Older Adult (65+)', description: 'Age-focused programming — balance, joint health, bone density emphasis' },
  ];

  // Step 9 - Health consent
  const [healthDataConsent, setHealthDataConsent] = useState(false);
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);

  // All data
  const profileData: Partial<FitnessProfile> = {
    goal: selectedGoal,
    level: selectedLevel,
    injuries: injuries.filter(i => i !== 'none'),
    equipment: selectedEquipment,
    daysPerWeek: daysPerWeek,
    sessionDuration: sessionDuration,
    focus: selectedFocus,
    biometrics: {
      age: age ? parseInt(age) : undefined,
      weight: weight ? parseFloat(weight) : undefined,
      height: height ? parseFloat(height) : undefined,
    },
    healthDataConsent,
    disclaimerAccepted,
  };

  const allSteps = [
    { num: 1, label: 'Sign In' },
    { num: 2, label: 'Goal' },
    { num: 3, label: 'Level' },
    { num: 4, label: 'Injuries' },
    { num: 5, label: 'Equipment' },
    { num: 6, label: 'Schedule' },
    { num: 7, label: 'Focus' },
    { num: 8, label: 'Details' },
    { num: 9, label: 'Consent' },
  ];

  const canGoNext = () => {
    switch (step) {
      case 1: return currentUser !== null;
      case 2: return selectedGoal !== null;
      case 3: return selectedLevel !== null;
      case 4: return true; // injuries optional
      case 5: return selectedEquipment.length > 0;
      case 6: return daysPerWeek !== null && sessionDuration !== null;
      case 7: return selectedFocus.length > 0;
      case 8: return true; // biometrics optional
      case 9: return healthDataConsent && disclaimerAccepted;
      default: return false;
    }
  };

  const toggleInjury = (injury: string) => {
    if (injury === 'none') {
      setInjuries(['none']);
      setInjuryOther('');
    } else {
      setInjuries(prev =>
        prev.includes(injury)
          ? prev.filter(i => i !== injury && i !== 'none')
          : [...prev.filter(i => i !== 'none'), injury]
      );
    }
  };

  const toggleEquipment = (equipId: string) => {
    setSelectedEquipment(prev =>
      prev.includes(equipId)
        ? prev.filter(e => e !== equipId)
        : [...prev, equipId]
    );
  };

  const toggleFocus = (focusId: string) => {
    setSelectedFocus(prev =>
      prev.includes(focusId)
        ? prev.filter(f => f !== focusId)
        : [...prev, focusId]
    );
  };

  const handleSignIn = async () => {
    setIsAuthenticating(true);
    try {
      const { GoogleAuthProvider, signInWithPopup } = await import('firebase/auth');
      const { googleProvider } = await import('../firebase');
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error("Sign-in error:", err);
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleComplete = async () => {
    if (!currentUser) return;
    setIsSaving(true);
    try {
      const now = Date.now();
      const profile: FitnessProfile = {
        uid: currentUser.uid,
        email: currentUser.email || '',
        displayName: currentUser.displayName || '',
        goal: selectedGoal as FitnessProfile['goal'],
        level: selectedLevel as FitnessProfile['level'],
        injuries: injuries.filter(i => i !== 'none'),
        equipment: selectedEquipment,
        daysPerWeek: daysPerWeek!,
        sessionDuration: sessionDuration!,
        focus: selectedFocus,
        biometrics: {
          age: age ? parseInt(age) : undefined,
          weight: weight ? parseFloat(weight) : undefined,
          height: height ? parseFloat(height) : undefined,
        },
        healthDataConsent,
        disclaimerAccepted,
        specialMode,
        createdAt: now,
        updatedAt: now,
      };

      await setDoc(doc(db, 'users', currentUser.uid, 'profile', 'current'), profile as any);
      onComplete(profile);
    } catch (err) {
      console.error("Failed to save profile:", err);
      handleFirestoreError(err, OperationType.WRITE, `users/${currentUser.uid}/profile/current`);
    } finally {
      setIsSaving(false);
    }
  };

  const selectedGoalData = GOALS.find(g => g.id === selectedGoal);
  const selectedLevelData = LEVELS.find(l => l.id === selectedLevel);

  return (
    <div className="min-h-screen bg-[#0C0C0E] text-[#E4E4E7] flex flex-col items-center justify-center p-4 border-[10px] border-[#1A1A1E]">
      <div className="absolute top-0 left-0 right-0 h-[250px] bg-gradient-to-b from-[#00A3FF]/5 via-transparent to-transparent blur-3xl pointer-events-none" />

      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#00A3FF]/10 border border-[#00A3FF]/20 rounded-full text-[#00A3FF] text-xs font-mono mb-4">
          <Sparkles className="w-3.5 h-3.5" />
          PolySync — AI Fitness Coach
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Set Up Your Fitness Profile</h1>
        <p className="text-[#71717A] mt-2 text-sm max-w-md mx-auto">
          We'll build a personalized workout plan based on your goals, equipment, and schedule.
        </p>
      </div>

      {/* Progress bar */}
      <div className="flex items-center gap-1 mb-8 px-4">
        {allSteps.map((s, idx) => (
          <div key={s.num} className="flex items-center gap-1">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
              step > s.num
                ? 'bg-[#10B981]/20 text-[#10B981] border border-[#10B981]/30'
                : step === s.num
                ? 'bg-[#00A3FF]/20 text-[#00A3FF] border border-[#00A3FF]/40'
                : 'bg-[#1A1A1E] text-[#71717A] border border-[#27272A]'
            }`}>
              {step > s.num ? <Check className="w-3.5 h-3.5" /> : s.num}
            </div>
            {idx < allSteps.length - 1 && (
              <div className={`w-6 h-[2px] ${step > s.num ? 'bg-[#10B981]/30' : 'bg-[#27272A]'}`} />
            )}
          </div>
        ))}
      </div>

      {/* Step content */}
      <div className="w-full max-w-xl mb-8">
        {/* Step 1: Auth */}
        {step === 1 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-[#121215]/90 backdrop-blur-xl border border-[#27272A] rounded-xl p-6"
          >
            {currentUser ? (
              <div className="text-center">
                <div className="w-12 h-12 rounded-full bg-[#00A3FF]/20 flex items-center justify-center mx-auto mb-3">
                  <Cpu className="w-6 h-6 text-[#00A3FF]" />
                </div>
                <p className="text-[#E4E4E7] font-medium">Welcome, {currentUser.displayName || 'there'}!</p>
                <p className="text-[#71717A] text-sm mt-1">{currentUser.email}</p>
                <button
                  onClick={() => setStep(2)}
                  className="mt-4 px-6 py-2.5 bg-[#00A3FF] text-white rounded-lg font-medium hover:bg-[#00A3FF]/90 transition text-sm"
                >
                  Continue
                </button>
              </div>
            ) : (
              <div className="text-center">
                <AlertTriangle className="w-8 h-8 text-[#F59E0B] mx-auto mb-3" />
                <p className="text-[#E4E4E7] font-medium">Sign in to get started</p>
                <p className="text-[#71717A] text-sm mt-1 max-w-sm mx-auto">
                  We use Google Sign-In to create your secure fitness profile.
                </p>
                <button
                  onClick={handleSignIn}
                  disabled={isAuthenticating}
                  className="mt-4 px-6 py-2.5 bg-[#00A3FF] text-white rounded-lg font-medium hover:bg-[#00A3FF]/90 transition text-sm flex items-center gap-2 mx-auto disabled:opacity-50"
                >
                  {isAuthenticating ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <svg className="w-4 h-4" viewBox="0 0 24 24">
                        <path fill="#fff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                        <path fill="#fff" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                        <path fill="#fff" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.86-2.22.81-.62z"/>
                        <path fill="#fff" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                      </svg>
                      Continue with Google
                    </>
                  )}
                </button>
              </div>
            )}
          </motion.div>
        )}

        {/* Step 2: Goal */}
        {step === 2 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-[#121215]/90 backdrop-blur-xl border border-[#27272A] rounded-xl p-6"
          >
            <h2 className="text-lg font-semibold mb-1">What's your primary fitness goal?</h2>
            <p className="text-[#71717A] text-sm mb-4">We'll tailor your workout plan to this goal.</p>
            <div className="grid gap-3">
              {GOALS.map(goal => (
                <button
                  key={goal.id}
                  onClick={() => setSelectedGoal(goal.id)}
                  className={`flex items-center gap-3 p-4 rounded-lg border text-left transition-all ${
                    selectedGoal === goal.id
                      ? 'bg-[#00A3FF]/10 border-[#00A3FF]/40'
                      : 'bg-[#16161A] border-[#27272A] hover:border-[#3f3f46]'
                  }`}
                >
                  <goal.icon className={`w-5 h-5 shrink-0 ${selectedGoal === goal.id ? 'text-[#00A3FF]' : 'text-[#71717A]'}`} />
                  <div className="flex-1">
                    <div className="font-medium text-sm">{goal.label}</div>
                    <div className="text-[#71717A] text-xs mt-0.5">{goal.description}</div>
                  </div>
                  {selectedGoal === goal.id && (
                    <Check className="w-5 h-5 text-[#00A3FF]" />
                  )}
                </button>
              ))}
            </div>
            {selectedGoalData && (
              <div className="mt-3 text-xs text-[#71717A] bg-[#16161A] rounded-lg px-3 py-2">
                <Info className="w-3.5 h-3.5 inline mr-1" />
                {selectedGoalData.description}
              </div>
            )}
          </motion.div>
        )}

        {/* Step 3: Level */}
        {step === 3 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-[#121215]/90 backdrop-blur-xl border border-[#27272A] rounded-xl p-6"
          >
            <h2 className="text-lg font-semibold mb-1">What's your experience level?</h2>
            <p className="text-[#71717A] text-sm mb-4">This helps us set appropriate intensity and complexity.</p>
            <div className="grid gap-3">
              {LEVELS.map(level => (
                <button
                  key={level.id}
                  onClick={() => setSelectedLevel(level.id)}
                  className={`flex items-center gap-3 p-4 rounded-lg border text-left transition-all ${
                    selectedLevel === level.id
                      ? 'bg-[#00A3FF]/10 border-[#00A3FF]/40'
                      : 'bg-[#16161A] border-[#27272A] hover:border-[#3f3f46]'
                  }`}
                >
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                    selectedLevel === level.id ? 'border-[#00A3FF]' : 'border-[#71717A]'
                  }`}>
                    {selectedLevel === level.id && <div className="w-2.5 h-2.5 rounded-full bg-[#00A3FF]" />}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-sm">{level.label}</div>
                    <div className="text-[#71717A] text-xs mt-0.5">{level.description}</div>
                  </div>
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {/* Step 4: Injuries */}
        {step === 4 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-[#121215]/90 backdrop-blur-xl border border-[#27272A] rounded-xl p-6"
          >
            <h2 className="text-lg font-semibold mb-1">Any injuries or pain points?</h2>
            <p className="text-[#71717A] text-sm mb-4">We'll avoid exercises that could aggravate them.</p>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {INJURY_PRESETS.map(injury => (
                <button
                  key={injury}
                  onClick={() => toggleInjury(injury)}
                  className={`px-3 py-2 rounded-lg border text-xs font-medium transition-all capitalize ${
                    injuries.includes(injury)
                      ? 'bg-[#F59E0B]/10 border-[#F59E0B]/30 text-[#F59E0B]'
                      : 'bg-[#16161A] border-[#27272A] text-[#A1A1AA] hover:border-[#3f3f46]'
                  }`}
                >
                  {injury === 'none' ? 'None' : injury.replace('_', ' ')}
                </button>
              ))}
            </div>
            {injuries.includes('none') ? (
              <p className="text-xs text-[#10B981] flex items-center gap-1">
                <Check className="w-3.5 h-3.5" /> No injuries noted — great!
              </p>
            ) : (
              <div className="text-xs text-[#71717A] bg-[#27272A]/50 rounded-lg px-3 py-2">
                <AlertTriangle className="w-3.5 h-3.5 inline mr-1" />
                We'll adapt your plan to avoid these areas.
              </div>
            )}
          </motion.div>
        )}

        {/* Step 5: Equipment */}
        {step === 5 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-[#121215]/90 backdrop-blur-xl border border-[#27272A] rounded-xl p-6"
          >
            <h2 className="text-lg font-semibold mb-1">What equipment do you have?</h2>
            <p className="text-[#71717A] text-sm mb-4">Select everything you can use for workouts.</p>
            <div className="grid grid-cols-2 gap-2">
              {EQUIPMENT_OPTIONS.map(equip => (
                <button
                  key={equip.id}
                  onClick={() => toggleEquipment(equip.id)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm transition-all ${
                    selectedEquipment.includes(equip.id)
                      ? 'bg-[#00A3FF]/10 border-[#00A3FF]/40 text-[#E4E4E7]'
                      : 'bg-[#16161A] border-[#27272A] text-[#A1A1AA] hover:border-[#3f3f46]'
                  }`}
                >
                  <equip.icon className="w-4 h-4 shrink-0" />
                  {equip.label}
                </button>
              ))}
            </div>
            {selectedEquipment.length > 0 && (
              <p className="text-xs text-[#71717A] mt-3">
                {selectedEquipment.length} selected — we'll use these for your workouts.
              </p>
            )}
          </motion.div>
        )}

        {/* Step 6: Schedule */}
        {step === 6 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-[#121215]/90 backdrop-blur-xl border border-[#27272A] rounded-xl p-6"
          >
            <h2 className="text-lg font-semibold mb-1">Your weekly schedule</h2>
            <p className="text-[#71717A] text-sm mb-4">How often and how long can you work out?</p>

            <div className="mb-4">
              <label className="text-sm font-medium mb-2 block">Days per week</label>
              <div className="grid grid-cols-5 gap-2">
                {DAYS_PER_WEEK_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setDaysPerWeek(opt.value)}
                    className={`p-3 rounded-lg border text-center transition-all ${
                      daysPerWeek === opt.value
                        ? 'bg-[#00A3FF]/10 border-[#00A3FF]/40'
                        : 'bg-[#16161A] border-[#27272A] hover:border-[#3f3f46]'
                    }`}
                  >
                    <div className="text-lg font-bold">{opt.label}</div>
                    <div className="text-xs text-[#71717A] mt-0.5 leading-tight">{opt.description}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Session duration</label>
              <div className="grid grid-cols-5 gap-2">
                {SESSION_DURATION_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setSessionDuration(opt.value)}
                    className={`p-3 rounded-lg border text-center transition-all ${
                      sessionDuration === opt.value
                        ? 'bg-[#00A3FF]/10 border-[#00A3FF]/40'
                        : 'bg-[#16161A] border-[#27272A] hover:border-[#3f3f46]'
                    }`}
                  >
                    <div className="text-lg font-bold">{opt.label}</div>
                    <div className="text-xs text-[#71717A] mt-0.5">{opt.description}</div>
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* Step 7: Focus areas */}
        {step === 7 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-[#121215]/90 backdrop-blur-xl border border-[#27272A] rounded-xl p-6"
          >
            <h2 className="text-lg font-semibold mb-1">Which areas do you want to focus on?</h2>
            <p className="text-[#71717A] text-sm mb-4">Select all that apply (we'll prioritize these in your plan).</p>
            <div className="flex flex-wrap gap-2">
              {FOCUS_AREAS.map(area => (
                <button
                  key={area.id}
                  onClick={() => toggleFocus(area.id)}
                  className={`px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                    selectedFocus.includes(area.id)
                      ? 'bg-[#00A3FF]/10 border-[#00A3FF]/40 text-[#00A3FF]'
                      : 'bg-[#16161A] border-[#27272A] text-[#A1A1AA] hover:border-[#3f3f46]'
                  }`}
                >
                  {area.label}
                </button>
              ))}
            </div>
            {selectedFocus.length > 0 && (
              <p className="text-xs text-[#71717A] mt-3">
                {selectedFocus.length} selected — your plan will emphasize these areas.
              </p>
            )}
          </motion.div>
        )}

        {/* Step 8: Biometrics */}
        {step === 8 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-[#121215]/90 backdrop-blur-xl border border-[#27272A] rounded-xl p-6"
          >
            <h2 className="text-lg font-semibold mb-1">Optional: Your biometrics</h2>
            <p className="text-[#71717A] text-sm mb-4">Helps with calorie and recovery recommendations. Skip if you prefer.</p>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-[#71717A] mb-1 block">Age</label>
                <input
                  type="number"
                  value={age}
                  onChange={e => setAge(e.target.value)}
                  placeholder="e.g. 30"
                  className="w-full px-3 py-2 bg-[#16161A] border border-[#27272A] rounded-lg text-sm text-[#E4E4E7] placeholder-[#71717A] focus:outline-none focus:border-[#00A3FF]/40"
                />
              </div>
              <div>
                <label className="text-xs text-[#71717A] mb-1 block">Weight (kg)</label>
                <input
                  type="number"
                  value={weight}
                  onChange={e => setWeight(e.target.value)}
                  placeholder="e.g. 75"
                  className="w-full px-3 py-2 bg-[#16161A] border border-[#27272A] rounded-lg text-sm text-[#E4E4E7] placeholder-[#71717A] focus:outline-none focus:border-[#00A3FF]/40"
                />
              </div>
              <div>
                <label className="text-xs text-[#71717A] mb-1 block">Height (cm)</label>
                <input
                  type="number"
                  value={height}
                  onChange={e => setHeight(e.target.value)}
                  placeholder="e.g. 175"
                  className="w-full px-3 py-2 bg-[#16161A] border border-[#27272A] rounded-lg text-sm text-[#E4E4E7] placeholder-[#71717A] focus:outline-none focus:border-[#00A3FF]/40"
                />
              </div>
            </div>
            <p className="text-xs text-[#71717A] mt-3">
              {age || weight || height ? 'Details saved — we can use these for personalized recommendations.' : 'Optional — you can add these later in settings.'}
            </p>
          </motion.div>
        )}

        {/* Step 8b: Special Mode */}
        {step === 8 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-[#121215]/90 backdrop-blur-xl border border-[#27272A] rounded-xl p-6"
          >
            <h2 className="text-lg font-semibold mb-1">Special mode (optional)</h2>
            <p className="text-[#71717A] text-sm mb-4">
              Do you have any special considerations that affect your training?
            </p>

            <div className="grid gap-2">
              {SPECIAL_MODES.map(mode => (
                <label
                  key={mode.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition ${
                    specialMode === mode.id
                      ? 'bg-[#00A3FF]/10 border-[#00A3FF]/40'
                      : 'bg-[#16161A] border-[#27272A] hover:border-[#3f3f46]'
                  }`}
                >
                  <div className={`mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${
                    specialMode === mode.id ? 'border-[#00A3FF] bg-[#00A3FF]' : 'border-[#27272A]'
                  }`}>
                    {specialMode === mode.id && (
                      <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    )}
                  </div>
                  <div>
                    <div className="text-sm font-medium">{mode.label}</div>
                    <div className="text-xs text-[#71717A] mt-0.5">{mode.description}</div>
                  </div>
                </label>
              ))}
            </div>
          </motion.div>
        )}

        {/* Step 9: Consent */}
        {step === 9 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-[#121215]/90 backdrop-blur-xl border border-[#27272A] rounded-xl p-6"
          >
            <h2 className="text-lg font-semibold mb-1">Health data & consent</h2>
            <p className="text-[#71717A] text-sm mb-4">Final step — review and confirm.</p>

            <div className="space-y-3">
              <label className="flex items-start gap-3 p-3 rounded-lg border border-[#27272A] bg-[#16161A] cursor-pointer hover:border-[#3f3f46] transition">
                <input
                  type="checkbox"
                  checked={healthDataConsent}
                  onChange={e => setHealthDataConsent(e.target.checked)}
                  className="mt-0.5 accent-[#00A3FF]"
                />
                <div>
                  <div className="text-sm font-medium">Connect health data (optional)</div>
                  <div className="text-xs text-[#71717A] mt-0.5">
                    Allow PolySync to access your Apple HealthKit or Google Fit data for recovery insights. We'll never share your health data with third parties.
                  </div>
                </div>
              </label>

              <label className="flex items-start gap-3 p-3 rounded-lg border border-[#27272A] bg-[#16161A] cursor-pointer hover:border-[#3f3f46] transition">
                <input
                  type="checkbox"
                  checked={disclaimerAccepted}
                  onChange={e => setDisclaimerAccepted(e.target.checked)}
                  className="mt-0.5 accent-[#00A3FF]"
                />
                <div>
                  <div className="text-sm font-medium">Disclaimer acceptance (required)</div>
                  <div className="text-xs text-[#71717A] mt-0.5">
                    I understand that PolySync provides fitness guidance, not medical advice. I'll consult a healthcare professional for injuries or medical conditions. I'm responsible for my own safety during workouts.
                  </div>
                </div>
              </label>
            </div>

            {disclaimerAccepted && (
              <div className="mt-4 p-3 bg-[#10B981]/5 border border-[#10B981]/20 rounded-lg text-xs text-[#10B981] flex items-start gap-2">
                <Check className="w-4 h-4 shrink-0 mt-0.5" />
                Disclaimer accepted. You're all set to start your fitness journey!
              </div>
            )}
          </motion.div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center gap-3 w-full max-w-xl">
        <button
          onClick={() => setStep(Math.max(1, step - 1))}
          disabled={step === 1}
          className="px-4 py-2 rounded-lg border border-[#27272A] text-sm text-[#A1A1AA] hover:bg-[#16161A] transition disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Back
        </button>

        <div className="flex-1" />

        {step < allSteps.length ? (
          <button
            onClick={() => setStep(step + 1)}
            disabled={!canGoNext()}
            className="px-6 py-2.5 bg-[#00A3FF] text-white rounded-lg font-medium hover:bg-[#00A3FF]/90 transition text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            Continue
            <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={handleComplete}
            disabled={!canGoNext() || isSaving}
            className="px-6 py-2.5 bg-[#10B981] text-white rounded-lg font-medium hover:bg-[#10B981]/90 transition text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isSaving ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <Check className="w-4 h-4" />
                Start My Plan
              </>
            )}
          </button>
        )}
      </div>

      {/* Footer disclaimer */}
      <p className="text-xs text-[#71717A] mt-8 text-center max-w-md leading-relaxed">
        PolySync provides AI-generated fitness guidance. Always listen to your body, warm up properly,
        and consult a healthcare professional if you have concerns about your health or injuries.
      </p>
    </div>
  );
}

type FitnessProfile = {
  uid: string;
  email: string;
  displayName: string;
  goal: 'strength' | 'hypertrophy' | 'endurance' | 'weight_loss' | 'general_fitness' | 'maintain';
  level: 'beginner' | 'intermediate' | 'advanced';
  injuries: string[];
  equipment: string[];
  daysPerWeek: number;
  sessionDuration: number;
  focus: string[];
  biometrics?: { age?: number; weight?: number; height?: number };
  healthDataConsent: boolean;
  disclaimerAccepted: boolean;
  specialMode?: string;
  createdAt: number;
  updatedAt: number;
};