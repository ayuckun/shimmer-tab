<script lang="ts">
    import { onMount } from "svelte";
    import { drop, morphPage, pop, recede, reveal } from "./motion";
    import { forceDark } from "./scheme.svelte";
    import { perms } from "./permissions.svelte";
    import {
        Button,
        GradientShimmer,
        HeliumLogo,
        Input,
        IconSearch,
        Tooltip,
        IconBang,
    } from "@imput/helium-prism";
    import { resolveBang, resolveBangAsync, suggestBangs } from "./bangs.svelte";
    import Stars from "./Stars.svelte";
    import Settings from "./Settings.svelte";
    import Shortcuts from "./Shortcuts.svelte";
    import SiteIcon from "./SiteIcon.svelte";
    import WeatherIcon from "./WeatherIcon.svelte";
    import { describe, getWeather, peekWeather, type Weather } from "./weather";
    import {
        loadCached,
        load,
        normalizeUrl,
        save,
        type Settings as SettingsData,
        type Shortcut,
    } from "./storage.svelte";
    import {
        applyBrowserTheme,
        clearBrowserTheme,
        onSchemeChange,
        refreshBrowserTheme,
    } from "./theme";

    let settings: SettingsData = $state(loadCached());
    let ready = $state(false);
    let query = $state("");
    let now = $state(new Date());
    // #settings or #settings-<tab> opens the panel (handy for screenshots)
    let settingsOpen = $state(location.hash.startsWith("#settings"));
    let shimmer: { emphasize: () => void } | undefined = $state();

    const emphasize = () => shimmer?.emphasize();


    // picked once per tab
    const randomPick = Math.random() < 0.5 ? "shimmer" : "stars";
    const bg = $derived(settings.background === "random" ? randomPick : settings.background);

    const tint = $derived(
        !settings.iconTint
            ? null
            : settings.tintColor === "accent"
              ? "var(--helium-elevated)"
              : settings.tintColor === "text"
                ? "var(--primary)"
                : settings.tintColor,
    );

    // The starfield forces Prism's dark colors. On load that happens right away; when
    // switching, every color eases over in step with the background reveal.
    forceDark(bg === "stars");
    if (settings.browserTheme) refreshBrowserTheme();
    let darkBg = bg;
    $effect(() => {
        const switching = bg !== darkBg;
        darkBg = bg;
        const dark = bg === "stars";
        const apply = () => {
            forceDark(dark, switching ? 1100 : 0);
            if (settings.browserTheme && refreshBrowserTheme()) themeVersion++;
        };
        // a frame later, so the outgoing wallpaper has captured its own colors first
        if (switching) requestAnimationFrame(apply);
        else apply();
    });

    // which wallpaper is on screen, for picking the transition into the next one
    let shownBg: string = bg;
    function enter(node: Element) {
        const from = shownBg;
        shownBg = bg;
        // stars → shimmer: stripes punch down from the top; everything else flows
        return from === "stars" && bg === "shimmer" ? drop(node) : reveal(node);
    }

    // the page UI rises in after the star entrance (see Stars.svelte)
    const starsEntrance =
        bg === "stars" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let starsArrived = $state(!starsEntrance);
    if (starsEntrance) setTimeout(() => (starsArrived = true), 1000); // never stay hidden

    // the shimmer's intro reveal is for page load only, not for switching to it
    let bgSwitched = false;
    let firstBg: string | null = null;
    $effect(() => {
        if (!ready) return;
        firstBg ??= bg;
        if (bg !== firstBg) bgSwitched = true;
    });


    // bumped to remount the shimmer, which only reads its colors on mount
    let themeVersion = $state(0);
    let themeUnreadable = $state(false);

    let themeToggled = false;

    async function syncTheme() {
        if (!settings.browserTheme) return;
        const changed = await applyBrowserTheme();
        themeUnreadable = changed === null;
        if (changed) themeVersion++;
    }

    onMount(() => {
        load().then((s) => {
            settings = s;
            ready = true;
        });
        const t = setInterval(() => (now = new Date()), 1000);
        const onVisible = () => document.visibilityState === "visible" && syncTheme();
        document.addEventListener("visibilitychange", onVisible);
        const offScheme = onSchemeChange(syncTheme);
        return () => {
            offScheme();
            clearInterval(t);
            document.removeEventListener("visibilitychange", onVisible);
        };
    });

    $effect(() => {
        if (ready) save(settings);
    });

    $effect(() => {
        if (!ready) return;
        const on = settings.browserTheme;
        const run = async () => {
            if (on) {
                await syncTheme();
            } else {
                themeUnreadable = false;
                if (clearBrowserTheme()) themeVersion++;
            }
        };
        // toggling it morphs the whole page into the new palette; the first run doesn't
        if (themeToggled) morphPage(run);
        else run();
        themeToggled = true;
    });

    const time = $derived(
        now.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: settings.seconds ? "2-digit" : undefined,
            hour12: settings.hour12,
        }),
    );
    const date = $derived(
        now.toLocaleDateString([], { weekday: "short", day: "numeric", month: "long" }),
    );

    // Keyword mode like Helium's omnibox: a complete "!yt " leaves the text and
    // turns into the service chip; Backspace at the start or Esc leaves it.
    let keyword: string | null = $state(null);
    let searchInput: HTMLInputElement | undefined = $state();

    const bang = $derived(
        !settings.bangs ? null : keyword ? resolveBang(`!${keyword} ${query}`) : resolveBang(query),
    );

    $effect(() => {
        if (!settings.bangs || keyword) return;
        const m = query.match(/(?:^|\s)!(\S+)\s/);
        if (!m || !resolveBang(`!${m[1]}`)) return;
        keyword = m[1];
        query = (query.slice(0, m.index) + " " + query.slice(m.index! + m[0].length)).trimStart();
        queueMicrotask(() => searchInput?.setSelectionRange(query.length, query.length));
    });

    $effect(() => {
        if (!settings.bangs) keyword = null;
    });

    // Type-to-search: a printable key pressed anywhere outside a text field moves focus
    // into the search bar, and since focus moves during keydown the character lands there.
    function typeToSearch(e: KeyboardEvent) {
        if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
        if (e.key.length !== 1 || !searchInput || document.activeElement === searchInput) return;
        const target = e.target as HTMLElement | null;
        if (target?.closest("input, textarea, select, [contenteditable]")) return;
        if (e.key === " " && target?.closest("button, a, [role=switch], [role=radio]")) return;
        searchInput.focus();
    }

    // Bang autocomplete: while a "!…" word is being typed at the end of the query,
    // list matching services; arrows move, Enter/Tab picks, Esc dismisses.
    let bangIndex = $state(0);
    let bangDismissed = $state("");
    const bangPrefix = $derived(
        settings.bangs && !keyword ? (query.match(/(?:^|\s)!(\S*)$/)?.[1] ?? null) : null,
    );
    const bangSuggestions = $derived(
        bangPrefix !== null && bangDismissed !== query ? suggestBangs(bangPrefix) : [],
    );
    $effect(() => {
        void bangPrefix;
        bangIndex = 0;
    });

    function pickBang(trigger: string) {
        query = query.replace(/!(\S*)$/, `!${trigger} `);
        searchInput?.focus();
    }

    function onSearchKey(e: KeyboardEvent) {
        if (bangSuggestions.length) {
            const n = bangSuggestions.length;
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                bangIndex = (bangIndex + (e.key === "ArrowDown" ? 1 : n - 1)) % n;
                return;
            }
            if (e.key === "Tab" || (e.key === "Enter" && bangPrefix)) {
                e.preventDefault();
                pickBang(bangSuggestions[bangIndex].trigger);
                return;
            }
            if (e.key === "Escape") {
                e.preventDefault();
                bangDismissed = query;
                return;
            }
        }
        if (!keyword) return;
        const atStart = searchInput?.selectionStart === 0 && searchInput?.selectionEnd === 0;
        if ((e.key === "Backspace" && atStart) || e.key === "Escape") {
            e.preventDefault();
            keyword = null;
        }
    }

    // how much sits under the search bar (see .shell); only animate after the first layout
    let belowH = $state(0);
    let settled = $state(false);
    onMount(() => {
        const t = setTimeout(() => (settled = true), 600);
        return () => clearTimeout(t);
    });

    let weather: Weather | null = $state(
        settings.weather ? peekWeather(settings.city, settings.fahrenheit) : null,
    );
    // last known list for the first frame, refreshed right after
    let top: Shortcut[] = $state(
        (() => {
            try {
                return JSON.parse(localStorage.getItem("top-sites") ?? "[]");
            } catch {
                return [];
            }
        })(),
    );

    // debounced so typing a city doesn't fire a request per key
    $effect(() => {
        if (!ready) return;
        if (!settings.weather) return (weather = null);
        const { city, fahrenheit } = settings;
        const t = setTimeout(async () => (weather = await getWeather(city, fahrenheit)), 500);
        return () => clearTimeout(t);
    });

    $effect(() => {
        void perms.topSites; // the API shows up once the optional permission is granted
        if (!settings.topSites || typeof chrome === "undefined" || !chrome.topSites) return;
        chrome.topSites.get((sites) => {
            top = sites.slice(0, 8).map(({ title, url }) => ({ title, url }));
            try {
                localStorage.setItem("top-sites", JSON.stringify(top));
            } catch {}
        });
    });

    async function search(e: SubmitEvent) {
        e.preventDefault();
        const text = keyword ? `!${keyword} ${query.trim()}` : query.trim();
        if (!text) return;
        emphasize();
        const match = settings.bangs ? await resolveBangAsync(text) : null;
        if (match) {
            location.href = match.url;
            return;
        }
        const asUrl = /^\S+\.\S+$/.test(text) && !text.includes(" ") ? normalizeUrl(text) : null;
        if (asUrl) {
            location.href = asUrl;
        } else if (typeof chrome !== "undefined" && chrome.search) {
            chrome.search.query({ text, disposition: "CURRENT_TAB" });
        } else {
            location.href = `https://duckduckgo.com/?q=${encodeURIComponent(text)}`;
        }
    }

