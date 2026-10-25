// GradientShimmer sizes itself (and picks its stripe count) from getBoundingClientRect,
// which is already scaled down inside a preview. Report the unscaled size there so the
// preview renders exactly like the full-window background and is only shrunk visually.
const original = HTMLCanvasElement.prototype.getBoundingClientRect;

HTMLCanvasElement.prototype.getBoundingClientRect = function (this: HTMLCanvasElement) {
    const rect = original.call(this);
    const viewport = this.closest<HTMLElement>(".viewport");
    if (!viewport) return rect;
    return new DOMRect(rect.x, rect.y, viewport.offsetWidth, viewport.offsetHeight);
};
