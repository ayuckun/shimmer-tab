// Records a showcase of the new tab extension: drives Helium over CDP and captures the
// page with Page.startScreencast (GPU, ~60fps). Usage: node demo.mjs <outdir>
import { mkdirSync, writeFileSync } from "node:fs";

const OUT = process.argv[2];
mkdirSync(`${OUT}/frames`, { recursive: true });

const targets = await (await fetch("http://127.0.0.1:9333/json/list")).json();
const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));

let id = 0;
const pending = new Map();
const frames = [];
let recording = false;
const send = (method, params = {}) =>
    new Promise((r) => {
        const i = ++id;
        pending.set(i, r);
        ws.send(JSON.stringify({ id: i, method, params }));
    });
ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
        pending.get(m.id)(m);
        pending.delete(m.id);
    } else if (m.method === "Page.screencastFrame") {
        send("Page.screencastFrameAck", { sessionId: m.params.sessionId });
        if (!recording) return;
        const n = frames.length;
        writeFileSync(`${OUT}/frames/${String(n).padStart(5, "0")}.jpg`, Buffer.from(m.params.data, "base64"));
        frames.push(m.params.metadata.timestamp);
    }
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = async (expression) =>
    (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result?.result?.value;

// ---- fake cursor, drawn into the page so it shows up in the capture ----
const CURSOR = `(() => {
  if (document.getElementById('demo-cursor')) return;
  const c = document.createElement('div');
  c.id = 'demo-cursor';
  c.innerHTML = '<svg width="26" height="30" viewBox="0 0 26 30"><path d="M3 2 L3 24 L9 18.5 L13.2 27.5 L17 25.8 L12.9 17 L21 17 Z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg><span></span>';
  Object.assign(c.style, { position: 'fixed', left: '0', top: '0', zIndex: 2147483647, pointerEvents: 'none',
    filter: 'drop-shadow(0 2px 4px rgb(0 0 0 / .35))', transition: 'opacity .3s', opacity: '0', translate: '-100px -100px' });
  const ring = c.querySelector('span');
  Object.assign(ring.style, { position: 'absolute', left: '-14px', top: '-14px', width: '34px', height: '34px', borderRadius: '50%',
    background: 'rgb(255 255 255 / .35)', scale: '0', opacity: '0', transition: 'scale .35s cubic-bezier(.2,.8,.2,1), opacity .35s' });
  document.documentElement.appendChild(c);
  addEventListener('mousemove', (e) => { c.style.opacity = '1'; c.style.translate = (e.clientX - 3) + 'px ' + (e.clientY - 2) + 'px'; }, true);
  addEventListener('mousedown', () => { ring.style.transition = 'none'; ring.style.scale = '.3'; ring.style.opacity = '1';
    requestAnimationFrame(() => { ring.style.transition = 'scale .35s cubic-bezier(.2,.8,.2,1), opacity .45s'; ring.style.scale = '1'; ring.style.opacity = '0'; }); }, true);
})()`;

let mx = 1130, my = 630;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

async function moveTo(x, y, ms = 700) {
    const sx = mx, sy = my;
    // slight arc, like a hand
    const cx = (sx + x) / 2 + (y - sy) * 0.12, cy = (sy + y) / 2 - (x - sx) * 0.12;
    const steps = Math.max(2, Math.round(ms / 16));
    for (let i = 1; i <= steps; i++) {
        const t = ease(i / steps);
        const px = (1 - t) * (1 - t) * sx + 2 * (1 - t) * t * cx + t * t * x;
        const py = (1 - t) * (1 - t) * sy + 2 * (1 - t) * t * cy + t * t * y;
        await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: px, y: py });
        await sleep(16);
    }
    mx = x;
    my = y;
}

async function click(x, y, ms = 650) {
    await moveTo(x, y, ms);
    await sleep(90);
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
    await sleep(70);
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
}

async function center(selectorJs) {
    const r = await ev(`(() => { const el = ${selectorJs}; if (!el) return null; const b = el.getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; })()`);
    if (!r) throw new Error("not found: " + selectorJs);
    return r;
}
const byText = (sel, text) => `[...document.querySelectorAll(${JSON.stringify(sel)})].find(e => e.innerText.trim().startsWith(${JSON.stringify(text)}))`;

async function clickEl(selectorJs, ms) {
    const [x, y] = await center(selectorJs);
    await click(x, y, ms);
}

async function type(text, min = 70, max = 140) {
    for (const ch of text) {
        await send("Input.dispatchKeyEvent", { type: "keyDown", key: ch, text: ch });
        await send("Input.dispatchKeyEvent", { type: "keyUp", key: ch });
        await sleep(min + Math.random() * (max - min));
    }
}

async function key(k, code, vk) {
    await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: k, code, windowsVirtualKeyCode: vk });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, windowsVirtualKeyCode: vk });
}

