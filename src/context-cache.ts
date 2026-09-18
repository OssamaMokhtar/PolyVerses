/**
 * PolyVerses Context Cache — LRU Assembled-Context Cache with TTL
 *
 * Caches assembled contexts (the text bundle sent to specialist agents)
 * so repeat queries with the same context don't re-assemble and re-tokenize.
 *
 * Eviction: LRU (least recently used) when cache exceeds max size.
 * TTL: Entries older than ttlMs are treated as cache misses on lookup.
 *
 * Design notes:
 *   - Cache key is based on userId + query hash + sorted note IDs + retrieval strategy
 *   - Token budget is preserved: cache hit saves re-assembly cost, not just retrieval
 *   - Stats tracked: hits, misses, evictions, current size
 */

interface CacheEntry {
  key: string;
  contextId: string;
  assembledText: string;
  tokenEstimate: number;
  assembledFrom: string[];       // Note IDs used
  agentsInvoked: string[];       // Which agents this context is for
  metadata: {
    retrievalStrategy: string;
    filtersApplied: string[];
    notesConsidered: number;
    notesSelected: number;
    cacheHit: boolean;           // Will be true when served from cache
  };
  createdAt: number;             // Unix ms
  lastAccessedAt: number;        // Unix ms — updated on every hit
  hitCount: number;              // Total times this entry was served
}

export interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  size: number;                  // Current number of entries
  maxSize: number;               // Configured max
  ttlMs: number;                 // Configured TTL
  totalTokensSaved: number;      // Cumulative token estimate of cache hits (avoided re-assembly)
}

export interface CacheConfig {
  maxSize: number;               // Max entries before LRU eviction (default 100)
  ttlMs: number;                 // Time-to-live in ms (default 24 hours = 86400000)
}

const DEFAULT_CONFIG: CacheConfig = {
  maxSize: 100,
  ttlMs: 24 * 60 * 60 * 1000,   // 24 hours
};

class ContextCache {
  private entries: Map<string, CacheEntry> = new Map();
  private config: CacheConfig;
  private stats: CacheStats;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      size: 0,
      maxSize: this.config.maxSize,
      ttlMs: this.config.ttlMs,
      totalTokensSaved: 0,
    };
  }

  /**
   * Generate a cache key from the assembly parameters.
   * Same userId + query + note IDs + strategy = same key.
   */
  generateKey(userId: string, query: string, noteIds: string[], strategy: string): string {
    const sortedNotes = [...noteIds].sort();
    const hashInput = `${userId}|${query}|${sortedNotes.join(',')}|${strategy}`;
    // Simple hash — good enough for cache key uniqueness
    let hash = 0;
    for (let i = 0; i < hashInput.length; i++) {
      const char = hashInput.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return `ctx_${userId}_${Math.abs(hash)}`;
  }

  /**
   * Look up an entry. Returns the entry if found and not expired, null otherwise.
   * Updates lastAccessedAt and hitCount on hit.
   */
  get(key: string): CacheEntry | null {
    const entry = this.entries.get(key);
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check TTL
    const now = Date.now();
    if (now - entry.createdAt > this.config.ttlMs) {
      this.entries.delete(key);
      this.stats.misses++;
      return null;
    }

    // Hit — update access metadata
    entry.lastAccessedAt = now;
    entry.hitCount++;
    this.stats.hits++;
    this.stats.totalTokensSaved += entry.tokenEstimate;

    // Move to end of LRU order (Map preserves insertion order; delete+set does the trick)
    this.entries.delete(key);
    this.entries.set(key, entry);

    return entry;
  }

  /**
   * Store an assembled context in the cache.
   * Evicts LRU entry if cache is full.
   */
  set(entry: Omit<CacheEntry, 'createdAt' | 'lastAccessedAt' | 'hitCount'>): string {
    const now = Date.now();
    const fullEntry: CacheEntry = {
      ...entry,
      createdAt: now,
      lastAccessedAt: now,
      hitCount: 0,
    };

    // Check if key already exists — update it (treat as new insertion for LRU)
    if (this.entries.has(entry.key)) {
      this.entries.delete(entry.key);
    }

    // Evict if over capacity
    while (this.entries.size >= this.config.maxSize) {
      this.evictLRU();
    }

    this.entries.set(entry.key, fullEntry);
    this.stats.size = this.entries.size;
    return entry.key;
  }

  /**
   * Evict the least recently used entry (first in Map insertion order).
   */
  private evictLRU(): void {
    const firstKey = this.entries.keys().next().value;
    if (firstKey) {
      this.entries.delete(firstKey);
      this.stats.evictions++;
      this.stats.size = this.entries.size;
    }
  }

  /**
   * Check if a key exists and is valid (not expired).
   */
  has(key: string): boolean {
    return this.get(key) !== null;
  }

  /**
   * Delete a specific entry.
   */
  delete(key: string): boolean {
    const result = this.entries.delete(key);
    if (result) {
      this.stats.size = this.entries.size;
    }
    return result;
  }

  /**
   * Clear all entries.
   */
  clear(): void {
    this.entries.clear();
    this.stats = {
      ...this.stats,
      hits: 0,
      misses: 0,
      evictions: 0,
      size: 0,
    };
  }

  /**
   * Get current stats.
   */
  getStats(): CacheStats {
    return { ...this.stats, size: this.entries.size };
  }

  /**
   * Prune expired entries without affecting stats (clean-up pass).
   */
  pruneExpired(): number {
    const now = Date.now();
    let pruned = 0;
    for (const [key, entry] of this.entries) {
      if (now - entry.createdAt > this.config.ttlMs) {
        this.entries.delete(key);
        pruned++;
      }
    }
    this.stats.size = this.entries.size;
    return pruned;
  }

  /**
   * Get all keys (for debugging / inspection).
   */
  getKeys(): string[] {
    return Array.from(this.entries.keys());
  }
}

// Singleton instance — shared across the server
export const contextCache = new ContextCache();

// Example cache key generation for testing
export function generateContextKey(
  userId: string,
  query: string,
  noteIds: string[],
  strategy: string
): string {
  return contextCache.generateKey(userId, query, noteIds, strategy);
}

// Types re-export for convenience
export type { CacheEntry, CacheStats, CacheConfig };