</script>

<!-- backgrounds crossfade when switched -->
<svelte:window onkeydown={typeToSearch} />

{#key bg}
    <div
        class="bg-layer"
        in:enter
        out:recede
        onintroend={() => bgSwitched && shimmer?.emphasize()}
    >
        {#if bg === "shimmer"}
            {#key themeVersion}
                <GradientShimmer
                    bind:this={shimmer}
                    background
                    intro={themeVersion === 0 && !bgSwitched}
                    class="bg"
                />
            {/key}
        {:else if bg === "stars"}
            <Stars intro={!bgSwitched} onintro={() => (starsArrived = true)} />
        {/if}
    </div>
{/key}

{#if (settings.clock || weather) && starsArrived && !settings.quiet}
    <header class="datetime" transition:pop>
        {#if settings.clock}
            <span class="group" transition:pop>
                <!-- a new format (12/24h, seconds) pops in instead of jumping -->
                {#key `${settings.hour12}${settings.seconds}`}
                    <span class="time" in:pop={{ from: 0.9, duration: 200 }}>{time}</span>
                {/key}
                <span class="dot" aria-hidden="true">·</span>
                <span class="date">{date}</span>
            </span>
        {/if}
        {#if settings.clock && weather}
            <span class="dot" aria-hidden="true" transition:pop>·</span>
        {/if}
        {#if weather}
            {@const info = describe(weather.code)}
            {@const w = weather}
            <span class="group" transition:pop>
            <Tooltip>
                {#snippet anchor()}
                    <span class="weather" tabindex="0" aria-label="{w.temp}°, {info.label}">
                        {#key `${w.code}${w.day}`}
                            <span class="wi" in:pop={{ duration: 200 }}>
                                <WeatherIcon kind={info.kind} day={w.day} />
                            </span>
                        {/key}
                        {#key `${w.temp}${w.unit}`}
                            <span in:pop={{ from: 0.9, duration: 200 }}>{w.temp}°</span>
                        {/key}
                    </span>
                {/snippet}
                {#snippet content()}
                    <div class="weather-details">
                        <div class="wd-head">
                            <WeatherIcon kind={info.kind} day={w.day} />
                            <div>
                                <div class="wd-temp">{w.temp}°{w.unit}</div>
                                <div class="wd-label">{info.label}</div>
                            </div>
                        </div>
                        <div class="wd-place">{[w.place, w.country].filter(Boolean).join(", ")}</div>
                        <dl>
                            {#if w.feels !== undefined}<dt>Feels like</dt><dd>{w.feels}°</dd>{/if}
                            {#if w.high !== undefined && w.low !== undefined}<dt>High / low</dt><dd>{w.high}° / {w.low}°</dd>{/if}
                            {#if w.rain !== undefined}<dt>Precipitation</dt><dd>{w.rain}%</dd>{/if}
                            {#if w.humidity !== undefined}<dt>Humidity</dt><dd>{w.humidity}%</dd>{/if}
                            {#if w.wind !== undefined}<dt>Wind</dt><dd>{w.wind} {w.unit === "F" ? "mph" : "km/h"}</dd>{/if}
                        </dl>
                    </div>
                {/snippet}
            </Tooltip>
            </span>
        {/if}
    </header>
{/if}


<main
    style:--below="{belowH}px"
    class={["shell", settled && "settled", bg !== "none" && "glass-children", !starsArrived && "waiting", starsEntrance && "entrance"]}>
    <!-- fixed box: both variants swap in place without moving the search -->
    <div class="logo">
        {#key settings.logoText}
            <div class="logo-variant" transition:pop>
                {#if settings.logoText}
                    <HeliumLogo height="44px" text />
                {:else}
                    <HeliumLogo height="56px" />
                {/if}
            </div>
        {/key}
    </div>

    <form class="search" onsubmit={search}>
        <!-- like Helium's omnibox keyword mode (and exsesx/helium-new-tab):
             service icon and name, then a divider before the query -->
        <Input
            bind:value={query}
            bind:input={searchInput}
            onkeydown={onSearchKey}
            width="100%"
            type="search"
            aria-label="Search"
            aria-describedby="search-service"
            placeholder={keyword && bang ? `Search ${bang.service}` : "Search or enter address"}
            autocomplete="off"
            spellcheck="false"
            enterkeyhint="search"
            class={["search-input", bang && "keyword"]}
            onfocus={emphasize}
        >
            {#snippet leading()}
                <span class="search-icon">
                    {#if bang?.siteOrigin}
                        <!-- same icons as the shortcuts: vector logos for popular services -->
                        {#key bang.siteOrigin}
                            <SiteIcon url={bang.siteOrigin} title={bang.service} size={18} />
                        {/key}
                    {:else if bang}
                        <IconBang />
                    {:else}
                        <IconSearch />
                    {/if}
                </span>
                {#if bang}
                    <span id="search-service" class="service-name" transition:pop>{bang.service}</span>
                {/if}
            {/snippet}
        </Input>

        {#if bangSuggestions.length}
            <ul class="bang-list" role="listbox" aria-label="Bangs" transition:pop={{ from: 0.96, duration: 150 }}>
                {#each bangSuggestions as item, i (item.trigger + item.service)}
                    <li role="option" aria-selected={i === bangIndex}>
                        <button
                            type="button"
                            class={["bang-item", i === bangIndex && "active"]}
                            onpointerenter={() => (bangIndex = i)}
                            onpointerdown={(e) => e.preventDefault()}
                            onclick={() => pickBang(item.trigger)}
                        >
                            <span class="bang-icon">
                                {#if item.origin}
                                    <SiteIcon url={item.origin} title={item.service} size={18} />
                                {:else}
                                    <IconBang />
                                {/if}
                            </span>
                            <span class="bang-trigger">!{item.trigger}</span>
                            <span class="bang-service">{item.service}</span>
                        </button>
                    </li>
                {/each}
            </ul>
        {/if}
    </form>

    <!-- everything under the search; its height decides how far up the page sits -->
    <div class="below" bind:clientHeight={belowH}>
        {#if settings.shortcuts && !settings.quiet}
            <div class="row" transition:pop={{ from: 0.96, duration: 200 }}>
            <Shortcuts
                bind:items={settings.links}
                readonly={settings.lockShortcuts}
                contained={settings.iconStyle === "contained"}
                titles={settings.shortcutTitles}
                {tint}
                label="Shortcuts"
                onchange={emphasize}
            />
            </div>
        {/if}
        {#if settings.topSites && top.length && !settings.quiet}
            <div class="row most-visited" transition:pop={{ from: 0.96, duration: 200 }}>
                {#if settings.shortcuts}
                    <div class="divider" aria-hidden="true"><span>Most visited</span></div>
                {/if}
            <Shortcuts
                items={top}
                readonly
                contained={settings.iconStyle === "contained"}
                titles={settings.shortcutTitles}
                {tint}
                label="Most visited"
            />
            </div>
        {/if}
    </div>
</main>

<div class={["corner", settingsOpen && "open"]}>
    <Button
        circle
        transparent
        selected={settings.quiet}
        aria-label={settings.quiet ? "Show everything" : "Focus mode"}
        title={settings.quiet ? "Show everything" : "Focus mode: just the search"}
        onclick={() => {
            settings.quiet = !settings.quiet;
            emphasize();
        }}
    >
        {#key settings.quiet}
            <span class="corner-icon" in:pop={{ duration: 200 }}>
                {#if settings.quiet}
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.585 10.587a2 2 0 0 0 2.829 2.828" /><path d="M16.681 16.673a8.717 8.717 0 0 1 -4.681 1.327c-3.6 0 -6.6 -2 -9 -6c1.272 -2.12 2.712 -3.678 4.32 -4.674m2.86 -1.146a9.055 9.055 0 0 1 1.82 -.18c3.6 0 6.6 2 9 6c-.666 1.11 -1.379 2.067 -2.138 2.87" /><path d="M3 3l18 18" /></svg>
                {:else}
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 12a2 2 0 1 0 4 0a2 2 0 0 0 -4 0" /><path d="M21 12c-2.4 4 -5.4 6 -9 6c-3.6 0 -6.6 -2 -9 -6c2.4 -4 5.4 -6 9 -6c3.6 0 6.6 2 9 6" /></svg>
                {/if}
            </span>
        {/key}
    </Button>
    <Button
        circle
        transparent
        selected={settingsOpen}
        aria-label="Settings"
        onclick={() => {
            settingsOpen = !settingsOpen;
            emphasize();
        }}
    >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065z" /><path d="M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" /></svg>
    </Button>
</div>

{#if settingsOpen}
    <Settings
        bind:settings
        {themeVersion}
        {themeUnreadable}
        {emphasize}
        glass={bg !== "none"}
        onclose={() => (settingsOpen = false)}
    />
{/if}

<style>
    :global(html),
    :global(body) {
        height: 100%;
        overflow-x: hidden;
    }

    .bg-layer {
        position: fixed;
        inset: 0;
        z-index: 0;
        overflow: hidden;
        /* opaque, so a revealing layer fully covers the one underneath */
        background: var(--background);
        pointer-events: none;
    }

    .row {
        display: flex;
        justify-content: center;
        width: 100%;
    }

    .most-visited {
        flex-direction: column;
        align-items: center;
        gap: var(--gap-3);
        margin-top: var(--gap-2);
    }

    /* a quiet label between two hairlines, so history doesn't read as your shortcuts */
    .divider {
        display: flex;
        align-items: center;
        gap: var(--gap-3);
        width: min(100%, 420px);
        color: var(--tertiary);
        font-size: 13px;
        white-space: nowrap;
    }

    .divider::before,
    .divider::after {
        content: "";
        flex: 1;
        height: 1px;
        background: linear-gradient(
            to var(--side, right),
            transparent,
            var(--helium-elevated-20)
        );
    }

    .divider::after {
        --side: left;
    }

    /* after the star entrance: the UI rises out of the light, one piece after another */
    .shell.waiting > :global(*) {
        opacity: 0;
    }

    .shell.entrance:not(.waiting) > :global(*) {
        animation: rise 0.45s cubic-bezier(0.16, 1, 0.3, 1) both;
    }

    .shell.entrance:not(.waiting) > :global(:nth-child(2)) {
        animation-delay: 0.04s;
    }

    .shell.entrance:not(.waiting) > :global(:nth-child(3)) {
        animation-delay: 0.08s;
    }

    .shell.entrance:not(.waiting) > :global(:nth-child(4)) {
        animation-delay: 0.12s;
    }

    @keyframes rise {
        from {
            opacity: 0;
            translate: 0 18px;
            scale: 0.96;
            filter: blur(10px);
        }
    }

    .logo {
        display: grid;
        place-items: center;
        height: 56px;
    }

    .logo-variant {
        grid-area: 1 / 1;
        display: grid;
        place-items: center;
    }

    .shell {
        position: relative;
        z-index: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 28px;
        min-height: 100vh;
        /* Logo + search sit at a fixed spot while what's under them fits; with more rows
           (shortcuts, most visited) the whole block rises to stay centered. 160px is the
           logo + search + gap. */
        padding: max(48px, min(calc(50vh - 90px), calc(50vh - (160px + var(--below, 0px)) / 2)))
            16px 96px;
    }

    .shell.settled {
        transition: padding-top 0.45s cubic-bezier(0.3, 1, 0.5, 1);
    }

    .below {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 28px;
        width: 100%;
    }

    .below:empty {
        display: none;
    }

    .datetime {
        position: fixed;
        top: 16px;
        left: 0;
        right: 0;
        z-index: 2;
        display: flex;
        justify-content: center;
        gap: 8px;
        font-size: 14px;
        color: var(--secondary);
        font-variant-numeric: tabular-nums;
        pointer-events: none;
    }

    .date::first-letter {
        text-transform: uppercase;
    }

    .datetime .group,
    .datetime .time,
    .wi {
        display: inline-flex;
        align-items: center;
        gap: 8px;
    }

    .weather {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        pointer-events: auto;
        cursor: default;
        border-radius: 6px;
    }

    .weather:focus-visible {
        outline: 2px solid var(--primary);
        outline-offset: 2px;
    }

    .datetime :global(.tooltip-anchor) {
        pointer-events: auto;
    }

    .weather-details {
        display: flex;
        flex-direction: column;
        gap: 8px;
        min-width: 190px;
        white-space: normal;
        font-variant-numeric: tabular-nums;
    }

    .wd-head {
        display: flex;
        align-items: center;
        gap: 10px;
    }

    .wd-head :global(svg) {
        width: 30px;
        height: 30px;
        color: var(--helium-elevated);
    }

    .wd-temp {
        font-size: 22px;
        font-weight: 600;
        line-height: 1;
    }

    .wd-label {
        margin-top: 2px;
        color: var(--secondary);
        font-size: 13px;
    }

    .wd-place {
        color: var(--tertiary);
        font-size: 13px;
    }

    .weather-details dl {
        display: grid;
        grid-template-columns: auto auto;
        gap: 4px 16px;
        margin: 0;
        padding-top: 8px;
        border-top: 1px solid var(--helium-elevated-10);
        font-size: 13px;
    }

    .weather-details dt {
        color: var(--secondary);
    }

    .weather-details dd {
        margin: 0;
        text-align: right;
    }

    .dot {
        color: var(--tertiary);
    }

    .search {
        position: relative;
        /* above the shortcut rows: the entrance animation makes every block its own
           stacking context, so the bang list's z-index alone can't escape the form */
        z-index: 10;
        width: min(100%, 600px);
    }

    /* bang autocomplete, same surface as the settings panel */
    .bang-list {
        position: absolute;
        top: calc(100% + 8px);
        left: 0;
        right: 0;
        z-index: 5;
        margin: 0;
        padding: 6px;
        list-style: none;
        border-radius: 16px;
        background: var(--background);
        outline: 1.5px solid var(--helium-elevated-10);
        outline-offset: -1.5px;
        box-shadow: 4px 4px 24px 0 var(--tooltip-shadow);
        transform-origin: top center;
    }

    .bang-item {
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;
        min-height: 0;
        padding: 8px 10px !important;
        border: none;
        border-radius: 10px;
        background: none !important;
        color: var(--secondary);
        font: inherit;
        font-size: 14px;
        text-align: left;
        cursor: pointer;
        transition: background-color 0.15s, color 0.15s;
    }

    .bang-item.active {
        background: var(--helium-elevated-10) !important;
        color: var(--primary);
    }

    .bang-item:active {
        transform: none;
    }

    .bang-icon {
        display: grid;
        place-items: center;
        flex-shrink: 0;
        width: 18px;
        height: 18px;
        color: var(--tertiary);
    }

    .bang-icon img {
        width: 18px;
        height: 18px;
        border-radius: 4px;
    }

    .bang-trigger {
        min-width: 64px;
        color: var(--helium-elevated);
        font-variant-numeric: tabular-nums;
    }

    .bang-service {
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
    }

    .search-icon {
        position: relative;
        display: grid;
        place-items: center;
        width: 18px;
        height: 18px;
    }

    .service-icon {
        width: 18px;
        height: 18px;
        border-radius: 25%;
        object-fit: contain;
        animation: fade-in 160ms ease;
    }

    .service-name {
        max-width: 30vw;
        overflow: hidden;
        margin-left: 8px;
        padding-right: 10px;
        border-right: 1px solid color-mix(in srgb, var(--secondary) 40%, transparent);
        color: var(--helium-elevated);
        font-size: 16px;
        line-height: 20px;
        white-space: nowrap;
        text-overflow: ellipsis;
    }

    .search :global(.keyword .input-accessory) {
        color: var(--helium-elevated);
    }

    .search :global(input[type="search"]::-webkit-search-decoration),
    .search :global(input[type="search"]::-webkit-search-cancel-button) {
        -webkit-appearance: none;
    }

    @keyframes fade-in {
        from {
            opacity: 0;
        }
    }

    .corner {
        position: fixed;
        right: 20px;
        bottom: 20px;
        z-index: 3;
        display: flex;
        gap: var(--gap-1);
        opacity: 0.25;
        transition: opacity 0.3s;
    }

    .corner:hover,
    .corner:focus-within,
    .corner.open {
        opacity: 1;
    }

    .corner-icon {
        display: grid;
        place-items: center;
    }

    .corner :global(svg) {
        width: 18px;
        height: 18px;
    }
</style>
