export type Shortcut = { title: string; url: string };

export type Settings = {
    background: "shimmer" | "stars" | "random" | "none";
    clock: boolean;
    hour12: boolean;
    seconds: boolean;
    browserTheme: boolean;
    bangs: boolean;
    logoText: boolean;
    /** focus mode: only the logo and the search bar */
    quiet: boolean;
    shortcuts: boolean;
    lockShortcuts: boolean;
    shortcutTitles: boolean;
    /** paint all icons in one color */
    iconTint: boolean;
    /** "accent", "text" or a hex color */
    tintColor: string;
    iconStyle: "plain" | "contained";
    links: Shortcut[];
    topSites: boolean;
    weather: boolean;
    city: string;
    fahrenheit: boolean;
};

export const defaults: Settings = {
    background: "shimmer",
    clock: true,
    hour12: false,
    seconds: false,
    browserTheme: false,
    bangs: true,
    logoText: true,
    quiet: false,
    shortcuts: true,
    lockShortcuts: false,
    shortcutTitles: true,
    iconTint: false,
    tintColor: "accent",
    iconStyle: "plain",
    links: [
        { title: "GitHub", url: "https://github.com/" },
        { title: "YouTube", url: "https://www.youtube.com/" },
        { title: "Helium", url: "https://helium.computer/" },
    ],
    topSites: false,
    weather: false,
    city: "",
    fahrenheit: false,
};

const KEY = "settings";
const hasChrome = typeof chrome !== "undefined" && !!chrome.storage?.sync;

const MIRROR = "settings-mirror";

export function normalize(raw: Record<string, unknown> | null | undefined): Settings {
    const settings = { ...defaults, ...(raw ?? {}) } as Settings;
    // pre-1.1 had a plain shimmer on/off toggle
    if (raw && !raw.background && raw.shimmer === false) settings.background = "none";
    delete (settings as { shimmer?: boolean }).shimmer;
    return settings;
}

/**
 * Synchronous first guess from a localStorage mirror of the synced settings, so the first
 * frame already has the right logo, background and widgets instead of the defaults.
 */
export function loadCached(): Settings {
    try {
        return normalize(JSON.parse(localStorage.getItem(MIRROR) ?? "null"));
    } catch {
        return { ...defaults };
    }
}

export async function load(): Promise<Settings> {
    try {
        const raw = hasChrome
            ? (await chrome.storage.sync.get(KEY))[KEY]
            : JSON.parse(localStorage.getItem(MIRROR) ?? "null");
        return normalize(raw);
    } catch {
        return loadCached();
    }
}

// the old runtime-downloaded bang cache is no longer used
if (hasChrome) chrome.storage.local.remove("bangs").catch(() => {});

export async function save(settings: Settings) {
    const plain = $state.snapshot(settings);
    try {
        localStorage.setItem(MIRROR, JSON.stringify(plain));
    } catch {}
    if (hasChrome) await chrome.storage.sync.set({ [KEY]: plain });
}

export function normalizeUrl(input: string) {
    const s = input.trim();
    if (!s) return null;
    try {
        return new URL(/^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`).toString();
    } catch {
        return null;
    }
}

/** Icon from the browser's own favicon cache, so typing sends no requests. */
export function favicon(origin: string, size = 18) {
    if (typeof chrome === "undefined" || !chrome.runtime?.id) return "";
    const url = new URL(chrome.runtime.getURL("/_favicon/"));
    url.searchParams.set("pageUrl", origin);
    url.searchParams.set("size", String(Math.ceil(size * (devicePixelRatio || 1))));
    return url.toString();
}
