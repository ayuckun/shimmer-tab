// Make the page feel like browser UI rather than a document:
// no page zoom, no text selection outside inputs, no context menu, no dragging.
const editable = (t: EventTarget | null) =>
    t instanceof HTMLElement && !!t.closest("input, textarea, [contenteditable]");

window.addEventListener(
    "wheel",
    (e) => {
        if (e.ctrlKey || e.metaKey) e.preventDefault(); // ctrl+wheel and touchpad pinch
    },
    { passive: false },
);

window.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && ["=", "+", "-", "_", "0"].includes(e.key)) e.preventDefault();
});

for (const type of ["gesturestart", "gesturechange"]) {
    window.addEventListener(type, (e) => e.preventDefault(), { passive: false });
}

window.addEventListener("contextmenu", (e) => {
    if (!editable(e.target)) e.preventDefault();
});

window.addEventListener("dragstart", (e) => {
    const sortable = e.target instanceof HTMLElement && e.target.closest('[draggable="true"]');
    if (!editable(e.target) && !sortable) e.preventDefault();
});

window.addEventListener("selectstart", (e) => {
    if (!editable(e.target)) e.preventDefault();
});
