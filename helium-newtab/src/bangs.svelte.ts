// Bangs (!g, !yt, …) from Helium's own catalog, bundled as public/bangs.json
// (refresh with `pnpm bangs:refresh`) and resolved like exsesx/helium-new-tab does.
// The ~1 MB catalog is only fetched once a bang is typed.
import { createBangResolver } from "./lib/bangs.js";

export type BangMatch = { url: string; service: string; siteOrigin: string };
type Resolver = (text: string) => BangMatch | null;

let resolver: Resolver | null = $state(null);
type Entry = { s: string; ts: string[]; u: string };
let catalog: Entry[] = [];
let request: Promise<void> | undefined;

export const hasBang = (text: string) => /(?:^|\s)!\S+/.test(text);

export function loadBangs() {
    request ??= fetch("bangs.json")
        .then((res) => {
            if (!res.ok) throw new Error("Bang catalog unavailable");
            return res.json();
        })
        .then((entries: Entry[]) => {
            catalog = entries;
            resolver = createBangResolver(entries) as Resolver;
        })
        .catch(() => {
            request = undefined;
        });
    return request;
}

/** Sync lookup for the hint; null until the catalog is loaded. */
export function resolveBang(text: string) {
    if (!hasBang(text)) return null;
    if (!resolver) loadBangs();
    return resolver?.(text) ?? null;
}

/** For submit: waits for the catalog if needed. */
export async function resolveBangAsync(text: string) {
    if (!hasBang(text)) return null;
    await loadBangs();
    return resolver?.(text) ?? null;
}

// what most people mean when they start typing a bang
const POPULAR = [
    "youtube.com", "google.com", "github.com", "en.wikipedia.org", "reddit.com", "duckduckgo.com",
    "amazon.com", "x.com", "twitter.com", "ya.ru", "wikipedia.org", "maps.google.com", "translate.google.com",
    "stackoverflow.com", "imdb.com", "twitch.tv", "spotify.com", "netflix.com", "music.youtube.com",
    "chatgpt.com", "perplexity.ai", "npmjs.com", "developer.mozilla.org", "archlinux.org",
];

export type BangSuggestion = { trigger: string; service: string; origin: string };

/**
 * Bangs whose trigger starts with `prefix`, for autocomplete. The catalog is roughly
 * ordered by popularity, so that order ranks them; an exact trigger match comes first.
 */
export function suggestBangs(prefix: string, limit = 6): BangSuggestion[] {
    if (!resolver) {
        loadBangs();
        return [];
    }
    const p = prefix.toLowerCase();
    const found: (BangSuggestion & { rank: number })[] = [];
    const boosted = new Set<string>();
    for (let i = 0; i < catalog.length && found.length < 200; i++) {
        const entry = catalog[i];
        let best: string | null = null;
        for (const t of entry.ts) {
            const lt = t.toLowerCase();
            if (lt.startsWith(p) && (best === null || lt.length < best.length)) best = lt;
        }
        if (best === null) continue;
        let origin = "";
        try {
            const url = new URL(entry.u);
            if (!url.hostname.includes("{")) origin = url.origin;
        } catch {}
        const host = origin.replace(/^https?:\/\/(www\.)?/, "");
        // only a service's main bang gets the boost, not all its variants
        const boost = boosted.has(host) ? -1 : POPULAR.indexOf(host);
        if (boost >= 0) boosted.add(host);
        // exact trigger first, then well-known services, then catalog order
        const rank = best === p ? -1e6 : boost >= 0 ? -1e5 + boost : i;
        found.push({ trigger: best, service: entry.s, origin, rank });
    }
    return found
        .sort((a, b) => a.rank - b.rank)
        .slice(0, limit)
        .map(({ trigger, service, origin }) => ({ trigger, service, origin }));
}
