// The starfield is always dark, so on it the page switches to Prism's dark tokens
// even when the system is light. Components that pick light/dark assets read this.
const media = window.matchMedia("(prefers-color-scheme: dark)");

export const scheme = $state({ system: media.matches, forced: false });

media.addEventListener("change", () => (scheme.system = media.matches));

export const isDark = () => scheme.system || scheme.forced;

let recolorTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * `morph` lets every color on the page ease to the new scheme over that many ms
 * (in step with a background reveal) instead of flipping in one frame.
 */
export function forceDark(on: boolean, morph = 0) {
    if (scheme.forced === on && document.documentElement.hasAttribute("data-dark") === on) return;
    const root = document.documentElement;
    if (morph) {
        root.style.setProperty("--recolor", `${morph}ms`);
        root.setAttribute("data-recolor", "");
        clearTimeout(recolorTimer);
        recolorTimer = setTimeout(() => root.removeAttribute("data-recolor"), morph + 50);
    }
    scheme.forced = on;
    root.toggleAttribute("data-dark", on);
}
