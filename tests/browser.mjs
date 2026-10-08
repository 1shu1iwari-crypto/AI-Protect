// Exercise the current app through the same controls users see.
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {mkdir, writeFile, rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {pythonCommand} from '../scripts/python.mjs';
import {scenarios} from '../simulator/scenarios.mjs';

let pw;
try { pw = createRequire(import.meta.url)('playwright'); }
catch { pw = createRequire(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES + '/playwright/package.json')('playwright'); }
await mkdir('test-results', {recursive:true});
await rm('test-results/browser.sqlite', {force:true});
const server = spawn(pythonCommand(), ['backend/server.py','--port','8765','--db','test-results/browser.sqlite'], {
  stdio:['ignore','pipe','inherit'], env:{...process.env,POSTHOG_PROJECT_TOKEN:''}
});
process.on('exit', () => server.kill());
await new Promise((resolve,reject) => {
  server.stdout.once('data',resolve); server.once('error',reject);
  server.once('exit',code => reject(Error('QA server exited: ' + code)));
});
const browser = await pw.chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,
  args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--no-zygote','--single-process']});
try {
  const context = await browser.newContext({viewport:{width:1440,height:1100}});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror',error => errors.push(error.message));
  await page.goto('http://127.0.0.1:8765/app');
  await page.waitForSelector('#recent-list .empty-row');
  await page.screenshot({path:'test-results/protection-desktop.png',fullPage:true});
  await page.fill('#home-input','Receive your refund of 2500. Scan the QR to receive money.');
  await page.click('#home-form button[type=submit]');
  assert.equal(await page.locator('#event-count').textContent(),'0 events');
  assert.equal(await page.locator('#home-input').inputValue(),'');
  await page.click('#check-form button[type=submit]');
  assert.equal(await page.locator('#alert-card').isVisible(),false);

  async function submit(event) {
    await page.click('[data-channel="' + event.channel + '"]');
    if (event.payment) {
      await page.fill('#amount',String(event.payment.amount));
      await page.locator('#new-payee').setChecked(event.payment.newPayee);
    } else await page.fill('#content',event.text);
    await page.click('#check-form button[type=submit]');
  }
  for (const event of scenarios.find(s => s.id === 'refund-qr').events.slice(1)) await submit(event);
  assert.equal(await page.locator('#alert-card').isVisible(),true);
  await page.click('#cancel-payment');
  assert.match(await page.locator('#decision-result').textContent(),/cancelled/);
  await page.click('#continue-payment'); await page.click('#confirm-continue');
  assert.match(await page.locator('#decision-result').textContent(),/continued/);
  await page.screenshot({path:'test-results/refund-warning.png',fullPage:true});

  await page.click('.nav[data-view=privacy]');
  await page.click('#share-pattern');
  assert.match(await page.locator('#sharing-status').textContent(),/Choose/);
  await page.check('#sharing-consent'); await page.click('#share-pattern');
  await page.waitForFunction(() => document.querySelector('#sharing-status').textContent.includes('Shared'));
  await page.click('#delete-pattern');
  await page.waitForFunction(() => document.querySelector('#sharing-status').textContent.includes('deleted'));
  await page.check('#analytics-consent');
  await page.waitForFunction(() => !document.querySelector('#analytics-consent').checked);
  await page.click('.nav[data-view=protect]'); await page.click('#clear-session');
  for (const event of scenarios.find(s => s.id === 'restaurant').events) await submit(event);
  assert.equal(await page.locator('#alert-card').isVisible(),false);
  await submit({channel:'message',text:'Your bank will never ask you to share your OTP. Never share your PIN or password.'});
  assert.equal(await page.locator('#content').inputValue(),'');
  assert.equal(await page.locator('#alert-card').isVisible(),false);
  await submit({channel:'qr',text:'upi://pay?pa=test@demo&am=NaN'});
  assert.match(await page.locator('#form-error').textContent(),/Amount/);

  // A reload must resolve the full engine import graph without a network.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise(resolve =>
      navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));
  });
  await context.setOffline(true); await page.reload();
  await page.waitForSelector('#recent-list .empty-row'); await page.click('.nav[data-view=protect]');
  await submit({channel:'message',text:'Receive your refund'});
  assert.equal(await page.locator('#event-count').textContent(),'1 event');
  await context.setOffline(false); await page.click('#clear-session');
  await page.click('[data-channel=qr]');
  await page.setInputFiles('#qr-file','simulator/fixtures/refund-qr.png');
  await page.waitForFunction(() => document.querySelector('#content').value.startsWith('upi://pay'));
  assert.match(await page.locator('#content').inputValue(),/fixture@demo/);

  // Shared text stays in worker memory until an explicit user check.
  await page.evaluate(() => {
    const form = document.createElement('form');
    form.method='POST'; form.action='/share'; form.enctype='multipart/form-data';
    const input = document.createElement('input'); input.name='text'; input.value='Private shared fixture 9876543210';
    form.append(input); document.body.append(form); form.submit();
  });
  await page.waitForFunction(() => document.querySelector('#content')?.value === 'Private shared fixture 9876543210');
  assert.equal(await page.locator('#event-count').textContent(),'0 events');
  assert(!page.url().includes('Private')); assert(!page.url().includes('shared='));
  const leakedCache = await page.evaluate(async () => {
    for (const name of await caches.keys()) for (const request of await (await caches.open(name)).keys()) {
      const response = await (await caches.open(name)).match(request);
      if ((await response.text()).includes('Private shared fixture')) return true;
    }
    return false;
  });
  assert.equal(leakedCache,false);
  await page.click('#check-form button[type=submit]');
  assert.equal(await page.locator('#content').inputValue(),'');
  await page.click('[data-channel=qr]'); await page.click('#scan-camera');
  await page.click('#stop-camera'); assert.equal(await page.locator('#camera-dialog').isVisible(),false);
  for (const width of [320,390,768,1440]) {
    await page.setViewportSize({width,height:844});
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),String(width));
  }
  await page.setViewportSize({width:390,height:844}); await page.click('#clear-session');
  await page.screenshot({path:'test-results/protection-mobile.png',fullPage:true});
  assert.deepEqual(errors,[]);
  await writeFile('test-results/browser-summary.json',JSON.stringify({passed:true,checks:[
    'home submit requires explicit review','refund warning and simulation choices','pattern consent and deletion',
    'analytics off','benign financial advice','invalid UPI','offline engine reload','QR image decode',
    'private POST share target and no cache leakage','camera close','320–1440px layout'
  ],errors},null,2));
  console.log('Browser QA passed: explicit review, consent, financial warnings, offline reload and private sharing.');
} finally { await browser.close(); server.kill(); }
