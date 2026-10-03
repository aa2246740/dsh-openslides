import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { createHash } from 'node:crypto';

const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'slidestudio-persistent-data-'));
const project = path.join(dataRoot, 'output/dsh-slices/persistent-deck');
fs.mkdirSync(path.join(project, 'pages'), { recursive: true });
fs.writeFileSync(path.join(project, 'deck.pptd'), JSON.stringify({
  version: 'v2', title: 'Persistent deck', size: [960, 540], pages: ['pages/1.yaml'],
}));
fs.writeFileSync(path.join(project, 'pages/1.yaml'), JSON.stringify({
  pageType: 'content', elements: [{ elementId: 'title', elementType: 'text', bounds: [40,40,880,70], content: { text: 'Preserved outside the package', fontSize: 32 } }],
}));
process.env.SLIDESTUDIO_DATA_DIR = dataRoot;
const { server, resolveProjectPath } = await import('./server.mjs');
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
after(async () => {
  await new Promise(resolve => server.close(resolve));
  fs.rmSync(dataRoot, { recursive: true, force: true });
});

test('external data directory supports project discovery, relative open, PPTX export and uploads', async () => {
  const health = await (await fetch(`${base}/api/health`)).json();
  assert.equal(health.dataRoot, dataRoot);
  const list = await (await fetch(`${base}/api/projects`)).json();
  assert.equal(list.projects.find(p => p.id === 'persistent-deck')?.path, project);
  assert.equal(fs.realpathSync(resolveProjectPath('output/dsh-slices/persistent-deck')), fs.realpathSync(project));
  const exported = await fetch(`${base}/api/export`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project: 'output/dsh-slices/persistent-deck', format: 'pptx' }),
  });
  assert.equal(exported.status, 200, await exported.clone().text());
  assert.equal(Buffer.from(await exported.arrayBuffer()).subarray(0,2).toString(), 'PK');
  const upload = await fetch(`${base}/api/attachments`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'source.md', data: `data:text/markdown;base64,${Buffer.from('Persistent source material').toString('base64')}` }),
  });
  assert.equal(upload.status, 200);
  const attachment = await upload.json();
  const stored = await (await fetch(`${base}/api/attachments/${attachment.id}`)).json();
  assert.equal(stored.text, 'Persistent source material');
  assert.equal(stored.storeId, createHash('sha256').update(path.join(dataRoot, 'output/attachments')).digest('hex'));
  assert.ok(fs.existsSync(path.join(dataRoot, 'output/attachments')));
  const deleted = await fetch(`${base}/api/projects`, {
    method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: project }),
  });
  assert.equal(deleted.status, 200);
  assert.equal(fs.existsSync(project), false);
});
