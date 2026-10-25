<script lang="ts">
    import { untrack } from "svelte";
    import { cubicOut } from "svelte/easing";
    import { GradientShimmer, IconCheck, Input, Text, Toggle } from "@imput/helium-prism";
    import Row from "./Row.svelte";
    import Segmented from "./Segmented.svelte";
    import Swatches from "./Swatches.svelte";
    import Stars from "./Stars.svelte";
    import "./preview-hack";
    import { pop } from "./motion";
    import { defaults, normalize, type Settings } from "./storage.svelte";
    import { Button } from "@imput/helium-prism";

    type Props = {
        settings: Settings;
        themeVersion: number;
        themeUnreadable: boolean;
        emphasize: () => void;
        glass?: boolean;
        onclose: () => void;
    };

    let {
        settings = $bindable(),
        themeVersion,
        themeUnreadable,
        emphasize,
        glass = false,
        onclose,
    }: Props = $props();

    type Tab = "look" | "shortcuts" | "widgets" | "search" | "data";
    const tabs: { value: Tab; label: string }[] = [
        { value: "look", label: "Look" },
        { value: "shortcuts", label: "Shortcuts" },
        { value: "widgets", label: "Widgets" },
        { value: "search", label: "Search" },
        { value: "data", label: "Data" },
    ];

    // backup: everything lives in `settings` (shortcuts included), so that's the file
    const FORMAT = "shimmer-tab";
    const OLD_FORMATS = ["helium-prism-newtab"];
    let importInput: HTMLInputElement | undefined = $state();
    let dataNote = $state("");
    let confirmReset = $state(false);

    function exportSettings() {
        const data = { format: FORMAT, version: 1, exported: new Date().toISOString(), settings: $state.snapshot(settings) };
        const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = `shimmer-tab-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        dataNote = "Saved to your downloads.";
        emphasize();
    }

    async function importSettings(file: File | undefined) {
        if (!file) return;
        try {
            const data = JSON.parse(await file.text());
            const raw = data?.format === FORMAT || OLD_FORMATS.includes(data?.format) ? data.settings : data;
            if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error();
            Object.assign(settings, normalize(raw));
            dataNote = `Imported ${settings.links.length} shortcuts and your settings.`;
            emphasize();
        } catch {
            dataNote = "That file isn't a settings backup.";
        }
        if (importInput) importInput.value = "";
    }

    function resetSettings() {
        if (!confirmReset) {
            confirmReset = true;
            setTimeout(() => (confirmReset = false), 4000);
            return;
        }
        Object.assign(settings, structuredClone(defaults));
        confirmReset = false;
        dataNote = "Back to defaults.";
        emphasize();
    }

    let tab: Tab = $state(
        (() => {
            try {
                const fromHash = location.hash.match(/^#settings-(\w+)/)?.[1] as Tab | undefined;
                if (fromHash && tabs.some((t) => t.value === fromHash)) return fromHash;
                return (localStorage.getItem("settings-tab") as Tab) || "look";
            } catch {
                return "look";
            }
        })(),
    );

    $effect(() => {
        try {
            localStorage.setItem("settings-tab", tab);
        } catch {}
    });

    const backgrounds: { value: Settings["background"]; label: string }[] = [
        { value: "shimmer", label: "Shimmer" },
        { value: "stars", label: "Stars" },
        { value: "random", label: "Random" },
        { value: "none", label: "None" },
    ];

    // previews render the real background at window size and scale it down
    let winW = $state(window.innerWidth);
    let winH = $state(window.innerHeight);
    let tileW = $state(0);
    const previewScale = $derived(tileW / winW || 0.1);

    let panel: HTMLElement | undefined = $state();

    // tab switch morph: the body animates to the new content height while the new
    // pane slides in from the side of the tab you moved to
    let contentH = $state(0);
    let morph = $state(false);
    $effect(() => {
        // only animate after the first layout, not on open
        if (contentH && !untrack(() => morph)) requestAnimationFrame(() => (morph = true));
    });

    // Prism-style swap (like its CopyIcon/Tooltip): the old pane shrinks and fades out
    // while the new one grows in, 0.2s ease, while the body eases to the new height
    function swapIn(_node: Element) {
        if (!morph) return { duration: 0 };
        return {
            duration: 200,
            easing: cubicOut,
            css: (e: number) => {
                return `opacity: ${e}; transform: scale(${0.96 + 0.04 * e});`;
            },
        };
    }

    function swapOut(_node: Element) {
        if (!morph) return { duration: 0 };
        return {
            duration: 150,
            easing: cubicOut,
            css: (e: number) => {
                // out of the flow so the new pane takes its place right away
                return `position: absolute; inset: var(--gap-1) var(--gap-4) auto; opacity: ${e}; transform: scale(${0.96 + 0.04 * e});`;
            },
        };
    }


    function onPointerDown(e: PointerEvent) {
        const target = e.target as Element | null;
        if (panel && target && !panel.contains(target) && !target.closest(".corner")) onclose();
    }
</script>

<svelte:window
    bind:innerWidth={winW}
    bind:innerHeight={winH}
    onkeydown={(e) => e.key === "Escape" && onclose()}
    onpointerdown={onPointerDown}
/>

<aside
    bind:this={panel}
    class={["panel", glass && "glass"]}
    aria-label="Settings"
    transition:pop|global
>
    <header>
        <Text variant="subheading">Settings</Text>
        <Segmented options={tabs} bind:value={tab} label="Settings section" />
    </header>

    <div class="body" style:height={contentH ? `${contentH}px` : undefined} class:morph>
        <div class="content" bind:clientHeight={contentH}>
        {#key tab}
        <div class="pane" in:swapIn out:swapOut>
        {#if tab === "look"}
            <section>
                <h5>Background</h5>
                <div class="backgrounds" role="radiogroup" aria-label="Background">
                    {#each backgrounds as option, i (option.value)}
                        <button
                            type="button"
                            role="radio"
                            aria-checked={settings.background === option.value}
                            class={["bg-option", settings.background === option.value && "active"]}
                            onclick={() => {
                                settings.background = option.value;
                                emphasize();
                            }}
                        >
                            <span class="bg-preview" style:aspect-ratio="{winW} / {winH}">
                                {#if i === 0}
                                    <span class="measure" bind:clientWidth={tileW}></span>
                                {/if}
                                <span
                                    class="viewport"
                                    style:width="{winW}px"
                                    style:height="{winH}px"
                                    style:transform="scale({previewScale})"
                                >
                                    {#if option.value === "shimmer" || option.value === "random"}
                                        {#key themeVersion}
                                            <GradientShimmer intro={false} />
                                        {/key}
                                    {/if}
                                    {#if option.value === "stars" || option.value === "random"}
                                        <span class={["layer", option.value === "random" && "split"]}>
                                            <Stars preview starSize={0.8 / previewScale} />
                                        </span>
                                    {/if}
                                </span>
                                {#if settings.background === option.value}
                                    <span class="check" aria-hidden="true"><IconCheck /></span>
                                {/if}
                                {#if option.value === "random"}
                                    <svg class="dice" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 5a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2z" /><path d="M8.5 8.5m-.5 0a.5 .5 0 1 0 1 0a.5 .5 0 1 0 -1 0" fill="currentColor" /><path d="M15.5 8.5m-.5 0a.5 .5 0 1 0 1 0a.5 .5 0 1 0 -1 0" fill="currentColor" /><path d="M15.5 15.5m-.5 0a.5 .5 0 1 0 1 0a.5 .5 0 1 0 -1 0" fill="currentColor" /><path d="M8.5 15.5m-.5 0a.5 .5 0 1 0 1 0a.5 .5 0 1 0 -1 0" fill="currentColor" /></svg>
                                {/if}
                            </span>
                            <span class="bg-label">{option.label}</span>
                        </button>
                    {/each}
                </div>
            </section>

            <section>
                <h5>Appearance</h5>
                <div class="list">
                    <Toggle bind:checked={settings.logoText} onchange={emphasize} name="Logo text" desc="“Helium” next to the mark" />
                    <Toggle bind:checked={settings.quiet} onchange={emphasize} name="Focus mode" desc="Only the logo and search (eye button)" />
                    <Toggle
                        bind:checked={settings.browserTheme}
                        onchange={emphasize}
                        name="Browser colors"
                        desc={themeUnreadable
                            ? "Allow access to file URLs for this extension"
                            : "Follow the browser theme color"}
                    />
                </div>
            </section>
        {:else if tab === "shortcuts"}
            <section>
                <h5>Shortcuts</h5>
                <div class="list">
                    <Toggle bind:checked={settings.shortcuts} onchange={emphasize} name="Show shortcuts" desc="Hover to edit, drag to reorder" />
                    {#if settings.shortcuts}
                        <Toggle bind:checked={settings.shortcutTitles} onchange={emphasize} name="Names" />
                        <Toggle
                            checked={settings.iconStyle === "contained"}
                            onchange={(on) => {
                                settings.iconStyle = on ? "contained" : "plain";
                                emphasize();
                            }}
                            name="Icon containers"
                        />
                        <Toggle bind:checked={settings.iconTint} onchange={emphasize} name="Single color" desc="Paint all icons in one color" />
                        {#if settings.iconTint}
                            <Row name="Color">
                                <Swatches bind:value={settings.tintColor} onchange={emphasize} />
                            </Row>
                        {/if}
                        <Toggle bind:checked={settings.lockShortcuts} onchange={emphasize} name="Lock" desc="Hide add and edit buttons" />
                    {/if}
                </div>
            </section>

            <section>
                <h5>History</h5>
                <div class="list">
                    <Toggle bind:checked={settings.topSites} onchange={emphasize} name="Most visited" desc="Top sites below your shortcuts" />
                </div>
            </section>
        {:else if tab === "widgets"}
            <section>
                <h5>Clock</h5>
                <div class="list">
                    <Toggle bind:checked={settings.clock} onchange={emphasize} name="Date and time" desc="At the top of the page" />
                    {#if settings.clock}
                        <Row name="Format">
                            <Segmented
                                small
                                options={[
                                    { value: "24", label: "24h" },
                                    { value: "12", label: "12h" },
                                ]}
                                value={settings.hour12 ? "12" : "24"}
                                label="Clock format"
                                onchange={(v) => {
                                    settings.hour12 = v === "12";
                                    emphasize();
                                }}
                            />
                        </Row>
                        <Toggle bind:checked={settings.seconds} onchange={emphasize} name="Seconds" />
                    {/if}
                </div>
            </section>

            <section>
                <h5>Weather</h5>
                <div class="list">
                    <Toggle bind:checked={settings.weather} onchange={emphasize} name="Weather" desc="Next to the clock, by Open-Meteo" />
                    {#if settings.weather}
                        <Row name="City">
                            <Input
                                small
                                width="150px"
                                bind:value={settings.city}
                                aria-label="City"
                                placeholder="Berlin"
                                spellcheck="false"
                            />
                        </Row>
                        <Row name="Units">
                            <Segmented
                                small
                                options={[
                                    { value: "c", label: "°C" },
                                    { value: "f", label: "°F" },
                                ]}
                                value={settings.fahrenheit ? "f" : "c"}
                                label="Temperature unit"
                                onchange={(v) => {
                                    settings.fahrenheit = v === "f";
                                    emphasize();
                                }}
                            />
                        </Row>
                    {/if}
                </div>
            </section>
        {:else if tab === "data"}
            <section>
                <h5>Backup</h5>
                <div class="list">
                    <Row name="Export" desc="Settings and shortcuts as a JSON file">
                        <Button onclick={exportSettings}>Save</Button>
                    </Row>
                    <Row name="Import" desc="Restore from a saved file">
                        <Button onclick={() => importInput?.click()}>Open</Button>
                    </Row>
                </div>
                <input
                    bind:this={importInput}
                    class="file"
                    type="file"
                    accept="application/json,.json"
                    onchange={(e) => importSettings(e.currentTarget.files?.[0])}
                />
                {#if dataNote}
                    {#key dataNote}
                        <p class="note" in:pop={{ from: 0.96, duration: 150 }}>{dataNote}</p>
                    {/key}
                {/if}
            </section>

            <section>
                <h5>Reset</h5>
                <div class="list">
                    <Row name="Defaults" desc="Your shortcuts are reset too">
                        <Button onclick={resetSettings} class={[confirmReset && "danger"]}>
                            {confirmReset ? "Sure?" : "Reset"}
                        </Button>
                    </Row>
                </div>
            </section>
        {:else}
            <section>
                <h5>Search</h5>
                <div class="list">
                    <Toggle bind:checked={settings.bangs} onchange={emphasize} name="Bangs" desc="!yt cats, !w helium, !gh prism" />
                </div>
                <p class="note">Everything else goes to your default search engine.</p>
            </section>
        {/if}
        </div>
        {/key}
        </div>
    </div>
</aside>

<style>
    .panel {
        position: fixed;
        right: 16px;
        bottom: 68px;
        z-index: 4;
        display: flex;
        flex-direction: column;
        width: min(calc(100vw - 32px), 400px);
        max-height: calc(100vh - 88px);
        overflow: hidden;
        border-radius: var(--card-border-radius);
        /* like Prism's tooltip: the corner pointing at the button is the sharp one */
        border-bottom-right-radius: 6px;
        background: var(--background);
        outline: 1.5px solid var(--helium-elevated-10);
        outline-offset: -1.5px;
        box-shadow: 4px 4px 24px 0 var(--tooltip-shadow);
        transform-origin: bottom right;
    }

    /* the glass goes on the panel itself; per-child backdrop filters escape rounded clips */
    .panel.glass {
        background: color-mix(in srgb, var(--background) 80%, transparent);
        backdrop-filter: var(--glass-filter) blur(12px);
    }

    header {
        display: flex;
        flex-direction: column;
        gap: var(--gap-3);
        padding: var(--gap-4) var(--gap-4) var(--gap-3);
    }

    header :global(h4) {
        margin: 0;
        font-size: 18px;
        font-weight: 600;
    }

    .body {
        flex: 0 1 auto;
        min-height: 0;
        overflow-x: hidden;
        overflow-y: auto;
    }

    .body.morph {
        transition: height 0.2s ease;
    }

    .content {
        position: relative;
        padding: var(--gap-1) var(--gap-4) var(--gap-4);
    }

    .pane {
        transform-origin: top center;
        display: flex;
        flex-direction: column;
        gap: var(--gap-4);
    }

    section {
        display: flex;
        flex-direction: column;
        gap: var(--gap-2);
    }

    h5 {
        margin: 0;
        padding: 0 var(--gap-1);
        color: var(--tertiary);
        font-size: 13px;
        font-weight: 500;
    }

    .file {
        display: none;
    }

    .list :global(.danger) {
        color: #fff;
        background-color: #e5484d !important;
    }

    .note {
        margin: 0;
        padding: 0 var(--gap-1);
        color: var(--tertiary);
        font-size: 13px;
    }

    /* grouped Prism cards: 2px apart, big radius only on the outer corners */
    .list {
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    .list > :global(*) {
        border-radius: 5px;
        background-color: var(--helium-elevated-7);
    }

    .list > :global(:first-child) {
        border-top-left-radius: 14px;
        border-top-right-radius: 14px;
    }

    .list > :global(:last-child) {
        border-bottom-left-radius: 14px;
        border-bottom-right-radius: 14px;
    }

    .list :global(.toggle-button) {
        min-height: 54px;
        padding: 10px 14px 10px 16px;
    }

    .list :global(.toggle-button:active) {
        transform: none;
        background-color: var(--helium-elevated-15);
    }

    .list :global(h4) {
        font-size: 15px;
    }

    .list :global(p) {
        font-size: 13px;
    }

    .list > :global(.row) {
        --row-height: 54px;
        --row-padding: 10px 10px 10px 16px;
    }

    /* background picker */
    .backgrounds {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: var(--gap-2);
    }

    .bg-option {
        display: flex;
        flex-direction: column;
        align-items: stretch;
        gap: 6px;
        width: 100%;
        min-width: 0;
        /* Prism pads buttons that contain an svg */
        padding: 0 !important;
        border: none;
        background: none;
        color: var(--tertiary);
        font: inherit;
        font-size: 12px;
        cursor: pointer;
    }

    .bg-preview {
        position: relative;
        display: block;
        width: 100%;
        max-height: 56px;
        overflow: hidden;
        border-radius: 10px;
        background: var(--background);
        outline: 1px solid var(--helium-elevated-15);
        outline-offset: -1px;
        transition: outline-color 0.15s, transform 0.15s, box-shadow 0.15s;
    }

    .bg-option:hover .bg-preview {
        outline-color: var(--helium-elevated-40);
    }

    .bg-option:active .bg-preview {
        transform: scale(0.96);
    }

    .bg-option.active {
        color: var(--primary);
    }

    .bg-option.active .bg-preview {
        outline: 2px solid var(--helium-elevated);
        outline-offset: -2px;
        box-shadow: 0 0 0 3px var(--helium-elevated-15);
    }

    .bg-option:focus-visible {
        outline: none;
    }

    .bg-option:focus-visible .bg-preview {
        box-shadow: 0 0 0 3px var(--helium-elevated-40);
    }

    .bg-label {
        text-align: center;
    }

    .measure {
        position: absolute;
        inset: 0;
    }

    .viewport {
        position: absolute;
        top: 0;
        left: 0;
        transform-origin: 0 0;
        pointer-events: none;
    }

    .layer {
        position: absolute;
        inset: 0;
    }

    .layer.split {
        clip-path: polygon(60% 0, 100% 0, 100% 100%, 40% 100%);
    }

    .dice {
        position: absolute;
        top: 50%;
        left: 50%;
        width: 18px;
        height: 18px;
        transform: translate(-50%, -50%);
        color: #fff;
        filter: drop-shadow(0 1px 3px rgb(0 0 0 / 0.4));
    }

    .check {
        position: absolute;
        right: 4px;
        bottom: 4px;
        z-index: 1;
        display: grid;
        place-items: center;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: var(--helium-elevated);
        color: var(--background);
    }

    .check :global(svg) {
        width: 11px;
        height: 11px;
        stroke-width: 3;
    }
</style>
