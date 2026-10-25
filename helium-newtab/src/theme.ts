// Browser color hack: Chromium has no API that exposes the browser theme to extensions,
// but the color comes from the BrowserThemeColor policy, so we read the policy file
// (needs "Allow access to file URLs") and expand the seed into a Material palette
// the same way Chromium does (tonal spot).
import {
    Hct,
    MaterialDynamicColors as C,
    SchemeTonalSpot,
    argbFromHex,
    hexFromArgb,
    type DynamicColor,
} from "@material/material-color-utilities";
import { isDark } from "./scheme.svelte";

const POLICY_DIRS = ["/etc/chromium/policies/managed/", "/etc/chromium/policies/recommended/"];
const CACHE = "browser-theme-seed";
const dark = window.matchMedia("(prefers-color-scheme: dark)");
let lastSeed = "";

const map: Record<string, DynamicColor> = {
    "--bg-surface": C.surface,
    "--background": C.surface,
    "--primary": C.onSurface,
    "--secondary": C.onSurfaceVariant,
    "--tertiary": C.outline,
    "--white": C.onPrimary,
    "--helium-blue": C.primary,
    "--helium-blue-hover": C.primary,
    "--helium-blue-press": C.primary,
    "--helium-elevated": C.primary,
    "--tooltip-bg": C.surfaceContainerHigh,
    "--bg-gradient-start": C.surfaceContainerLow,
    "--bg-gradient-end": C.primaryContainer,
    "--stars-top": C.surfaceContainerLowest,
    "--stars-bottom": C.primaryContainer,
    "--star-color": C.onPrimaryContainer,
};

let applied = "";

function readFile(path: string): Promise<string | null> {
    // fetch() refuses file://, XHR works for extensions with file access
    return new Promise((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.open("GET", `file://${path}`);
        xhr.onload = () => resolve(xhr.responseText || null);
        xhr.onerror = () => resolve(null);
        try {
            xhr.send();
        } catch {
            resolve(null);
        }
    });
}

async function readPolicySeed(): Promise<string | null> {
    for (const dir of POLICY_DIRS) {
        const listing = await readFile(dir);
        if (!listing) continue;
        const files = [...listing.matchAll(/addRow\("([^"]+\.json)"/g)].map((m) => m[1]);
        for (const name of files.sort()) {
            try {
                const color = JSON.parse((await readFile(dir + name)) ?? "{}").BrowserThemeColor;
                if (typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color)) return color;
            } catch {}
        }
    }
    return null;
}

function apply(seed: string) {
    lastSeed = seed;
    // follows the forced dark scheme of the starfield too, not just the system
    const key = `${seed}:${isDark()}`;
    if (key === applied) return false;
    const scheme = new SchemeTonalSpot(Hct.fromInt(argbFromHex(seed)), isDark(), 0);
    const root = document.documentElement.style;
    for (const [prop, color] of Object.entries(map)) {
        root.setProperty(prop, hexFromArgb(color.getArgb(scheme)));
    }
    applied = key;
    return true;
}

/** Applies the last seed synchronously so new tabs don't flash default colors. */
export function applyCachedBrowserTheme() {
    try {
        const seed = localStorage.getItem(CACHE);
        if (seed) apply(seed);
    } catch {}
}

/** true if colors changed, false if unchanged, null if the policy can't be read. */
export async function applyBrowserTheme(): Promise<boolean | null> {
    const seed = await readPolicySeed();
    if (!seed) return null;
    try {
        localStorage.setItem(CACHE, seed);
    } catch {}
    return apply(seed);
}

/** Re-applies the current browser palette after a light/dark change; true if it changed. */
export function refreshBrowserTheme() {
    return lastSeed ? apply(lastSeed) : false;
}

export function onSchemeChange(fn: () => void) {
    dark.addEventListener("change", fn);
    return () => dark.removeEventListener("change", fn);
}

/** Returns true if browser colors were applied before. */
export function clearBrowserTheme() {
    const had = applied !== "";
    const root = document.documentElement.style;
    for (const prop of Object.keys(map)) root.removeProperty(prop);
    applied = "";
    lastSeed = "";
    try {
        localStorage.removeItem(CACHE);
    } catch {}
    return had;
}
