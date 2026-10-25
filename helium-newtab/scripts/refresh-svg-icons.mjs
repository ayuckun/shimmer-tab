// Builds public/svg-icons.json: hostname → vector logos from svgl (https://svgl.app),
// so popular services get crisp SVG icons (with light/dark variants) instead of favicons.
import { writeFile } from "node:fs/promises";

const LIBRARY = "https://svgl.app/library/";
const res = await fetch("https://api.svgl.app", { signal: AbortSignal.timeout(30_000) });
if (!res.ok) throw new Error(`svgl download failed: HTTP ${res.status}`);
const entries = await res.json();

const short = (u) => (u.startsWith(LIBRARY) ? u.slice(LIBRARY.length) : u);
const map = {};
let count = 0;

for (const { url, route } of entries) {
    if (!url || !route) continue;
    let parsed;
    try {
        parsed = new URL(url);
    } catch {
        continue;
    }
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    const path = parsed.pathname.replace(/\/+$/, "") || "/";
    const light = short(typeof route === "string" ? route : route.light);
    const dark = short(typeof route === "string" ? route : route.dark);
    const list = (map[host] ??= []);
    if (list.some((e) => e.p === path)) continue;
    list.push(light === dark ? { p: path, s: light } : { p: path, l: light, d: dark });
    count++;
}

// sites whose svgl entry points at another domain or page
const aliases = {
    "mail.google.com": ["gmail.com"],
    "chatgpt.com": ["openai.com"],
    "chat.openai.com": ["openai.com"],
    "drive.google.com": ["google.com", "/drive"],
    "maps.google.com": ["google.com", "/maps"],
    "outlook.live.com": ["microsoft.com", "/microsoft-365/outlook/email-and-calendar-software-application"],
    "outlook.office.com": ["microsoft.com", "/microsoft-365/outlook/email-and-calendar-software-application"],
    "whatsapp.com": ["web.whatsapp.com"],
    "telegram.org": ["web.telegram.org"],
    "t.me": ["web.telegram.org"],
    "twitter.com": ["x.com"],
    "youtu.be": ["youtube.com"],
};

for (const [from, [to, path = "/"]] of Object.entries(aliases)) {
    if (map[from]?.some((e) => e.p === "/")) continue;
    const entry = map[to]?.find((e) => e.p === path);
    if (!entry) {
        console.warn(`alias ${from} → ${to}${path}: no such entry`);
        continue;
    }
    (map[from] ??= []).push({ ...entry, p: "/" });
}

await writeFile(new URL("../public/svg-icons.json", import.meta.url), JSON.stringify(map));
console.log(`Wrote ${count} svg icons for ${Object.keys(map).length} hosts`);
