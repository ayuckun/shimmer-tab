// Downloads Helium's bang catalog and writes the compact copy the page loads lazily.
// Same idea as exsesx/helium-new-tab's scripts/refresh-bangs.js, without Bun.
import { writeFile } from "node:fs/promises";
import { compactCatalog } from "../src/lib/bangs.js";

const CATALOG_URL = "https://services.helium.imput.net/bangs.json";

const response = await fetch(CATALOG_URL, { signal: AbortSignal.timeout(30_000) });
if (!response.ok) throw new Error(`Bang catalog download failed: HTTP ${response.status}`);

// JSON with // comments and trailing commas
const source = await response.text();
const entries = JSON.parse(
    source.replace(/^\s*\/\/.*$/gm, "").replace(/,(\s*[\]}])/g, "$1"),
);
if (!Array.isArray(entries) || !entries.length) throw new Error("Expected a nonempty bang catalog");

const out = new URL("../public/bangs.json", import.meta.url);
await writeFile(out, JSON.stringify(compactCatalog(entries)));
const generatedAt = /^\/\/ Generated at (\S+)$/m.exec(source)?.[1] ?? "unknown";
console.log(`Wrote ${entries.length} bangs (generated ${generatedAt})`);
