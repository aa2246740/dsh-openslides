/** Compiled bridge contract: native DOM keyboard events cannot open Settings. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import test from 'node:test';

const source = readFileSync(fileURLToPath(new URL('../lib/client.js', import.meta.url)), 'utf8');
function host({ withPersonal = true, control = 'menu', bound = true, mounted = true, onboarding = false } = {}) {
  const state = { personal: withPersonal, settings: false, menu: false, resumes: 0, mounted, onboarding, clicks: 0 };
  const intervals = new Map(), timeouts = new Map(), effects = [], messages = [];
  let message, client, id = 0;
  const origin = 'dsh-app://app';
  const open = () => { assert.equal(state.personal, false); state.settings = true; state.clicks++; };
  const item = { disabled: false, click: open,
    getAttribute: () => bound ? 'Control+Shift+Comma' : null,
    cloneNode: () => ({ textContent: '设置', querySelectorAll: () => [] }),
  };
  const launcher = { disabled: false, click() { state.menu = true; },
    getAttribute: () => String(state.menu),
  };
  const personal = withPersonal ? { suspend() {
    state.personal = false;
    return () => { state.resumes++; state.personal = true; };
  } } : undefined;
  const sandbox = {
    location: { origin }, URL,
    document: {
      querySelector(selector) {
        if (selector === '[data-shortcut-modal="settings"]') return state.settings ? {} : null;
        if (selector.includes('[role="dialog"]')) return state.onboarding ? {} : null;
        if (!state.mounted) return null;
        if (selector === '[data-slot="sidebar.settings"]') return {};
        if (selector.includes('settings.trigger')) return control === 'trigger' ? { closest: () => ({ disabled: false, click: open }) } : null;
        if (selector.includes('settings.launcher')) return control === 'menu' ? launcher : null;
        return null;
      },
      querySelectorAll: () => state.menu ? [item] : [],
      body: { dispatchEvent() { assert.fail('Native Desktop ignores synthetic shortcut events'); } },
    },
    setInterval(fn) { intervals.set(++id, fn); return id; }, clearInterval(key) { intervals.delete(key); },
    setTimeout(fn) { timeouts.set(++id, fn); return id; }, clearTimeout(key) { timeouts.delete(key); },
    addEventListener(type, fn) { if (type === 'message') message = fn; }, removeEventListener() {},
    __ModuleLoader__: { load({ id, factory }) { assert.equal(id, 'dsh-slidestudio'); client = factory(() => ({})); } },
  };
  sandbox.window = sandbox;
  vm.runInNewContext(source, sandbox);
  client.apply({
    get(name) {
      if (name === 'personal') return personal;
      if (name === 'shortcuts') return { catalog: { getSnapshot: () => [{ id: 'settings.open', aria: bound ? 'Control+Shift+Comma' : undefined }] } };
      if (name === 'layout') return { selectPanel() { state.mounted = true; }, beginNavigation: () => ({ aborted: false }) };
    },
    effect(fn) { const stop = fn(); if (stop) effects.push(stop); }, inject() {},
    slots: { inject(_name, fn) { fn(); return () => {}; }, register() { return () => {}; } },
  });
  message({ origin, data: { type: 'oss:open-dsh-settings' }, source: { postMessage(data) { messages.push(data.type); } } });
  return { state, messages, intervals, timeouts,
    tick(n = 1) { for (let i = 0; i < n; i++) [...intervals.values()].forEach(fn => fn()); },
    dispose() { effects.reverse().forEach(stop => stop()); },
  };
}
for (const withPersonal of [true, false]) for (const control of ['menu', 'trigger']) for (const bound of [true, false]) {
  test(`Settings ${control}, Personal ${withPersonal}, shortcut bound ${bound}`, () => {
    const h = host({ withPersonal, control, bound });
    assert.deepEqual(h.messages, ['oss:dsh-settings-accepted'], 'Acceptance must not claim the dialog already opened');
    h.tick(4);
    assert.equal(h.state.settings, true);
    assert.equal(h.state.clicks, 1);
    assert.deepEqual(h.messages, ['oss:dsh-settings-accepted', 'oss:dsh-settings-opened']);
    h.state.settings = false;
    h.tick();
    assert.equal(h.state.personal, withPersonal);
    assert.equal(h.intervals.size, 0);
    assert.equal(h.timeouts.size, 0);
    h.dispose();
    assert.equal(h.state.resumes, withPersonal ? 1 : 0);
  });
}
test('Missing settings control restores Personal and reports failure', () => {
  const h = host({ control: 'missing' });
  h.tick(41);
  assert.equal(h.state.personal, true);
  assert.equal(h.state.settings, false);
  assert.deepEqual(h.messages, ['oss:dsh-settings-accepted', 'oss:dsh-settings-failed']);
  assert.equal(h.intervals.size, 0);
  h.dispose();
});
test('Settings waits for onboarding to finish before opening', () => {
  const h = host({ onboarding: true });
  h.tick(48);
  assert.equal(h.state.clicks, 0);
  assert.equal(h.messages.includes('oss:dsh-settings-opened'), false);
  h.state.onboarding = false;
  h.tick(4);
  assert.equal(h.state.settings, true);
  h.state.settings = false; h.tick(); h.dispose();
});
test('A page without sidebar.settings navigates before opening and restores', () => {
  const h = host({ mounted: false });
  h.tick(4);
  assert.equal(h.state.settings, true);
  h.state.settings = false; h.tick();
  assert.equal(h.state.resumes, 1);
  h.dispose();
});
