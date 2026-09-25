import { useState, useRef, useEffect, useCallback } from 'react';

interface CoachChatProps {
  profile: FitnessProfile | null;
  recentWorkouts: WorkoutLogData[];
  currentPlan: WeeklyPlanData | null;
  onSendMessage: (message: string) => Promise<ChatResponse>;
  loading?: boolean;
  chatLanguage?: string;
}

interface FitnessProfile {
  goal: string;
  level: string;
  injuries: string[];
  equipment: string[];
  daysPerWeek: number;
  sessionDuration: number;
}

interface WorkoutLogData {
  workoutId: string;
  date: string;
  workoutName: string;
  focus: string;
  completedSets: CompletedSet[];
  totalVolume: number;
  duration: number;
  rpe: number;
}

interface CompletedSet {
  exerciseId: string;
  exerciseName: string;
  setNumber: number;
  reps: number;
  weight: number;
  rpe: number;
}

interface WeeklyPlanData {
  weekNumber: number;
  startDate: string;
  endDate: string;
  days: DayData[];
}

interface DayData {
  dayIndex: number;
  date: string;
  workouts: WorkoutPreview[];
}

interface WorkoutPreview {
  workoutId: string;
  workoutName: string;
  focus: string;
  duration: number;
  exerciseCount: number;
}

interface ChatResponse {
  reply: string;
  agentId: string;
  suggestions?: string[];
  responseTime?: number;
}

