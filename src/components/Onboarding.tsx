import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Slack, FileSpreadsheet, Lock, UserCheck, ShieldAlert, Cpu, Sparkles, Check, ChevronRight } from 'lucide-react';

interface OnboardingProps {
  onComplete: (config: {
    productName: string;
    productDescription: string;
    role: string;
    slackConnected: boolean;
    jiraConnected: boolean;
  }) => void;
}

const ROLES = [
  {
    id: 'CPO',
    title: 'Chief Product Officer (CPO)',
    description: 'Enforces ultimate priority gates, compliance overrides, and strategic sunset/pivot controls.',
    permissions: ['Sunset/Pivot Approve', 'Compliance Override', 'Kill Switch Activation', 'PRD Modifier'],
    color: 'border-[#27272A] hover:border-[#F59E0B]/50 bg-gradient-to-br from-[#16161A] to-[#0F0F12] text-[#E4E4E7]',
    iconColor: 'text-[#F59E0B]',
  },
  {
    id: 'Group PM',
    title: 'Group Product Manager',
    description: 'Bridges strategies across multiple domains. Approves opportunity ranking and SRE rollbacks.',
    permissions: ['Approve Rollback', 'Approve Opportunity Scoring', 'PRD Modifier', 'View Dashboards'],
    color: 'border-[#27272A] hover:border-[#00A3FF]/50 bg-gradient-to-br from-[#16161A] to-[#0F0F12] text-[#E4E4E7]',
    iconColor: 'text-[#00A3FF]',
  },
  {
    id: 'PM',
    title: 'Product Manager (PM)',
    description: 'Executes standard release tracks, conducts opportunity prioritizations, and reviews auto-generated PRDs.',
    permissions: ['Approve Rollback', 'Modify PRD', 'Run Workflow Lanes', 'View Dashboards'],
    color: 'border-[#27272A] hover:border-[#10B981]/50 bg-gradient-to-br from-[#16161A] to-[#0F0F12] text-[#E4E4E7]',
    iconColor: 'text-[#10B981]',
  },
  {
    id: 'Product Ops',
    title: 'Product Operations',
    description: 'Audits multi-agent execution statistics, cost meters, and monitors global Route53 telemetry metrics.',
    permissions: ['View Dashboards', 'Audit Execution Logs', 'Trace API Latencies'],
    color: 'border-[#27272A] hover:border-[#A1A1AA]/50 bg-gradient-to-br from-[#16161A] to-[#0F0F12] text-[#E4E4E7]',
    iconColor: 'text-[#A1A1AA]',
  },
];

