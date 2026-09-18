import { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Sparkles, Paperclip, AlertCircle } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { FitnessProfile } from '../types';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  agentId?: string;
  contextSnapshot?: any;
}

interface CoachingChatProps {
  profile: FitnessProfile | null;
  currentPlanId?: string;
  recentWorkoutIds?: string[];
  recoveryScore?: number;
  onClearChat?: () => void;
}

const QUICK_ACTIONS = [
  { label: 'What should I eat?', prompt: 'What should I eat today given my goals?' },
  { label: 'My knee hurts', prompt: 'I have knee pain during squats. What should I do?' },
  { label: 'Why am I stuck?', prompt: 'I feel like I\'m not making progress. What should I change?' },
  { label: 'Motivate me', prompt: 'I don\'t feel like working out today. Give me a push.' },
  { label: 'Explain progressive overload', prompt: 'Explain progressive overload and how to apply it to my workouts.' },
];

export function CoachingChat({
  profile,
  currentPlanId,
  recentWorkoutIds,
  recoveryScore,
  onClearChat,
}: CoachingChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { currentUser } = useAuth();
  const chatSessionId = useRef<string | null>(null);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Load chat history on mount
  useEffect(() => {
    if (!currentUser) return;
    fetchChatHistory();
  }, [currentUser]);

  const fetchChatHistory = async () => {
    try {
      const res = await fetch('/api/fitness/chat-history', {
        headers: { 'x-user-id': currentUser!.uid }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.messages) {
          setMessages(data.messages);
          chatSessionId.current = data.sessionId || null;
        }
      }
    } catch (err) {
      console.error('Failed to load chat history:', err);
    }
  };

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || sending || !currentUser) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text.trim(),
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setSending(true);
    setError(null);

    // Build context for the coach
    const context = {
      profile: profile || null,
      currentPlanId,
      recentWorkoutIds,
      recoveryScore,
      wearableDataAgeHours: undefined,
    };

    try {
      const res = await fetch('/api/fitness/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': currentUser.uid,
        },
        body: JSON.stringify({
          message: text.trim(),
          sessionId: chatSessionId.current || undefined,
          context,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to send message');
      }

      const data = await res.json();
      chatSessionId.current = data.sessionId || chatSessionId.current;

      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.response || 'Sorry, I couldn\'t generate a response.',
        timestamp: Date.now(),
        agentId: data.agentId || 'F06',
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      // Add error message as system message
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'system',
        content: '⚠️ ' + (err instanceof Error ? err.message : 'Something went wrong'),
        timestamp: Date.now(),
      }]);
    } finally {
      setSending(false);
    }
  }, [currentUser, sending, profile, currentPlanId, recentWorkoutIds, recoveryScore]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      sendMessage(input);
    }
  };

  const handleQuickAction = (prompt: string) => {
    setInput(prompt);
    // Auto-send after a brief delay so user sees the input
    setTimeout(() => sendMessage(prompt), 100);
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#00A3FF]/10 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-[#00A3FF]" />
          </div>
          <div>
            <h2 className="text-sm font-semibold">Coach Chat</h2>
            <div className="text-xs text-[#71717A]">AI fitness coaching</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <button
              onClick={fetchChatHistory}
              className="text-xs text-[#71717A] hover:text-[#E4E4E7] px-2 py-1 rounded transition"
              title="Refresh"
            >
              ↻ Refresh
            </button>
          )}
          {messages.length > 0 && onClearChat && (
            <button
              onClick={onClearChat}
              className="text-xs text-[#EF4444] hover:bg-[#EF4444]/10 px-2 py-1 rounded transition"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Quick actions */}
      {messages.length === 0 && (
        <div className="bg-[#121215]/90 backdrop-blur-xl border border-[#27272A] rounded-xl p-4 mb-4">
          <div className="text-xs text-[#71717A] font-medium mb-3 uppercase tracking-wide">Quick Questions</div>
          <div className="grid grid-cols-2 gap-2">
            {QUICK_ACTIONS.map((action, idx) => (
              <button
                key={idx}
                onClick={() => handleQuickAction(action.prompt)}
                className="text-left px-3 py-2.5 bg-[#16161A] border border-[#27272A] rounded-lg text-sm text-[#E4E4E7] hover:border-[#00A3FF]/30 hover:bg-[#1A1A1E] transition"
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 mb-4 scrollbar-thin">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <Sparkles className="w-12 h-12 text-[#3f3f46] mb-4" />
            <h3 className="text-sm font-medium text-[#A1A1AA] mb-1">Start a conversation</h3>
            <p className="text-xs text-[#52525B] max-w-xs">
              Ask about your workout, nutrition, recovery, form, or just need motivation.
            </p>
          </div>
        ) : (
          messages.map(message => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {message.role === 'assistant' && message.agentId && (
                <div className="mb-1 mr-2 text-[10px] text-[#71717A] font-medium uppercase tracking-wide">
                  {message.agentId}
                </div>
              )}
              <div className={`max-w-[85%] rounded-xl px-3.5 py-2.5 ${
                message.role === 'user'
                  ? 'bg-[#00A3FF] text-white rounded-br-sm'
                  : message.role === 'system'
                  ? 'bg-[#F59E0B]/10 text-[#F59E0B] border border-[#F59E0B]/20 rounded-none'
                  : 'bg-[#16161A] border border-[#27272A] text-[#E4E4E7] rounded-bl-sm'
              }`}>
                {message.role === 'system' && <AlertCircle className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />}
                <div className="text-sm whitespace-pre-wrap">{message.content}</div>
                <div className={`text-[10px] mt-1 ${message.role === 'user' ? 'text-white/60' : 'text-[#52525B]'} text-right`}>
                  {formatTime(message.timestamp)}
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Error */}
      {error && (
        <div className="mb-3 px-3 py-2 bg-[#EF4444]/10 border border-[#EF4444]/20 rounded-lg text-xs text-[#EF4444]">
          {error}
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSend} className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Ask your coach anything..."
          disabled={sending}
          className="flex-1 px-3 py-2.5 bg-[#121215] border border-[#27272A] rounded-lg text-sm text-[#E4E4E7] placeholder-[#52525B] focus:outline-none focus:border-[#00A3FF]/40 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!input.trim() || sending}
          className={`w-10 h-10 rounded-lg flex items-center justify-center transition ${
            input.trim() && !sending
              ? 'bg-[#00A3FF] text-white hover:bg-[#00A3FF]/90'
              : 'bg-[#27272A] text-[#52525B] cursor-not-allowed'
          }`}
        >
          <Send className="w-4 h-4" />
        </button>
      </form>

      <div className="mt-2 text-[10px] text-[#52525B] text-center">
        PolySync AI Coach · Not a substitute for professional medical advice.
      </div>
    </div>
  );
}
