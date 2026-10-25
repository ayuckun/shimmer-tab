<script lang="ts">
    // Color choice for single-color icons: theme colors, a few presets and a custom one.
    let { value = $bindable(), onchange }: { value: string; onchange?: () => void } = $props();

    const presets = [
        { value: "accent", label: "Accent", color: "var(--helium-elevated)" },
        { value: "text", label: "Text", color: "var(--primary)" },
        { value: "#e5484d", label: "Red", color: "#e5484d" },
        { value: "#f5a524", label: "Amber", color: "#f5a524" },
        { value: "#30a46c", label: "Green", color: "#30a46c" },
        { value: "#8e4ec6", label: "Purple", color: "#8e4ec6" },
    ];

    const custom = $derived(!presets.some((p) => p.value === value));

    function pick(v: string) {
        value = v;
        onchange?.();
    }
</script>

<div class="swatches" role="radiogroup" aria-label="Icon color">
    {#each presets as preset (preset.value)}
        <button
            type="button"
            role="radio"
            aria-checked={value === preset.value}
            aria-label={preset.label}
            title={preset.label}
            class={["swatch", value === preset.value && "active"]}
            style:--swatch={preset.color}
            onclick={() => pick(preset.value)}
        ></button>
    {/each}
    <label
        class={["swatch", "custom", custom && "active"]}
        style:--swatch={custom ? value : undefined}
        title="Custom"
    >
        <input
            type="color"
            aria-label="Custom color"
            value={custom ? value : "#3450d1"}
            oninput={(e) => pick(e.currentTarget.value)}
        />
    </label>
</div>

<style>
    .swatches {
        display: flex;
        gap: 6px;
    }

    .swatch {
        position: relative;
        width: 22px;
        height: 22px;
        min-height: 0;
        padding: 0 !important;
        border: none;
        border-radius: 50%;
        background: var(--swatch) !important;
        box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.08);
        cursor: pointer;
        transition: transform 0.2s, box-shadow 0.2s;
    }

    .swatch:active {
        transform: scale(0.9);
    }

    .swatch.active {
        box-shadow:
            0 0 0 2px var(--background),
            0 0 0 4px var(--helium-elevated);
    }

    .custom {
        background: var(
            --swatch,
            conic-gradient(#e5484d, #f5a524, #30a46c, #0090ff, #8e4ec6, #e5484d)
        ) !important;
    }

    .custom input {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        opacity: 0;
        cursor: pointer;
    }

    .swatch:focus-visible,
    .custom:focus-within {
        outline: 2px solid var(--primary);
        outline-offset: 3px;
    }
</style>
