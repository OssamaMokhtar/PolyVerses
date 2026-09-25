import { useState } from 'react';
import { Utensils, AlertTriangle, Sparkles } from 'lucide-react';

interface NutritionPanelProps {
  profile: { goal?: string; level?: string } | null;
  userId: string;
}

export function NutritionPanel({ profile, userId }: NutritionPanelProps) {
  const [query, setQuery] = useState('');
  const [response, setResponse] = useState<{ guidance: string; disclaimer: string; sandbox: boolean } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAsk = async () => {
    if (!query.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/fitness/nutrition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
        body: JSON.stringify({ query: query.trim(), profile }),
      });
      if (!res.ok) throw new Error('Nutrition request failed');
      const data = await res.json();
      setResponse(data);
    } catch (err) {
      setError('Could not reach nutrition coach. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Ask a question */}
      <div className="bg-[#121215]/90 backdrop-blur-xl border border-[#27272A] rounded-xl p-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#F59E0B] to-[#EF4444] flex items-center justify-center">
            <Utensils className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[#E4E4E7]">Nutrition Advisor</h3>
            <p className="text-xs text-[#71717A]">Ask about nutrition, macros, meal timing, or diet questions</p>
          </div>
        </div>

        <div className="flex gap-2">
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAsk()}
            placeholder="e.g. How much protein do I need for muscle gain?"
            className="flex-1 px-3 py-2 bg-[#0D0D14] border border-[#27272A] rounded-lg text-sm text-[#E4E4E7] placeholder-[#52525B] focus:outline-none focus:border-[#F59E0B]/40"
          />
          <button
            onClick={handleAsk}
            disabled={loading || !query.trim()}
            className="px-4 py-2 bg-[#F59E0B] text-white rounded-lg text-sm font-medium hover:bg-[#F59E0B]/90 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                Thinking...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Ask
              </>
            )}
          </button>
        </div>

        {/* Quick questions */}
        <div className="mt-3 flex flex-wrap gap-2">
          {['Protein for muscle gain', 'Meal timing around workouts', 'Hydration strategy', 'Pre-workout meals', 'Post-workout nutrition'].map(q => (
            <button
              key={q}
              onClick={() => { setQuery(q); handleAsk(); }}
              className="px-2.5 py-1 bg-[#1A1A20] border border-[#27272A] rounded-full text-xs text-[#71717A] hover:border-[#F59E0B]/30 hover:text-[#F59E0B] transition"
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Response */}
      {response && (
        <div className="bg-[#121215]/90 backdrop-blur-xl border border-[#27272A] rounded-xl p-4 animate-in fade-in zoom-in duration-200">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#F59E0B]/20 to-[#EF4444]/20 flex items-center justify-center shrink-0">
              <Utensils className="w-4 h-4 text-[#F59E0B]" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium text-[#E4E4E7] mb-2">Nutrition Guidance</div>
              <div className="text-sm text-[#A1A1AA] leading-relaxed white-space-pre-wrap">{response.guidance}</div>
              <div className="mt-3 pt-3 border-t border-[#27272A]">
                <div className="flex items-start gap-2 text-xs text-[#71717A]">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[#F59E0B]" />
                  <span>{response.disclaimer}</span>
                </div>
                {response.sandbox && (
                  <div className="mt-1 text-xs text-[#71717A]">
                    (Running in sandbox mode — Gemini API not configured. Responses are pre-seeded.)
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-xl p-3">
          <div className="text-sm text-[#EF4444]">{error}</div>
        </div>
      )}
    </div>
  );
}
