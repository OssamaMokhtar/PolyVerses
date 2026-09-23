import { useState, useEffect } from 'react';
import { Onboarding } from './components/Onboarding';
import { OrchestrationConsole } from './components/OrchestrationConsole';
import { CodeBrowser } from './components/CodeBrowser';
import { PromptConsole } from './components/PromptConsole';
import { ObservabilityDashboard } from './components/ObservabilityDashboard';
import { 
  Terminal, FolderCode, Sparkles, Activity, Shield, Slack, FileSpreadsheet, Radio, Cpu, LogOut
} from 'lucide-react';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

export default function App() {
  const [onboarded, setOnboarded] = useState(false);
  const [productConfig, setProductConfig] = useState({
    productName: 'Nexus Retail Hub',
    productDescription: 'An omnichannel workspace isolating payment queues, syncing data repositories, and verifying user consent terms.',
    role: 'PM',
    slackConnected: false,
    jiraConnected: false,
  });

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'workbench' | 'codebase' | 'prompts' | 'observability'>('workbench');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        try {
          const userDocRef = doc(db, 'users', user.uid);
          const docSnap = await getDoc(userDocRef);
          if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.productConfig) {
              setProductConfig(data.productConfig);
              setOnboarded(true);
            }
          }
        } catch (err) {
          console.error("Failed to load user profile:", err);
        }
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleOnboardingComplete = async (config: typeof productConfig) => {
    setProductConfig(config);
    setOnboarded(true);

    if (auth.currentUser) {
      try {
        const userRef = doc(db, 'users', auth.currentUser.uid);
        await setDoc(userRef, {
          uid: auth.currentUser.uid,
          email: auth.currentUser.email || '',
          displayName: auth.currentUser.displayName || '',
          productConfig: config,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `users/${auth.currentUser.uid}`);
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0C0C0E] text-[#E4E4E7] flex flex-col items-center justify-center p-4 border-[10px] border-[#1A1A1E]">
        <Cpu className="w-10 h-10 text-[#00A3FF] animate-spin mb-4" />
        <span className="font-mono text-xs text-[#00A3FF] tracking-widest uppercase">Loading PolyVerses Secure Node...</span>
      </div>
    );
  }

  if (!onboarded) {
    return <Onboarding currentUser={currentUser} onComplete={handleOnboardingComplete} />;
  }

  return (
    <div className="min-h-screen bg-[#0C0C0E] text-[#E4E4E7] flex flex-col selection:bg-[#00A3FF]/30 selection:text-[#E4E4E7] p-2 md:p-4 border-[6px] md:border-[10px] border-[#1A1A1E] font-sans relative">
      
      {/* Dynamic Background visual ornaments */}
      <div className="absolute top-0 left-0 right-0 h-[250px] bg-gradient-to-b from-[#00A3FF]/5 via-transparent to-transparent blur-3xl pointer-events-none" />

      {/* Header Bar */}
      <header className="bg-[#121215]/90 backdrop-blur-xl border border-[#27272A] px-6 py-4 rounded-xl z-30 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl">
        
        {/* Core title and product flag */}
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-[#00A3FF]/10 text-[#00A3FF] border border-[#00A3FF]/20 rounded-lg shrink-0">
            <Cpu className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold tracking-wider uppercase font-mono text-[#F4F4F5]">PolyVerses</h1>
              <span className="text-[9px] font-bold font-mono text-[#60C5FF] px-1.5 py-0.5 bg-[#00A3FF]/10 border border-[#00A3FF]/30 rounded">
                SECURE
              </span>
            </div>
            <span className="text-xs text-[#71717A] font-sans block truncate max-w-[240px] sm:max-w-none">
              Second-Brain: <span className="text-[#E4E4E7] font-medium">{productConfig.productName}</span>
            </span>
          </div>
        </div>

        {/* Integration socket locks & user authorization */}
        <div className="flex items-center flex-wrap gap-2.5 self-end sm:self-auto">
          
          {/* Active User Authority */}
          <div className="status-pill text-[#60C5FF] px-3 py-1 flex items-center space-x-1.5 bg-[#00A3FF]/10 border border-[#00A3FF]/30 rounded">
            <Shield className="w-3.5 h-3.5" />
            <span>Role: <strong className="text-[#E4E4E7]">{productConfig.role}</strong></span>
          </div>

          {/* Slack Connection state */}
          <div className={`status-pill flex items-center justify-center px-2 py-1 ${
            productConfig.slackConnected ? '!text-[#F59E0B] !bg-[#F59E0B]/10 !border-[#F59E0B]/30' : '!text-[#71717A]/80 !bg-[#16161A]/40 !border-[#27272A]'
          }`} title={productConfig.slackConnected ? 'Slack Webhook Socket Active' : 'Slack Socket Off'}>
            <Slack className="w-4 h-4 shrink-0 mr-1" />
            <span>Slack</span>
          </div>

          {/* Jira Connection state */}
          <div className={`status-pill flex items-center justify-center px-2 py-1 ${
            productConfig.jiraConnected ? '!text-[#00A3FF] !bg-[#00A3FF]/10 !border-[#00A3FF]/30' : '!text-[#71717A]/80 !bg-[#16161A]/40 !border-[#27272A]'
          }`} title={productConfig.jiraConnected ? 'Jira Broker Active' : 'Jira Socket Off'}>
            <FileSpreadsheet className="w-4 h-4 shrink-0 mr-1" />
            <span>Jira</span>
          </div>

          {/* System Status online */}
          <div className="status-pill !text-[#10B981] !bg-[#10B981]/10 !border-[#10B981]/30 px-3 py-1 flex items-center space-x-1 animate-pulse font-bold">
            <Radio className="w-3 h-3 shrink-0" />
            <span>ONLINE</span>
          </div>

          {/* Real Firebase Logout Button */}
          {currentUser && (
            <button
              onClick={async () => {
                await signOut(auth);
                setOnboarded(false);
                setProductConfig({
                  productName: 'Nexus Retail Hub',
                  productDescription: 'An omnichannel workspace isolating payment queues, syncing data repositories, and verifying user consent terms.',
                  role: 'PM',
                  slackConnected: false,
                  jiraConnected: false,
                });
              }}
              className="status-pill text-[#EF4444] px-2.5 py-1 flex items-center space-x-1 bg-[#EF4444]/10 border border-[#EF4444]/30 rounded cursor-pointer hover:bg-[#EF4444]/20 transition text-xs font-medium font-sans"
              title="Sign Out of PolyVerses Session"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Log Out</span>
            </button>
          )}
        </div>
      </header>

      {/* Primary Workspace Navigation Tabs */}
      <div className="my-4 bg-[#121215]/50 border border-[#27272A] p-1.5 rounded-xl flex items-center space-x-2 overflow-x-auto whitespace-nowrap scrollbar-none shadow-md">
        
        {/* Command workbench tab */}
        <button
          onClick={() => setActiveTab('workbench')}
          className={`flex items-center space-x-1.5 px-4 py-2 rounded-lg font-sans font-medium text-xs tracking-wide uppercase transition duration-150 cursor-pointer ${
            activeTab === 'workbench'
              ? 'bg-[#00A3FF]/15 text-[#00A3FF] border border-[#00A3FF]/30 shadow-inner'
              : 'text-[#71717A] border border-transparent hover:text-[#E4E4E7]'
          }`}
        >
          <Terminal className="w-3.5 h-3.5" />
          <span>Command Desk</span>
        </button>

        {/* Source Repository tab */}
        <button
          onClick={() => setActiveTab('codebase')}
          className={`flex items-center space-x-1.5 px-4 py-2 rounded-lg font-sans font-medium text-xs tracking-wide uppercase transition duration-150 cursor-pointer ${
            activeTab === 'codebase'
              ? 'bg-[#00A3FF]/15 text-[#00A3FF] border border-[#00A3FF]/30 shadow-inner'
              : 'text-[#71717A] border border-transparent hover:text-[#E4E4E7]'
          }`}
        >
          <FolderCode className="w-3.5 h-3.5" />
          <span>Source Code</span>
        </button>

        {/* System promts catalog */}
        <button
          onClick={() => setActiveTab('prompts')}
          className={`flex items-center space-x-1.5 px-4 py-2 rounded-lg font-sans font-medium text-xs tracking-wide uppercase transition duration-150 cursor-pointer ${
            activeTab === 'prompts'
              ? 'bg-[#00A3FF]/15 text-[#00A3FF] border border-[#00A3FF]/30 shadow-inner'
              : 'text-[#71717A] border border-transparent hover:text-[#E4E4E7]'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>System Prompts</span>
        </button>

        {/* Observability center */}
        <button
          onClick={() => setActiveTab('observability')}
          className={`flex items-center space-x-1.5 px-4 py-2 rounded-lg font-sans font-medium text-xs tracking-wide uppercase transition duration-150 cursor-pointer ${
            activeTab === 'observability'
              ? 'bg-[#00A3FF]/15 text-[#00A3FF] border border-[#00A3FF]/30 shadow-inner'
              : 'text-[#71717A] border border-transparent hover:text-[#E4E4E7]'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span>OTel Diagnostics</span>
        </button>

      </div>

      {/* Main Sandbox Layout Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto pb-8 z-10">
        
        {activeTab === 'workbench' && (
          <OrchestrationConsole 
            productName={productConfig.productName} 
            productDescription={productConfig.productDescription} 
            activeRole={productConfig.role}
          />
        )}

        {activeTab === 'codebase' && (
          <CodeBrowser />
        )}

        {activeTab === 'prompts' && (
          <PromptConsole />
        )}

        {activeTab === 'observability' && (
          <ObservabilityDashboard />
        )}

      </main>

      {/* Static Footer */}
      <footer className="bg-[#0C0C0E] border-t border-[#27272A] pt-4 pb-1 text-center text-[10px] font-mono text-[#71717A] uppercase tracking-wider flex flex-col md:flex-row justify-between items-center gap-2">
        <span>PolyVerses Enterprise Environment • Active SRE Core Sync</span>
        <span className="text-[#00A3FF]">Observability Stream Active • RTO: 0.8ms</span>
      </footer>

    </div>
  );
}
