import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {pythonCommand} from '../scripts/python.mjs';

let pw;
try { pw = createRequire(import.meta.url)('playwright'); }
catch { pw = createRequire(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES + '/playwright/package.json')('playwright'); }
const server = spawn(pythonCommand(), ['-m', 'http.server', '8768', '--bind', '127.0.0.1'], {stdio: ['ignore', 'ignore', 'pipe']});
process.on('exit', () => server.kill());
for (let attempts = 0; ; attempts++) {
  try { if ((await fetch('http://127.0.0.1:8768/web/live-review.html')).ok) break; } catch {}
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
  await page.goto('http://127.0.0.1:8768/web/live-review.html');
  await page.waitForFunction(() => window.responses.some(value => value.type === 'ready'));
  await page.evaluate(() => window.deliver({kind: 'start', id: 'browser-live-1234', direction: 'incoming', userTriggered: false}));
  assert.equal(await page.evaluate(() => window.responses.at(-1).type), 'error');
  await page.evaluate(() => window.deliver({kind: 'start', id: 'browser-live-1234', direction: 'incoming', userTriggered: true}));
  assert.equal(await page.evaluate(() => window.responses.at(-1).type), 'started');
  await page.evaluate(() => window.deliver({kind:'recordedCallReview',reviewId:'browser-live-1234',sequence:1,paymentStatus:'unknown',
    transcript:{schema_version:1,source:'shared_recording',language:'hi-en',asr_model:'browser-fixture',quality:'adequate',duration_ms:6000,
      segments:[{start_ms:0,end_ms:6000,speaker:'unknown',quality:'adequate',language:'hi-en',text:'SBI verification officer. Transfer money to temporary settlement account. Kisi ko mat batana.'}]}}));
  const result = await page.evaluate(() => window.responses.at(-1));
  assert.equal(result.type,'recordedRisk'); assert.equal(result.sequence,1);
  assert.equal(result.verdict.financial_risk,'high'); assert.equal(result.verdict.voice_authenticity,'inconclusive');
  assert.equal(result.snapshot.timeline[0].audio_segment.end_ms,6000);
  assert.ok(!JSON.stringify(result).includes('SBI verification officer'));
  await page.evaluate(() => window.deliver({kind:'recordedActionPlan',reviewId:'browser-live-1234',sequence:2,paymentStatus:'sent'}));
  const paid = await page.evaluate(() => window.responses.at(-1));
  assert.equal(paid.type,'audioPlan'); assert.ok(paid.action_plan.routes.some(x=>x.url==='tel:1930'));
  await page.evaluate(() => window.deliver({kind:'recordedCallReview',reviewId:'wrong-review',sequence:3,transcript:{}}));
  assert.equal(await page.evaluate(() => window.responses.at(-1).type),'error');
  assert.deepEqual(errors, []);
  console.log('Packaged recording-review page: consent, multilingual financial verdict, offsets, redaction and paid response passed.');
} finally { await browser.close();server.kill(); }
