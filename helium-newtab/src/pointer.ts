// Smoothed pointer position for cursor-reactive backgrounds, exposed as CSS variables on
// :root: --mx/--my in -1..1 from the center, --px/--py in pixels. Eases towards the
// pointer and stops animating once it has caught up. Off for touch and reduced motion.
const root = document.documentElement;
const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
const fine = window.matchMedia("(pointer: fine)");

let tx = innerWidth / 2, ty = innerHeight / 2;
let x = tx, y = ty;
let frame = 0;

function step() {
    x += (tx - x) * 0.08;
    y += (ty - y) * 0.08;
    root.style.setProperty("--px", `${x.toFixed(1)}px`);
    root.style.setProperty("--py", `${y.toFixed(1)}px`);
    root.style.setProperty("--mx", ((x / innerWidth) * 2 - 1).toFixed(4));
    root.style.setProperty("--my", ((y / innerHeight) * 2 - 1).toFixed(4));
    frame = Math.abs(tx - x) + Math.abs(ty - y) > 0.3 ? requestAnimationFrame(step) : 0;
}

window.addEventListener(
    "pointermove",
    (e) => {
        if (reduce.matches || !fine.matches || e.pointerType === "touch") return;
        tx = e.clientX;
        ty = e.clientY;
        if (!frame) frame = requestAnimationFrame(step);
    },
    { passive: true },
);

step();