// ---- setup (not recorded) ----
await send("Page.enable");
// the browser runs at 1280×720 CSS with --force-device-scale-factor=1.5: real 1080p
// frames with UI big enough to read on a phone
await send("Page.navigate", { url: "chrome://newtab/" });
await sleep(2500);
const settings = {
    background: "stars",
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
        { title: "Reddit", url: "https://www.reddit.com/" },
        { title: "X", url: "https://x.com/" },
        { title: "Discord", url: "https://discord.com/" },
        { title: "Spotify", url: "https://open.spotify.com/" },
        { title: "Figma", url: "https://www.figma.com/" },
        { title: "ChatGPT", url: "https://chatgpt.com/" },
    ],
    topSites: false,
    weather: true,
    city: "Berlin",
    fahrenheit: false,
};
await ev(`(async () => {
  await chrome.storage.sync.set({ settings: ${JSON.stringify(settings)} });
  localStorage.setItem('settings-mirror', ${JSON.stringify(JSON.stringify(settings))});
  localStorage.setItem('settings-tab', 'look');
})()`);
// warm caches: icons, weather, bangs catalog
await send("Page.navigate", { url: "about:blank" });
await sleep(300);
await send("Page.navigate", { url: "chrome://newtab/" });
await sleep(8000);
await ev(`fetch('bangs.json').then(r => r.text())`);
await send("Page.navigate", { url: "about:blank" });
await sleep(500);

// ---- recording ----
await send("Page.startScreencast", { format: "jpeg", quality: 92, everyNthFrame: 1, maxWidth: 1920, maxHeight: 1080 });
await sleep(300);
recording = true;
await sleep(250);

// 1. open: warp-in
await send("Page.navigate", { url: "chrome://newtab/" });
await sleep(350);
await ev(CURSOR);
await sleep(1500);

// 2. cursor drifts: parallax
await moveTo(1000, 500, 800);
await moveTo(280, 200, 1300);
await moveTo(870, 280, 1100);

// 3. weather tooltip
await moveTo(...(await center(`document.querySelector('.weather')`)), 900);
await sleep(1600);

// 4. search with bang autocomplete
await clickEl(`document.querySelector('input[type=search]')`, 800);
await sleep(300);
await type("!y", 160, 220);
await sleep(900);
await key("ArrowDown", "ArrowDown", 40);
await sleep(450);
await key("Tab", "Tab", 9);
await sleep(500);
await type("lofi hip hop radio");
await sleep(1300);
await key("Escape", "Escape", 27);
await sleep(250);
await ev(`(() => { const i = document.querySelector('input[type=search]'); i.select(); })()`);
await key("Backspace", "Backspace", 8);
await sleep(500);

// 5. hover a shortcut
await moveTo(...(await center(`document.querySelectorAll('.shortcuts .tile-wrap')[2]`)), 800);
await sleep(1000);

// 6. settings: background transitions
await clickEl(`document.querySelector('[aria-label="Settings"]')`, 900);
await sleep(700);
await clickEl(byText(".bg-option", "Shimmer"), 700);
await sleep(2000);
await clickEl(byText(".bg-option", "Stars"), 500);
await sleep(2100);
await clickEl(byText(".bg-option", "Shimmer"), 500);
await sleep(2000);

// 7. shortcuts tab: containers, single color
await clickEl(byText("header .segmented button", "Shortcuts"), 600);
await sleep(700);
await clickEl(byText("[role=switch]", "Icon containers"), 600);
await sleep(1100);
await clickEl(byText("[role=switch]", "Single color"), 600);
await sleep(1100);
await clickEl(`document.querySelector('.swatch[aria-label="Red"]')`, 500);
await sleep(800);
await clickEl(`document.querySelector('.swatch[aria-label="Purple"]')`, 400);
await sleep(800);
await clickEl(`document.querySelector('.swatch[aria-label="Accent"]')`, 400);
await sleep(800);
await clickEl(byText("[role=switch]", "Single color"), 500);
await sleep(700);
await clickEl(byText("[role=switch]", "Icon containers"), 500);
await sleep(900);

// 8. widgets tab
await clickEl(byText("header .segmented button", "Widgets"), 600);
await sleep(700);
await clickEl(byText("[role=switch]", "Seconds"), 600);
await sleep(1200);

// 9. close settings, focus mode on/off
await click(200, 560, 800);
await sleep(700);
await clickEl(`document.querySelector('[aria-label="Focus mode"]')`, 1000);
await sleep(1500);
await clickEl(`document.querySelector('[aria-label="Show everything"]')`, 400);
await sleep(1200);

// 10. outro
await moveTo(640, 610, 1100);
await sleep(1500);

recording = false;
await send("Page.stopScreencast");
writeFileSync(`${OUT}/timestamps.json`, JSON.stringify(frames));
console.log("frames:", frames.length, "seconds:", (frames.at(-1) - frames[0]).toFixed(1));
ws.close();
