/** Exercise the compiled client against the public Host/Personal services. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import test from 'node:test';

const source = readFileSync(fileURLToPath(new URL('../lib/client.js', import.meta.url)), 'utf8');

for (const withPersonal of [true, false]) {
  test(`Settings opens and returns with Personal ${withPersonal ? 'present' : 'absent'}`, () => {
    let personalOpen = withPersonal, settingsOpen = false, resumeCount = 0;
    let message, client, id = 0;
    const intervals = new Map(), timeouts = new Map(), effects = [];
    const origin = 'http://localhost';
    const personal = withPersonal ? { suspend() {
      personalOpen = false;
      return () => { resumeCount++; personalOpen = true; };
    } } : undefined;
    const sandbox = {
      navigator: { platform: 'MacIntel' }, location: { origin }, URL,
      KeyboardEvent: class { constructor(type, init) { Object.assign(this, {type}, init); } },
      document: {
        querySelector(selector) {
          if (selector === '[data-slot="sidebar.settings"]') return {};
          if (selector === '[data-shortcut-modal="settings"]') return settingsOpen ? {} : null;
          return personalOpen ? {} : null;
        },
        body: { dispatchEvent() { assert.equal(personalOpen, false); settingsOpen = true; } },
      },
      setInterval(fn) { intervals.set(++id, fn); return id; },
      clearInterval(key) { intervals.delete(key); },
      setTimeout(fn) { timeouts.set(++id, fn); return id; },
      clearTimeout(key) { timeouts.delete(key); },
      addEventListener(type, fn) { if (type === 'message') message = fn; },
      removeEventListener() {},
      __ModuleLoader__: { load({ id, factory }) {
        assert.equal(id, 'dsh-slidestudio');
        client = factory(() => ({}));
      } },
    };
    sandbox.window = sandbox;
    vm.runInNewContext(source, sandbox);
    client.apply({
      get(name) { return name === 'personal' ? personal : undefined; },
      effect(fn) { const stop = fn(); if (stop) effects.push(stop); },
      inject() {},
      slots: { inject(_name, fn) { fn(); return () => {}; }, register() { return () => {}; } },
    });
    let acknowledged = false;
    message({ origin, data: { type: 'oss:open-dsh-settings' }, source: {
      postMessage(data) { acknowledged = data.type === 'oss:dsh-settings-opened'; },
    } });
    const tick = () => [...intervals.values()].forEach(fn => fn());
    tick(); tick(); tick();
    assert.equal(acknowledged, true);
    assert.equal(settingsOpen, true);
    settingsOpen = false;
    tick();
    assert.equal(personalOpen, withPersonal);
    assert.equal(intervals.size, 0);
    assert.equal(timeouts.size, 0);
    effects.reverse().forEach(stop => stop());
    assert.equal(resumeCount, withPersonal ? 1 : 0, 'Unload must not navigate a second time');
  });
}
