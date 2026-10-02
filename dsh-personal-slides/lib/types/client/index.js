import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export const name = 'dsh-personal-slides-client';
// Only the slots service is required up front: without dsh-personal the feature
// still mounts as its own top-level panel; when Personal is present the same
// page is re-registered inside its sidebar instead (see ctx.inject below).
export const inject = ['slots'];
/** Replay a registered shortcut command through the real keydown dispatch path. */
function dispatchShortcut(ctx, commandId) {
    const shortcuts = ctx.get('shortcuts');
    const entry = shortcuts?.catalog.getSnapshot().find((row) => String(row.id) === commandId);
    const binding = entry?.binding && entry.binding.secondCode === undefined ? entry.binding : null;
    const macos = /mac|iphone|ipad/iu.test(navigator.platform);
    const code = binding?.code ?? 'Comma';
    const modifiers = new Set(binding?.modifiers ?? (macos ? ['alt', 'meta'] : ['alt', 'control']));
    document.body.dispatchEvent(new KeyboardEvent('keydown', {
        code,
        key: ',',
        bubbles: true,
        cancelable: true,
        ctrlKey: modifiers.has('control'),
        altKey: modifiers.has('alt'),
        shiftKey: modifiers.has('shift'),
        metaKey: modifiers.has('meta'),
    }));
}
/** The hub inside the iframe follows DSH's own Language setting. */
let currentLang = 'zh';
function activeLang(ctx) {
    try {
        const locale = ctx.get('locale');
        return locale?.getLocale?.().active === 'en' ? 'en' : 'zh';
    }
    catch {
        return 'zh';
    }
}
function slideTitle() {
    return currentLang === 'en' ? 'Slides' : '演示文稿';
}
function slideDescription() {
    return currentLang === 'en'
        ? 'Turn one sentence into a polished slide deck'
        : '一句话把想法变成漂亮的演示文稿';
}
/** Push the active locale into every app iframe the plugin mounted. */
function broadcastLang() {
    for (const frame of document.querySelectorAll('iframe')) {
        try {
            if (!new URL(frame.src, location.href).pathname.startsWith('/app/'))
                continue;
            frame.contentWindow?.postMessage({ type: 'oss:locale', lang: currentLang }, location.origin);
        }
        catch {
            // Cross-origin or detached frame; it resolves its own language.
        }
    }
}
function settingsModalOpen() {
    return document.querySelector('[data-shortcut-modal="settings"]') !== null;
}
/** Any other dialog holding the modal layer — e.g. the settings.onboarding
 *  key prompt that re-mounts on a fresh home — blocks `settings.open`. */
function otherDialogOpen() {
    return (document.querySelector('[role="dialog"][aria-modal="true"]:not([data-shortcut-modal="settings"])') !== null);
}
/** The slot renderer marks each mount site with `data-slot` — the anchor is
 *  absent on pages (like Personal's) that never render `sidebar.settings`. */
function settingsUiMounted() {
    return document.querySelector('[data-slot="sidebar.settings"]') !== null;
}
/**
 * Open the DSH settings panel. The settings modal renders inside the
 * `sidebar.settings` occupant, which Personal pages don't mount — dispatching
 * there would only leak a latent open flag into the shell store. When the
 * mount is absent, switch to the home panel (standard sidebar) first, then
 * drive the dialog open; when it closes, return to the originating panel —
 * unless the user navigated elsewhere in the meantime.
 */
function openDshSettings(ctx, source, origin) {
    if (settingsUiMounted()) {
        // Ack immediately: we take over from here (any dialog that owns the layer,
        // onboarding included, is already a settings-surface flow).
        if (source && 'postMessage' in source) {
            source.postMessage({ type: 'oss:dsh-settings-opened' }, origin);
        }
        driveSettingsOpen(ctx, null);
        return;
    }
    const layout = ctx.get('layout');
    if (!layout)
        return;
    const previousPanel = layout.panelInfo?.getSnapshot().activePanelId ?? null;
    layout.selectPanel(null);
    // Fresh signal: aborted by any later selectPanel, so a user-driven
    // navigation cancels the pending restore below.
    const navigation = layout.beginNavigation?.() ?? null;
    driveSettingsOpen(ctx, () => {
        if (navigation?.aborted)
            return;
        try {
            layout.selectPanel(previousPanel);
        }
        catch {
            // Panel unregistered meanwhile (e.g. Personal unloaded); stay put.
        }
    });
}
/**
 * Drive the settings dialog through its real open/close lifecycle:
 * wait out whichever dialog owns the layer (the onboarding key prompt is
 * dismiss-ignored — it cannot and need not be closed by us), dispatch
 * `settings.open` once the layer is free, and finish when the dialog the
 * user finally sees closes. `finish` (restore) is only meaningful after a
 * navigation; in-place callers pass null.
 */
