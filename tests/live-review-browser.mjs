import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {pythonCommand} from '../scripts/python.mjs';

let pw;
try { pw = createRequire(import.meta.url)('playwright'); }
catch { pw = createRequire(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES + '/playwright/package.json')('playwright'); }
const server = spawn(pythonCommand(), ['-m', 'http.server', '8767', '--bind', '127.0.0.1'], {stdio: ['ignore', 'ignore', 'pipe']});
process.on('exit', () => server.kill());
for (let attempts = 0; ; attempts++) {
  try { if ((await fetch('http://127.0.0.1:8767/web/live-review.html')).ok) break; } catch {}
  if (attempts > 50) throw Error('Local test server did not start.');
  await new Promise(resolve => setTimeout(resolve, 100));
}
const browser = await pw.chromium.launch({executablePath: process.env.CHROMIUM_PATH,
  args: ['--no-sandbox', '--disable-gpu', '--no-zygote', '--single-process']});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.responses = [];
    window.LiveReviewMessages = {postMessage(raw) { window.responses.push(JSON.parse(raw)); }};
    window.deliver = payload => window.LiveReviewMessages.onmessage({data: JSON.stringify(payload)});
  });
  await page.goto('http://127.0.0.1:8767/web/live-review.html');
  await page.waitForFunction(() => window.responses.some(value => value.type === 'ready'));
  await page.evaluate(() => window.deliver({kind: 'start', id: 'browser-live-1234', direction: 'incoming', userTriggered: false}));
  assert.equal(await page.evaluate(() => window.responses.at(-1).type), 'error');
  await page.evaluate(() => window.deliver({kind: 'start', id: 'browser-live-1234', direction: 'incoming', userTriggered: true}));
  assert.equal(await page.evaluate(() => window.responses.at(-1).type), 'started');
  await page.evaluate(() => window.deliver({kind: 'liveCallChunk', reviewId: 'browser-live-1234', sequence: 1,
    text: 'I am from your bank. Share your OTP 345678 now or your account will be blocked.', timestamp: Date.now()}));
  const result = await page.evaluate(() => window.responses.at(-1));
  assert.equal(result.type, 'liveRisk');
  assert.ok(['warning', 'high'].includes(result.severity));
  assert.equal(result.snapshot.timeline[0].evidence_type, 'live_call_audio');
  assert.ok(!JSON.stringify(result).includes('345678'));
  await page.evaluate(() => window.deliver({kind: 'liveCallChunk', reviewId: 'browser-live-1234', sequence: 1,
    text: 'duplicate secret', timestamp: Date.now()}));
  assert.equal(await page.evaluate(() => window.responses.at(-1).type), 'error');
  assert.deepEqual(errors, []);
  console.log('Packaged live-review page: consent, engine round trip, redaction and replay checks passed.');
} finally { await browser.close();server.kill(); }
