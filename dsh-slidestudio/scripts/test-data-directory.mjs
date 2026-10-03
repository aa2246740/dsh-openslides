import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { resolveDataDirectory } from '../lib/types/data-directory.js';

for (const existing of [false, true]) test(`Project directory survives package replacement (existing=${existing})`, () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'slidestudio-data-'));
  try {
    const first = path.join(scratch, 'source');
    const second = path.join(scratch, 'new-package-version');
    const home = path.join(scratch, 'home');
    if (existing) fs.mkdirSync(path.join(first, 'output', 'dsh-slices'), { recursive: true });
    const root = resolveDataDirectory(first, home);
    assert.equal(root, existing ? first : path.join(home, 'data/dsh-slidestudio/workspace'));
    fs.writeFileSync(path.join(root, 'deck-proof'), 'original content');
    assert.equal(resolveDataDirectory(second, home), root);
    assert.equal(fs.readFileSync(path.join(root, 'deck-proof'), 'utf8'), 'original content');
    assert.throws(() => resolveDataDirectory(second, home, 'relative'), /absolute/);
    const custom = path.join(scratch, 'custom');
    assert.equal(resolveDataDirectory(second, home, custom), custom);
    fs.rmSync(custom, { recursive: true });
    assert.throws(() => resolveDataDirectory(second, home), /missing/);
  } finally { fs.rmSync(scratch, { recursive: true, force: true }); }
});
