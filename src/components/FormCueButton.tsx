import { useState } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';

interface FormCueButtonProps {
  exerciseId: string;
  exerciseName: string;
  userId: string;
}

export function FormCueButton({ exerciseId, exerciseName, userId }: FormCueButtonProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(`How do I do ${exerciseName} correctly?`);
  const [response, setResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleAsk = async () => {
    if (!query.trim() || loading) return;
    setLoading(true);
    try {
      const res = await fetch('/api/fitness/form-cue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
        body: JSON.stringify({ exerciseId, userDescription: query.trim() }),
      });
      if (!res.ok) throw new Error('Form cue request failed');
      const data = await res.json();
      setResponse(data.cue || data.guidance || 'No form guidance available.');
    } catch {
      setResponse('Could not reach form coach. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#6366F1]/10 border border-[#6366F1]/30 text-[#A78BFA] hover:border-[#6366F1]/50 transition text-sm font-medium"
      >
        <Sparkles className="w-4 h-4" />
        Form Cue
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-3 animate-in fade-in zoom-in duration-200">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-[#A78BFA]" />
        <span className="text-sm font-medium text-[#E4E4E7]">Form Coaching for {exerciseName}</span>
        <button
          onClick={() => { setOpen(false); setResponse(null); }}
          className="ml-auto text-xs text-[#71717A] hover:text-[#E4E4E7] transition"
        >
          ✕
        </button>
      </div>

      <textarea
        value={query}
        onChange={e => setQuery(e.target.value)}
        className="w-full px-3 py-2 bg-[#0D0D14] border border-[#27272A] rounded-xl text-sm text-[#E4E4E7] placeholder-[#52525B] resize-none h-20 focus:outline-none focus:border-[#6366F1]/40"
        placeholder="Describe what you feel or ask about this exercise..."
      />

      <div className="flex gap-2">
        <button
          onClick={handleAsk}
          disabled={loading || !query.trim()}
          className="flex-1 py-2 rounded-xl bg-[#6366F1] text-white text-sm font-medium hover:bg-[#6366F1]/90 transition disabled:opacity-50 flex items-center justify-center gap-1"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          Get Cue
        </button>
        <button
          onClick={() => setOpen(false)}
          className="px-3 py-2 rounded-xl bg-[#27272A] text-[#71717A] hover:bg-[#3A3A40] transition text-sm"
        >
          Cancel
        </button>
      </div>

      {response && (
        <div className="bg-[#6366F1]/10 border border-[#6366F1]/30 rounded-xl p-3">
          <div className="text-xs text-[#71717A] mb-1">Form Cue</div>
          <div className="text-sm text-[#E4E4E7] leading-relaxed white-space-pre-wrap">{response}</div>
        </div>
      )}
    </div>
  );
}