export function CoachChat({ profile, recentWorkouts, currentPlan, onSendMessage, loading, chatLanguage }: CoachChatProps) {
  const [messages, setMessages] = useState<{ role: 'user' | 'coach'; text: string; timestamp: string; suggestions?: string[]; responseTime?: number }[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [streamingStart, setStreamingStart] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  const quickQuestions = [
    "How should I adjust my workout today?",
    "What should I eat post-workout?",
    "Why am I not seeing progress?",
    "Can you explain my workout plan?",
    "Is this exercise safe with my injuries?",
    "How do I improve my form?",
  ];

  // Non-streaming send (existing behavior)
  const handleSend = useCallback(async () => {
    if (!input.trim() || sending) return;
    const userMessage = input.trim();
    setInput('');
    setSending(true);

    const start = performance.now();

    setMessages(prev => [...prev, { role: 'user', text: userMessage, timestamp: new Date().toISOString() }]);

    try {
      const response = await onSendMessage(userMessage);
      const elapsed = Math.round(performance.now() - start);

      const coachMsg = {
        role: 'coach' as const,
        text: response.reply,
        timestamp: new Date().toISOString(),
        suggestions: response.suggestions,
        responseTime: response.responseTime || elapsed,
      };
      setMessages(prev => [...prev, coachMsg]);
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'coach' as const,
        text: "I'm sorry, I couldn't reach the AI coach right now. Please try again in a moment.",
        timestamp: new Date().toISOString(),
      }]);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }, [input, sending, onSendMessage]);

  // Streaming send via SSE
  const handleStreamSend = useCallback(async () => {
    if (!input.trim() || sending) return;
    const userMessage = input.trim();
    setInput('');
    setSending(true);
    setStreamingText('');

    const start = performance.now();
    setStreamingStart(start);

    setMessages(prev => [...prev, { role: 'user', text: userMessage, timestamp: new Date().toISOString() }]);

    try {
      const controller = new AbortController();
      const response = await fetch('/api/fitness/chat?stream=true', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': 'stream-user' },
        body: JSON.stringify({ message: userMessage, lang: chatLanguage }),
        signal: controller.signal,
      });

      if (!response.ok) throw new Error('Stream failed');

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No stream');

      const decoder = new TextDecoder();
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        // Parse SSE format: "data: {...}\n\n"
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.done) {
                // Final message — save with suggestions + timing
                const elapsed = data.responseTime || Math.round(performance.now() - start);
                const coachMsg = {
                  role: 'coach' as const,
                  text: data.response || fullText,
                  timestamp: new Date().toISOString(),
                  suggestions: data.suggestions,
                  responseTime: elapsed,
                };
                setMessages(prev => [...prev, coachMsg]);
                setStreamingText('');
                setStreamingStart(null);
              } else if (data.text !== undefined) {
                fullText += data.text;
                setStreamingText(fullText);
              }
            } catch {
              // Skip malformed chunks
            }
          }
        }
      }

      // Fallback if no done event
      if (fullText && streamingStart) {
        const elapsed = Math.round(performance.now() - streamingStart);
        const coachMsg = {
          role: 'coach' as const,
          text: fullText,
          timestamp: new Date().toISOString(),
          responseTime: elapsed,
        };
        setMessages(prev => [...prev, coachMsg]);
        setStreamingText('');
        setStreamingStart(null);
      }
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'coach' as const,
        text: "I'm sorry, I couldn't reach the AI coach right now. Please try again in a moment.",
        timestamp: new Date().toISOString(),
      }]);
      setStreamingText('');
      setStreamingStart(null);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }, [input, sending, chatLanguage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      // Use streaming if user wants it
      if ((chatLanguage || 'stream') === 'stream') {
        handleStreamSend();
      } else {
        handleSend();
      }
    }
  };

  const formatTime = (timestamp: string) => {
    const d = new Date(timestamp);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  const contextSummary = (() => {
    const parts: string[] = [];
    if (profile) {
      parts.push(`Goal: ${profile.goal} · Level: ${profile.level}`);
      if (profile.injuries.length > 0) parts.push(`Injuries: ${profile.injuries.join(', ')}`);
    }
    if (recentWorkouts.length > 0) {
      const lastWorkout = recentWorkouts[recentWorkouts.length - 1];
      parts.push(`Last workout: ${lastWorkout.workoutName} (${lastWorkout.date})`);
    }
    if (currentPlan) {
      const todayWorkout = currentPlan.days.find(d => d.date === new Date().toISOString().split('T')[0]);
      if (todayWorkout && todayWorkout.workouts.length > 0) {
        parts.push(`Today: ${todayWorkout.workouts[0].workoutName}`);
      }
    }
    return parts.join(' · ');
  })();

  const followUpSuggestions = messages.length > 0 && messages[messages.length - 1].role === 'coach'
    ? messages[messages.length - 1].suggestions
    : undefined;

  const lastResponseTime = messages.length > 0 && messages[messages.length - 1].role === 'coach'
    ? messages[messages.length - 1].responseTime
    : undefined;

  // Show streaming indicator
  const isStreaming = sending && streamingText !== '';

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-[#27272A] px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#6366F1] to-[#A855F7] flex items-center justify-center text-white font-bold text-sm">
            AI
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[#E4E4E7]">PolySync Coach</h3>
            {contextSummary && (
              <p className="text-xs text-[#71717A]">{contextSummary}</p>
            )}
          </div>
          {/* Language indicator */}
          {chatLanguage && chatLanguage !== 'en' && (
            <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-[#F59E0B]/10 text-[#F59E0B] border border-[#F59E0B]/20">
              {chatLanguage.toUpperCase()}
            </span>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 rounded-full bg-[#6366F1]/10 flex items-center justify-center mb-4">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth="1.5">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <h4 className="text-[#E4E4E7] font-semibold mb-2">Your AI Fitness Coach</h4>
            <p className="text-sm text-[#71717A] max-w-sm mb-4">
              Ask me anything about your workouts, nutrition, recovery, form, or programming. Responses stream in real-time.
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              {quickQuestions.map(q => (
                <button
                  key={q}
                  onClick={() => setInput(q)}
                  className="px-3 py-2 rounded-xl bg-[#1A1A20] border border-[#27272A] text-xs text-[#71717A] hover:border-[#6366F1] hover:text-[#6366F1] transition-all"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-2xl ${
                msg.role === 'user'
                  ? 'bg-[#6366F1] text-white rounded-br-md'
                  : 'bg-[#1A1A20] border border-[#27272A] rounded-bl-md'
              }`}>
                <div className={`p-3 text-sm leading-relaxed ${
                  msg.role === 'user' ? 'text-white' : 'text-[#E4E4E7]'
                }`}>
                  {msg.text}
                </div>
                <div className={`px-3 py-1 text-xs ${
                  msg.role === 'user' ? 'bg-[#52525B] text-white rounded-br-md' : 'bg-[#0D0D14] text-[#71717A] rounded-bl-md'
                }`}>
                  {formatTime(msg.timestamp)}
                  {msg.role === 'coach' && msg.responseTime != null && (
                    <span className="ml-2 text-[#52525B]">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#52525B] mr-1" />
                      {msg.responseTime}ms
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))
        )}

        {/* Streaming message */}
        {isStreaming && (
          <div className="flex justify-start">
            <div className="bg-[#1A1A20] border border-[#27272A] rounded-2xl rounded-bl-md p-4">
              <div className="p-3 text-sm leading-relaxed text-[#E4E4E7]">
                {streamingText}
                <span className="inline-block w-0.5 h-4 bg-[#6366F1] ml-0.5 animate-pulse" />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />

        {sending && !isStreaming && (
          <div className="flex justify-start">
            <div className="bg-[#1A1A20] border border-[#27272A] rounded-2xl rounded-bl-md p-4">
              <div className="flex gap-1.5">
                {[0, 1, 2].map(i => (
                  <div key={i} className="w-2 h-2 rounded-full bg-[#6366F1] animate-bounce" style={{ animationDelay: `${i * 0.2}s` }} />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Follow-up suggestion chips */}
      {followUpSuggestions && followUpSuggestions.length > 0 && !sending && (
        <div className="px-4 py-2 border-t border-[#27272A] bg-[#121215]/50">
          <div className="flex flex-wrap gap-2">
            {followUpSuggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => { setInput(s); inputRef.current?.focus(); }}
                className="px-3 py-1.5 rounded-lg bg-[#6366F1]/10 border border-[#6366F1]/20 text-xs text-[#A5B4FC] hover:bg-[#6366F1]/20 hover:border-[#6366F1]/40 transition-all"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="border-t border-[#27272A] p-4">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask your coach anything..."
            rows={2}
            className="flex-1 bg-[#0D0D14] border border-[#27272A] rounded-xl px-4 py-3 text-sm text-[#E4E4E7] placeholder-[#52525B] focus:border-[#6366F1] focus:outline-none resize-none max-h-32"
            disabled={sending}
          />
          <button
            onClick={() => { handleStreamSend(); }}
            disabled={!input.trim() || sending}
            className={`px-4 py-3 rounded-xl transition-all ${
              input.trim() && !sending
                ? 'bg-[#6366F1] text-white hover:bg-[#52525B] shadow-lg shadow-[#6366F1]/20'
                : 'bg-[#27272A] text-[#71717A] cursor-not-allowed'
            }`}
          >
            {sending ? (
              <svg className="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            )}
          </button>
        </div>
        <p className="text-xs text-[#52525B] mt-2 text-center">
          {chatLanguage && chatLanguage !== 'en' ? `Responding in ${chatLanguage.toUpperCase()}. ` : ''}
          AI responses are generated by Gemini 3.5. I'm an AI fitness coach, not a medical professional.
        </p>
      </div>
    </div>
  );
}
