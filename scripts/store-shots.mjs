// Chrome Web Store screenshots (1280×800) of the real extension.
// Usage: node store-shots.mjs <outdir> <dark|light>  (browser started by store-assets.sh)
import { writeFileSync } from "node:fs";
import { baseSettings as base, connect } from "./rec-lib.mjs";

const [OUT, theme] = process.argv.slice(2);
const r = await connect();
const { sleep } = r;
const gear = `document.querySelector('[aria-label="Settings"]')`;
const sw = (name) => r.byText("[role=switch]", name);

async function shot(name) {
    // hide the drawn cursor for stills
    await r.ev(`document.getElementById('demo-cursor')?.style.setProperty('display', 'none')`);
    const res = await r.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    writeFileSync(`${OUT}/${name}.png`, Buffer.from(res.result.data, "base64"));
    await r.ev(`document.getElementById('demo-cursor')?.style.removeProperty('display')`);
}

// warm caches first
await r.setup({ ...base, background: "shimmer" }, { wait: 8000 });
await r.ev(`fetch('bangs.json').then((res) => res.text())`);

if (theme === "dark") {
    // 1. the starfield with weather details
    await r.setup({ ...base, background: "stars" }, { wait: 3500 });
    await r.hover(`document.querySelector('.weather')`, 300);
    await sleep(800);
    await shot("screenshot-1");

    // 2. bangs autocomplete over the shimmer
    await r.setup({ ...base, background: "shimmer" }, { wait: 3500 });
    await r.clickEl(`document.querySelector('input[type=search]')`, 200);
    await r.type("!y", 60, 80);
    await sleep(700);
    await r.key("ArrowDown", 40);
    await sleep(400);
    await shot("screenshot-2");

    // 4. wallpapers flowing into each other
    await r.setup({ ...base, background: "stars" }, { wait: 3500 });
    await r.clickEl(gear, 200);
    await sleep(600);
    await r.clickEl(r.byText(".bg-option", "Shimmer"), 200);
    // mid-transition: the stripes are halfway down
    await sleep(170);
    await shot("screenshot-4");
    await sleep(1500);

    // 5. icon containers, tinted, with the shortcut settings
    await r.setup({ ...base, background: "stars", iconStyle: "contained", iconTint: true, tintColor: "accent" }, { tab: "shortcuts", wait: 3500 });
    await r.clickEl(gear, 200);
    await sleep(700);
    await shot("screenshot-5");
} else {
    // 3. settings in light, wallpaper picker
    await r.setup({ ...base, background: "shimmer" }, { tab: "look", wait: 3500 });
    await r.clickEl(gear, 200);
    await sleep(1500);
    await shot("screenshot-3");

    // extra: focus mode in light
    await r.setup({ ...base, background: "shimmer", quiet: true }, { wait: 3500 });
    await shot("screenshot-extra-focus-light");
}
process.exit(0);