function driveSettingsOpen(ctx, finish) {
    let opened = false;
    let needDispatch = true;
    let waited = 0;
    const done = () => {
        window.clearInterval(timer);
        finish?.();
    };
    const timer = window.setInterval(() => {
        waited += 250;
        if (settingsModalOpen()) {
            opened = true;
            return;
        }
        if (opened) {
            done();
            return;
        }
        // Another dialog owns the layer — let the user finish that flow first,
        // then re-arm the dispatch (a blocked dispatch must be retried).
        if (otherDialogOpen()) {
            needDispatch = true;
            return;
        }
        if (needDispatch && waited >= 400) {
            needDispatch = false;
            dispatchShortcut(ctx, 'settings.open');
            return;
        }
        // Dispatch produced nothing and the layer is empty — don't strand the user.
        if (!needDispatch && waited >= 10_000)
            done();
    }, 250);
    window.setTimeout(() => window.clearInterval(timer), 600_000);
}
function SlidesPage() {
    return (_jsx("iframe", { title: "DSH SlideStudio", src: `/app/hub.html?lang=${currentLang}`, style: { display: 'block', width: '100%', height: '100%', minHeight: '80vh', border: 0 } }));
}
function SlidesEntryIcon({ size = 16 }) {
    return (_jsxs("svg", { width: size, height: size, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: "1.2", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: [_jsx("rect", { x: "1.5", y: "2.5", width: "13", height: "9", rx: "1.5" }), _jsx("path", { d: "M8 11.5v2" }), _jsx("path", { d: "M5.5 14h5" })] }));
}
const PANEL = 'slides';
/** Standalone mode: 演示文稿 sits in the official sidebar panel list itself. */
function registerStandalone(ctx) {
    const stops = [
        ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL }, SlidesPage)),
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: PANEL, order: -9, label: () => slideTitle() }, SlidesEntryIcon)),
    ];
    return () => {
        for (const stop of stops)
            stop();
    };
}
export function apply(ctx) {
    currentLang = activeLang(ctx);
    // Plugin-scope listener: the hub asks to open DSH settings, which may unmount
    // the Personal page (and this page's own effect) mid-flow.
    ctx.effect(() => {
        const onMessage = (event) => {
            if (event.origin !== location.origin || event.data?.type !== 'oss:open-dsh-settings')
                return;
            openDshSettings(ctx, event.source, event.origin);
        };
        window.addEventListener('message', onMessage);
        return () => window.removeEventListener('message', onMessage);
    });
    // Follow the DSH Language setting: retitle the Personal entry and notify
    // live iframes so hub/editor copy switches without a reload.
    ctx.effect(() => {
        const locale = ctx.get('locale');
        if (!locale)
            return () => { };
        return locale.subscribe(() => {
            const next = activeLang(ctx);
            if (next === currentLang)
                return;
            currentLang = next;
            broadcastLang();
        });
    });
    let standalone = registerStandalone(ctx);
    ctx.inject(['personal'], (inner) => {
        standalone?.();
        standalone = undefined;
        const registerFeature = () => inner.personal.register({
            id: 'slides',
            title: slideTitle(),
            description: slideDescription(),
            order: 1,
            component: SlidesPage,
        });
        let remove = registerFeature();
        const offLocale = ctx.get('locale')?.subscribe(() => {
            // PersonalFeature.title is a static snapshot: re-register to retitle.
            remove();
            remove = registerFeature();
        });
        return () => {
            offLocale?.();
            remove();
            try {
                standalone = registerStandalone(ctx);
            }
            catch {
                // Own plugin is unloading too; the fiber discards pending effects.
            }
        };
    });
}
//# sourceMappingURL=index.js.map