export function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState(1);
  const [authProvider, setAuthProvider] = useState<'slack' | 'google' | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [selectedRole, setSelectedRole] = useState('PM');
  const [slackConnected, setSlackConnected] = useState(false);
  const [jiraConnected, setJiraConnected] = useState(false);
  const [productName, setProductName] = useState('Nexus Retail Hub');
  const [productDescription, setProductDescription] = useState('An omnichannel workspace automating product lifecycle, multi-region syncing, and GDPR compliance checks.');
  const [isPreparing, setIsPreparing] = useState(false);

  const startAuthentication = (provider: 'slack' | 'google') => {
    setIsAuthenticating(true);
    setAuthProvider(provider);
    setTimeout(() => {
      setIsAuthenticating(false);
      setStep(2);
    }, 1500);
  };

  const handleConnectJira = () => {
    setJiraConnected(true);
  };

  const handleConnectSlack = () => {
    setSlackConnected(true);
  };

  const handleCompleteOnboarding = () => {
    setIsPreparing(true);
    setTimeout(() => {
      onComplete({
        productName,
        productDescription,
        role: selectedRole,
        slackConnected,
        jiraConnected,
      });
    }, 2000);
  };

  return (
    <div className="min-h-screen bg-[#0C0C0E] text-[#E4E4E7] flex items-center justify-center p-4 md:p-8 selection:bg-[#00A3FF]/30 selection:text-[#E4E4E7] border-[10px] border-[#1A1A1E]">
      {/* Background radial effects */}
      <div className="absolute top-0 left-0 right-0 h-[500px] bg-gradient-to-b from-[#00A3FF]/5 via-[#00A3FF]/2 to-transparent blur-3xl pointer-events-none" />
      
      <div className="w-full max-w-4xl relative z-10 bg-gradient-to-br from-[#16161A] to-[#0F0F12] border border-[#27272A] rounded-2xl shadow-2xl p-6 md:p-10">
        
        {/* Step Indicators */}
        <div className="flex items-center justify-between mb-8 pb-4 border-b border-[#27272A]">
          <div className="flex items-center space-x-2">
            <Cpu className="w-5 h-5 text-[#00A3FF] animate-pulse" />
            <span className="font-mono text-xs tracking-widest uppercase text-[#71717A]">PolyVerses Gateways</span>
          </div>
          <div className="flex space-x-2">
            {[1, 2, 3, 4].map((s) => (
              <div
                key={s}
                className={`h-1 rounded-full transition-all duration-300 ${
                  step === s ? 'w-8 bg-[#00A3FF]' : step > s ? 'w-4 bg-[#10B981]' : 'w-4 bg-[#27272A]'
                }`}
              />
            ))}
          </div>
        </div>

        <AnimatePresence mode="wait">
          {/* STEP 1: Corporate SSO Gateway */}
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.3 }}
              className="text-center py-6"
            >
              <h1 className="text-3xl md:text-4xl font-sans font-bold tracking-tight mb-3 text-[#F4F4F5]">
                Secure Second-Brain Access Portal
              </h1>
              <p className="text-[#A1A1AA] text-sm md:text-base max-w-xl mx-auto mb-8 leading-relaxed">
                PolyVerses orchestrates 23 specialized agent routines behind enterprise SSO directories, logging all operations onto state-preserved ledgers.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-lg mx-auto">
                <button
                  onClick={() => startAuthentication('slack')}
                  disabled={isAuthenticating}
                  className="flex items-center justify-center space-x-3 px-6 py-4 bg-[#121215]/60 hover:bg-[#16161A] hover:border-[#F59E0B]/50 border border-[#27272A] rounded-xl font-medium transition cursor-pointer disabled:opacity-50 group"
                >
                  <Slack className="w-5 h-5 text-[#F59E0B] group-hover:scale-105 transition" />
                  <span>Log in with Slack Business</span>
                </button>
                <button
                  onClick={() => startAuthentication('google')}
                  disabled={isAuthenticating}
                  className="flex items-center justify-center space-x-3 px-6 py-4 bg-[#121215]/60 hover:bg-[#16161A] hover:border-[#00A3FF]/50 border border-[#27272A] rounded-xl font-medium transition cursor-pointer disabled:opacity-50 group"
                >
                  <Lock className="w-5 h-5 text-[#00A3FF] group-hover:scale-105 transition" />
                  <span>Log in with Google Workspace</span>
                </button>
              </div>

              {isAuthenticating && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="mt-8 flex flex-col items-center justify-center"
                >
                  <div className="w-6 h-6 rounded-full border-2 border-[#27272A] border-t-[#00A3FF] animate-spin mb-3" />
                  <span className="font-mono text-xs text-[#00A3FF]">Authenticating with Identity Provider ({authProvider})...</span>
                </motion.div>
              )}
            </motion.div>
          )}

          {/* STEP 2: RBAC Role Selection */}
          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="py-1"
            >
              <h2 className="text-2xl md:text-3xl font-sans font-bold tracking-tight mb-2 text-center text-[#F4F4F5]">
                Configure Persona Authorization Matrix
              </h2>
              <p className="text-[#A1A1AA] text-sm mb-6 text-center max-w-xl mx-auto leading-relaxed">
                User roles directly govern dynamic approval authority. PolyVerses enforces state-locked exceptions based on your designated persona.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                {ROLES.map((role) => (
                  <button
                    key={role.id}
                    onClick={() => setSelectedRole(role.id)}
                    className={`flex flex-col text-left p-4 rounded-xl border transition duration-200 cursor-pointer relative ${role.color} ${
                      selectedRole === role.id ? 'ring-1 ring-[#00A3FF] border-[#00A3FF] !bg-[#00A3FF]/5' : 'opacity-85'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-2">
                      <span className="font-semibold text-[#E4E4E7] text-sm">{role.title}</span>
                      {selectedRole === role.id && <Check className="w-4 h-4 text-[#00A3FF]" />}
                    </div>
                    <p className="text-xs text-[#A1A1AA] mb-3 leading-relaxed">{role.description}</p>
                    <div className="flex flex-wrap gap-1 mt-auto">
                      {role.permissions.map((p, idx) => (
                        <span key={idx} className="text-[10px] font-mono px-2 py-0.5 bg-[#121215] border border-[#27272A] text-[#71717A] rounded">
                          {p}
                        </span>
                      ))}
                    </div>
                  </button>
                ))}
              </div>

              <div className="flex justify-between items-center mt-6">
                <button
                  onClick={() => setStep(1)}
                  className="px-4 py-2 border border-[#27272A] hover:bg-[#121215] rounded-lg text-sm text-[#71717A] transition cursor-pointer"
                >
                  Back
                </button>
                <button
                  onClick={() => setStep(3)}
                  className="px-6 py-2.5 bg-[#00A3FF] hover:bg-[#00A3FF]/90 text-black font-bold uppercase tracking-wider rounded-lg text-xs transition flex items-center space-x-2 cursor-pointer shadow-lg shadow-[#00A3FF]/10"
                >
                  <span>Confirm Authority Matrix</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}

          {/* STEP 3: Enterprise App Connectors */}
          {step === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="py-1 text-center"
            >
              <h2 className="text-2xl md:text-3xl font-sans font-bold tracking-tight mb-2 text-[#F4F4F5]">
                Simulated OAuth Connections
              </h2>
              <p className="text-[#A1A1AA] text-sm max-w-xl mx-auto mb-8 leading-relaxed">
                Connect external signal databases. PolyVerses syncs Jira backlogs and listens to Slack channels for proactive roadmap alerts.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-xl mx-auto mb-8">
                {/* Connector card: Slack */}
                <div className="p-5 bg-gradient-to-br from-[#16161A] to-[#0F0F12] border border-[#27272A] rounded-xl flex flex-col items-center">
                  <Slack className="w-10 h-10 text-[#F59E0B] mb-3" />
                  <span className="font-semibold text-[#E4E4E7] mb-1">Slack Connect</span>
                  <p className="text-xs text-[#A1A1AA] text-center mb-4 leading-relaxed">
                    Harvests customer signals and launches real-time direction cards right to product squads.
                  </p>
                  <button
                    onClick={handleConnectSlack}
                    className={`w-full py-2 px-4 rounded-lg font-medium text-xs font-mono uppercase tracking-wider transition cursor-pointer flex items-center justify-center space-x-1.5 ${
                      slackConnected
                        ? 'bg-[#10B981]/10 text-[#10B981] border border-[#10B981]/30'
                        : 'bg-[#27272A] hover:bg-[#3F3F46] text-[#E4E4E7]'
                    }`}
                  >
                    {slackConnected ? (
                      <>
                        <Check className="w-4 h-4 animate-bounce" />
                        <span>Connected to Slack API</span>
                      </>
                    ) : (
                      <span>Authorize Slack Sync</span>
                    )}
                  </button>
                </div>

                {/* Connector card: Jira */}
                <div className="p-5 bg-gradient-to-br from-[#16161A] to-[#0F0F12] border border-[#27272A] rounded-xl flex flex-col items-center">
                  <FileSpreadsheet className="w-10 h-10 text-[#00A3FF] mb-3" />
                  <span className="font-semibold text-[#E4E4E7] mb-1">Jira Enterprise Broker</span>
                  <p className="text-xs text-[#A1A1AA] text-center mb-4 leading-relaxed">
                    Auto-populates work items, epics, and coordinates deployment boards with SRE telemetry scopes.
                  </p>
                  <button
                    onClick={handleConnectJira}
                    className={`w-full py-2 px-4 rounded-lg font-medium text-xs font-mono uppercase tracking-wider transition cursor-pointer flex items-center justify-center space-x-1.5 ${
                      jiraConnected
                        ? 'bg-[#10B981]/10 text-[#10B981] border border-[#10B981]/30'
                        : 'bg-[#27272A] hover:bg-[#3F3F46] text-[#E4E4E7]'
                    }`}
                  >
                    {jiraConnected ? (
                      <>
                        <Check className="w-4 h-4 animate-bounce" />
                        <span>Connected to Jira API</span>
                      </>
                    ) : (
                      <span>Authorize Jira Sync</span>
                    )}
                  </button>
                </div>
              </div>

              <div className="flex justify-between items-center mt-6">
                <button
                  onClick={() => setStep(2)}
                  className="px-4 py-2 border border-[#27272A] hover:bg-[#121215] rounded-lg text-sm text-[#71717A] cursor-pointer"
                >
                  Back
                </button>
                <button
                  onClick={() => setStep(4)}
                  className="px-6 py-2.5 bg-[#00A3FF] hover:bg-[#00A3FF]/90 text-black font-bold uppercase tracking-wider rounded-lg text-xs transition flex items-center space-x-2 cursor-pointer shadow-lg shadow-[#00A3FF]/10"
                >
                  <span>Build Virtual Brain</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}

          {/* STEP 4: Product info */}
          {step === 4 && (
            <motion.div
              key="step4"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="py-1"
            >
              <h2 className="text-2xl md:text-3xl font-sans font-bold tracking-tight mb-2 text-center flex items-center justify-center space-x-2 text-[#F4F4F5]">
                <Sparkles className="w-5 h-5 text-[#00A3FF]" />
                <span>Initialize Target Product Brain</span>
              </h2>
              <p className="text-[#A1A1AA] text-sm mb-6 text-center max-w-xl mx-auto leading-relaxed">
                Define the core digital product segment. PolyVerses builds memory vectors and maps relationships dynamically through Neo4j nodes.
              </p>

              <div className="bg-[#121215] border border-[#27272A] rounded-xl p-5 mb-6 space-y-4 shadow-inner">
                <div>
                  <label className="block text-[10px] font-mono tracking-wider text-[#A1A1AA] uppercase mb-1.5 font-semibold">Digital Product Name</label>
                  <input
                    type="text"
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    className="w-full bg-[#0C0C0E] border border-[#27272A] rounded-lg px-4 py-2.5 text-[#E4E4E7] focus:outline-none focus:ring-1 focus:ring-[#00A3FF] font-sans text-sm"
                    placeholder="Enter product title..."
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-mono tracking-wider text-[#A1A1AA] uppercase mb-1.5 font-semibold">Core Strategic Segment</label>
                  <textarea
                    rows={3}
                    value={productDescription}
                    onChange={(e) => setProductDescription(e.target.value)}
                    className="w-full bg-[#0C0C0E] border border-[#27272A] rounded-lg px-4 py-2.5 text-[#E4E4E7] focus:outline-none focus:ring-1 focus:ring-[#00A3FF] font-sans text-sm leading-relaxed"
                    placeholder="Briefly state target goals, customer base and technical scopes..."
                  />
                </div>
              </div>

              {/* Listening proactive feedback segment */}
              <div className="p-4 bg-[#00A3FF]/5 border border-[#00A3FF]/20 rounded-xl flex items-start space-x-3 mb-6">
                <div className="p-1 px-1.5 bg-[#00A3FF]/10 text-[#00A3FF] rounded-lg shrink-0 flex items-center justify-center mt-0.5 border border-[#00A3FF]/20">
                  <Cpu className="w-4 h-4 animate-spin [animation-duration:8s]" />
                </div>
                <div>
                  <span className="text-xs font-mono text-[#00A3FF] font-semibold uppercase tracking-wider block">PolyVerses Proactive Broker Listening...</span>
                  <p className="text-xs text-[#A1A1AA] mt-1 leading-relaxed">
                    Proactive roadmap scan is running. Once launched, you will have access to the full **23 Agent network**, telemetry meters, compliance guards, and interactive command consoles.
                  </p>
                </div>
              </div>

              <div className="flex justify-between items-center mt-6">
                <button
                  onClick={() => setStep(3)}
                  className="px-4 py-2 border border-[#27272A] hover:bg-[#121215] rounded-lg text-sm text-[#71717A] cursor-pointer disabled:opacity-50"
                  disabled={isPreparing}
                >
                  Back
                </button>
                <button
                  onClick={handleCompleteOnboarding}
                  disabled={isPreparing || !productName.trim()}
                  className="px-6 py-2.5 bg-[#00A3FF] hover:bg-[#00A3FF]/90 text-black font-bold uppercase tracking-wider rounded-lg text-xs transition flex items-center space-x-2 cursor-pointer disabled:opacity-50 shadow-lg shadow-[#00A3FF]/10"
                >
                  {isPreparing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-black border-t-transparent animate-spin rounded-full" />
                      <span>Readying Suite Environment...</span>
                    </>
                  ) : (
                    <>
                      <span>Generate Orchestrator Workbench</span>
                      <ChevronRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
