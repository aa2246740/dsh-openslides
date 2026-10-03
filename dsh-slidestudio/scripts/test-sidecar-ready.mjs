import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { waitForEditor } from '../lib/types/sidecar-ready.js';

test('first navigation waits for a delayed editor startup', async () => {
  const server = http.createServer((req,res) => { res.writeHead(200); res.end('{}'); });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  const ready = waitForEditor(`http://127.0.0.1:${port}`, 3000);
  const timer = setTimeout(() => server.listen(port,'127.0.0.1'), 150);
  try { assert.equal(await ready, true); }
  finally { clearTimeout(timer); if(server.listening) await new Promise(resolve => server.close(resolve)); }
});

test('an unhealthy editor gives a bounded startup failure', async () => {
  const server = http.createServer((req,res) => { res.writeHead(503); res.end(); });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  try { assert.equal(await waitForEditor(`http://127.0.0.1:${server.address().port}`, 150), false); }
  finally { await new Promise(resolve => server.close(resolve)); }
});
