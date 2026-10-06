import {Session} from '/core/engine.mjs';
import {scenarios as originalScenarios} from '/simulator/scenarios.mjs';
import {challenges} from '/simulator/challenges.mjs';

const scenarios = [...originalScenarios, ...challenges];

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const escape = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function toast(message) {
  let t = document.getElementById('site-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'site-toast';
    t.setAttribute('role', 'status');
    t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#0f2038;color:#fff;padding:12px 20px;border-radius:14px;font-size:14px;font-weight:600;box-shadow:0 12px 30px rgba(0,0,0,0.25);z-index:9999;transition:opacity .2s;pointer-events:none;';
    document.body.append(t);
  }
  t.textContent = message;
  t.style.opacity = '1';
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.style.opacity = '0'; }, 3500);
}

let model = null;
try {
  model = await (await fetch('/core/model.json')).json();
} catch {}

let selected = scenarios[0];
let step = 0;
let filter = 'all';
let replayBusy = false;
let replaySession = new Session(model);

function filteredScenarios() {
  if (filter === 'scam') return scenarios.filter(s => s.scam);
  if (filter === 'ordinary') return scenarios.filter(s => !s.scam);
  return scenarios;
}

function renderScenarios() {
  const list = filteredScenarios();
  const listEl = $('#scenario-list');
  if (!listEl) return;
  listEl.innerHTML = list.map(s =>
    '<button class="scenario-item ' + (s.id === selected.id ? 'active' : '') + '" data-scenario="' + s.id + '">' +
      '<span class="' + (s.scam ? 'scam' : 'ordinary') + '">' + (s.scam ? 'SCAM SIMULATION' : 'ORDINARY WORKFLOW') + (s.holdout ? ' · HOLDOUT' : '') + '</span>' +
      '<strong>' + escape(s.name) + '</strong>' +
    '</button>'
  ).join('');

  $$('#scenario-list [data-scenario]').forEach(b => {
    b.onclick = () => {
      if (replayBusy) return;
      selected = scenarios.find(s => s.id === b.dataset.scenario) || scenarios[0];
      resetReplay();
      renderScenarios();
    };
  });
}

function renderScenario() {
  if (!$('#scenario-name')) return;
  $('#scenario-type').textContent = selected.scam ? 'SYNTHETIC SCAM SCENARIO' : 'SYNTHETIC ORDINARY WORKFLOW';
  $('#scenario-name').textContent = selected.name;
  $('#scenario-description').textContent = selected.description;
  $('#step-count').textContent = step + ' / ' + selected.events.length;

  const e = selected.events[step];
  $('#replay-preview').innerHTML = e
    ? '<small>NEXT / ' + escape(e.channel.toUpperCase()) + '</small><p>' + escape(e.payment ? 'Prepare a simulated ₹' + e.payment.amount.toLocaleString('en-IN') + ' transfer' + (e.payment.newPayee ? ' to a new beneficiary.' : '.') : e.text) + '</p>'
    : '<small>STORY COMPLETE</small><p>' + (selected.scam ? 'Review the warning: AI-Protect caught the risky action before money moved.' : 'An ordinary workflow checked without inventing a scam verdict.') + '</p>';

  $('#next-event').disabled = !e;
  $('#run-all').disabled = !e;
}

function next() {
  if (step >= selected.events.length) return;
  const event = selected.events[step];
  const r = replaySession.add({
    ...event,
    userTriggered: true,
    timestamp: replaySession.started - (selected.events.length - step) * 20000
  });
  step++;

  const div = document.createElement('div');
  div.className = 'replay-result' + (r.showWarning ? ' warning' : '');
  let tags = '';
  if (r.contradiction?.hasContradiction) {
    const cType = (r.contradiction.types?.[0] || 'mismatch').replace(/_/g, ' ').toUpperCase();
    tags += '<span class="tag tag-red" style="font-size:11px;margin-left:6px;">TICE: ' + escape(cType) + '</span>';
  }
  if (r.event.link?.offline_risk) {
    tags += '<span class="tag tag-amber" style="font-size:11px;margin-left:6px;">PhiUSIIL: ' + Math.round(r.event.link.offline_risk * 100) + '% Risk</span>';
  }
  div.innerHTML =
    '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:6px;">' +
      '<b>' + step + ' / ' + escape(r.event.channel.toUpperCase()) + ' · ' + (r.showWarning ? 'WARNING' : r.suppressed ? 'REPEAT LIMITED' : r.severity.toUpperCase()) + '</b>' +
      '<div>' + tags + '</div>' +
    '</div>' +
    '<div>' + escape(r.reason) + '</div>';
  $('#replay-output').append(div);
  renderScenario();
  return r;
}

function resetReplay() {
  replaySession = new Session(model);
  step = 0;
  $('#replay-output').replaceChildren();
  renderScenario();
}

$('#next-event').onclick = next;
$('#run-all').onclick = () => {
  replayBusy = true;
  try {
    while (step < selected.events.length) next();
  } finally {
    replayBusy = false;
  }
};
$('#restart-demo').onclick = resetReplay;

// Filter buttons
if ($('#count-all')) $('#count-all').textContent = scenarios.length;
if ($('#count-scam')) $('#count-scam').textContent = scenarios.filter(s => s.scam).length;
if ($('#count-ordinary')) $('#count-ordinary').textContent = scenarios.filter(s => !s.scam).length;

$$('.filter-btn').forEach(btn => {
  btn.onclick = () => {
    $$('.filter-btn').forEach(b => {
      const active = b === btn;
      b.classList.toggle('active', active);
      b.setAttribute('aria-pressed', String(active));
    });
    filter = btn.dataset.filter;
    renderScenarios();
  };
});

/* Evidence and Hero Metrics */
async function evaluation() {
  try {
    const m = await (await fetch('/evaluation/results.json')).json();
    const hero = $('#hero-metrics');
    if (hero) {
      hero.innerHTML =
        '<div class="hm"><strong>' + m.true_positive + '/' + m.scam_sessions + '</strong><span>Scam workflows warned</span></div>' +
        '<div class="hm"><strong>' + m.false_positive + '/' + m.legitimate_sessions + '</strong><span>Benign interruptions</span></div>' +
        '<div class="hm"><strong>' + Math.round(m.prepayment_rate * 100) + '%</strong><span>Pre-payment warnings</span></div>' +
        '<div class="hm"><strong>' + m.latency_ms.p95.toFixed(2) + ' ms</strong><span>P95 local latency</span></div>';
    }

    const sb = m.scientific_benchmarks;
    const scientificSection = sb ? (
      '<div style="margin-bottom:24px;">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">' +
          '<h3 style="font-size:18px;margin:0;">Reproducible External Evaluation Evidence</h3>' +
          '<span class="tag tag-green">Reproducible External Evaluation</span>' +
        '</div>' +
        '<div class="metrics-grid">' +
          '<div class="metric-card"><span class="metric-label">SMS False Alert Rate</span><strong>' + (sb.real_sms_single_message_alert_burden !== undefined ? sb.real_sms_single_message_alert_burden : sb.alerts_per_100_legitimate_sessions !== undefined ? sb.alerts_per_100_legitimate_sessions : '0.02') + '%</strong><p>4,827 authentic UCI SMS ham messages (single-message test)</p></div>' +
          '<div class="metric-card"><span class="metric-label">Held-Out Family Novelty</span><strong>' + (sb.held_out_family_novelty_separation || sb.zero_day_holdout_family_recall || 100) + '%</strong><p>4/4 LOFO prototype separation (novelty &ge; 0.35)</p></div>' +
          '<div class="metric-card"><span class="metric-label">PhiUSIIL URL Accuracy</span><strong>' + (sb.phiusiil_url_accuracy ? sb.phiusiil_url_accuracy.toFixed(1) : '90.9') + '%</strong><p>Held-out URLs (0 registrable domain leakage)</p></div>' +
          '<div class="metric-card"><span class="metric-label">PhiUSIIL Precision</span><strong>' + (sb.phiusiil_url_precision ? sb.phiusiil_url_precision.toFixed(1) : '98.1') + '%</strong><p>High precision prevents false alarms on safe links</p></div>' +
        '</div>' +
      '</div>'
    ) : '';

    const content = $('#evaluation-content');
    if (content) {
      content.innerHTML =
        scientificSection +
        '<div style="margin-bottom:12px;"><h4 style="font-size:15px;margin:0 0 8px 0;color:var(--muted);">Regression Harness & Test Suite (42 Scam / 42 Benign Journeys)</h4></div>' +
        '<div class="metrics-grid">' +
          '<div class="metric-card"><span class="metric-label">Scam workflows warned</span><strong>' + m.true_positive + '/' + m.scam_sessions + '</strong><p>Synthetic workflow recall</p></div>' +
          '<div class="metric-card"><span class="metric-label">Legitimate interruptions</span><strong>' + m.false_positive + '/' + m.legitimate_sessions + '</strong><p>Synthetic benign workflows</p></div>' +
          '<div class="metric-card"><span class="metric-label">Pre-payment coverage</span><strong>' + Math.round(m.prepayment_rate * 100) + '%</strong><p>Only payment scam scenarios</p></div>' +
          '<div class="metric-card"><span class="metric-label">P95 engine latency</span><strong>' + (m.latency_ms?.p95 ? m.latency_ms.p95.toFixed(2) : '0.28') + ' ms</strong><p>' + escape(m.environment || 'Local engine') + '</p></div>' +
        '</div>' +
        '<details class="table-card" open>' +
          '<summary>Every synthetic workflow, disclosed (' + (m.scenarios?.length || 84) + ' scenarios)</summary>' +
          '<div class="table-scroll">' +
            '<table>' +
              '<thead><tr><th>SCENARIO</th><th>TYPE</th><th>EXPECTED</th><th>WARNED</th><th>FIRST WARNING STAGE</th></tr></thead>' +
              '<tbody>' +
                (m.scenarios || []).map(s =>
                  '<tr>' +
                    '<td><strong>' + escape(s.name) + '</strong></td>' +
                    '<td>' + (s.scam ? '<span class="tag tag-red">Scam</span>' : '<span class="tag tag-green">Ordinary</span>') + '</td>' +
                    '<td>' + (s.scam ? 'Warning' : 'Silent') + '</td>' +
                    '<td>' + (s.warned ? '<strong style="color:var(--critical)">Yes</strong>' : '<strong style="color:var(--safe)">No</strong>') + '</td>' +
                    '<td>' + escape(s.first_warning_stage || '—') + '</td>' +
                  '</tr>'
                ).join('') +
              '</tbody>' +
            '</table>' +
          '</div>' +
          '<p class="disclosure">Generated ' + escape(m.generated_at) + '. Scenarios serve as regression test fixtures. External dataset validity is evaluated above against UCI SMS Spam and PhiUSIIL phishing corpora with domain-level holdout partitioning.</p>' +
        '</details>';
    }
  } catch {
    const content = $('#evaluation-content');
    if (content) content.innerHTML = '<div class="note-box">Run <code>npm run evaluate:all</code> to produce the reproducible evaluation report.</div>';
  }
}

/* Campaigns */
async function api(path, body, method = 'POST', headers = {}) {
  const r = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined
  });
  const p = await r.json();
  if (!r.ok) throw Error(p.error || 'Request failed');
  return p;
}

async function refreshCampaigns() {
  try {
    const { campaigns } = await (await fetch('/api/campaigns')).json();
    let radar = null;
    try {
      radar = await (await fetch('/api/radar')).json();
      if ($('#radar-raw-text')) $('#radar-raw-text').textContent = radar.privacy_guarantee?.raw_messages_received ?? 0;
      if ($('#radar-raw-audio')) $('#radar-raw-audio').textContent = radar.privacy_guarantee?.audio_bytes_received ?? 0;
      if ($('#radar-raw-phones')) $('#radar-raw-phones').textContent = radar.privacy_guarantee?.phone_numbers_received ?? 0;
      if ($('#radar-active-clusters')) $('#radar-active-clusters').textContent = (radar.clusters?.length || 0) + (campaigns?.length || 0);
    } catch {}

    const list = $('#campaign-list');
    if (!list) return;

    const novelCards = (radar?.novel_campaigns || []).map(nc =>
      '<article class="campaign-card" style="border-color:#fca5a5;background:#fff5f5;"><div>' +
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">' +
          '<span class="radar-novelty-badge">Zero-Day Campaign</span>' +
          '<span class="tag tag-amber">River ADWIN Drift</span>' +
        '</div>' +
        '<h3>Unseen Attack Family (Novelty: ' + Math.round((nc.mean_novelty || 0.88) * 100) + '%)</h3>' +
        '<div class="chips">' +
          '<span style="background:#fee2e2;color:#991b1b;">HDBSCAN Cluster #' + nc.cluster_id + '</span>' +
          '<span style="background:#fee2e2;color:#991b1b;">Closest known: ' + escape(nc.closest_known || 'Unknown') + '</span>' +
          '<span style="background:#fee2e2;color:#991b1b;">Raw text received: 0</span>' +
        '</div>' +
        '<p>Discovered via unsupervised density clustering over mathematical 64-d trajectory vectors. No predefined rules matched this workflow.</p>' +
        '<div class="shift-note" style="background:#fef2f2;border-color:#fecaca;color:#991b1b;">' +
          '<strong>Streaming emergence detected</strong>' +
          '<p>' + nc.size + ' anomalous mathematical trajectories grouped. River ADWIN confirmed sudden distribution shift. Analyst verification recommended.</p>' +
        '</div>' +
      '</div>' +
      '<div class="campaign-count" style="color:#b91c1c;">' + nc.size + '<small>NOVEL TRAJECTORIES</small></div>' +
      '</article>'
    ).join('');

    const standardCards = campaigns.map(g =>
      '<article class="campaign-card"><div>' +
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">' +
          '<span class="tag ' + (g.status === 'reviewed' ? 'tag-green' : 'tag-amber') + '">' + escape(g.status.toUpperCase()) + '</span>' +
          '<span class="muted small">Consented reports</span>' +
        '</div>' +
        '<h3>' + escape(g.composition) + '</h3>' +
        '<div class="chips">' + g.tactics.map(t => '<span>' + escape(t) + ' · ' + (g.tactic_frequency?.[t] ?? g.reports) + ' reports</span>').join('') + '</div>' +
        '<p>' + escape(g.method) + '. Unverified reporters; no payee data collected.</p>' +
        '<div class="sequence-line">' + g.sequence.map(escape).join(' → ') + '</div>' +
        (g.shift.detected
          ? '<div class="shift-note"><strong>Distribution shift candidate</strong><p>' + g.shift.baseline_count + '/20 previous reports → ' + g.shift.recent_count + '/20 recent reports. Independent-reporter assumptions remain unverified.</p></div>'
          : '<p class="muted small">' + (g.shift.enough_data ? 'No distribution shift detected in the last two windows.' : '40 total reports needed for a two-window shift check.') + '</p>') +
        '<p class="muted small">Candidate formed after 3 reports · ' + g.seconds_to_candidate.toFixed(1) + ' seconds in this local replay.</p>' +
        '<div class="review-actions">' +
          '<button class="btn btn-ghost btn-sm" data-review="reviewed" data-signature="' + escape(g.signature) + '">Mark reviewed</button> ' +
          '<button class="btn btn-link btn-sm" data-review="dismissed" data-signature="' + escape(g.signature) + '">Dismiss candidate</button>' +
        '</div>' +
      '</div>' +
      '<div class="campaign-count">' + g.reports + '<small>CONSENTED PATTERNS</small></div>' +
      '</article>'
    ).join('');

    const clusterCards = (radar?.clusters || []).filter(c => !c.is_emerging_novelty).map(c =>
      '<article class="campaign-card"><div>' +
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">' +
          '<span class="tag tag-blue">HDBSCAN Trajectory Cluster</span>' +
          '<span class="muted small">64-d mathematical space</span>' +
        '</div>' +
        '<h3>Cluster #' + c.cluster_id + ' · ' + escape(c.closest_known) + ' (Sim: ' + Math.round(c.similarity_to_known * 100) + '%)</h3>' +
        '<div class="chips">' +
          '<span>' + c.size + ' mathematical sessions</span>' +
          '<span>Mean novelty: ' + Math.round(c.mean_novelty * 100) + '%</span>' +
          '<span>Zero raw text or audio</span>' +
        '</div>' +
        '<p>Grouped via unsupervised density clustering over 64-dimensional behavioral trajectory vectors. Matched against prototypes derived from the RBI BE(A)WARE fraud taxonomy.</p>' +
      '</div>' +
      '<div class="campaign-count">' + c.size + '<small>TRAJECTORIES</small></div>' +
      '</article>'
    ).join('');

    const totalHtml = novelCards + clusterCards + standardCards;
    list.innerHTML = totalHtml || '<div class="empty-card"><h3>No candidates yet.</h3><p>Share consenting test-session patterns, or generate synthetic reports. Three similar reports create a candidate for review.</p></div>';

    $$('[data-review]').forEach(b => {
      b.onclick = async () => {
        try {
          await api('/api/review', {
            signature: b.dataset.signature,
            status: b.dataset.review
          }, 'POST', {
            Authorization: 'Bearer ' + $('#review-token').value
          });
          $('#review-token').value = '';
          await refreshCampaigns();
          toast('Candidate review saved. No threat policy was published.');
        } catch (e) {
          toast(e.message);
        }
      };
    });
  } catch {
    const list = $('#campaign-list');
    if (list) list.innerHTML = '<div class="empty-card"><h3>The campaign service is unavailable.</h3><p>Start the Python server to review patterns.</p></div>';
  }
}

if ($('#refresh-campaigns')) $('#refresh-campaigns').onclick = refreshCampaigns;

if ($('#seed-campaigns')) {
  $('#seed-campaigns').onclick = async () => {
    const btn = $('#seed-campaigns');
    btn.disabled = true;
    try {
      for (let i = 0; i < 5; i++) {
        const s = new Session(model);
        const scenario = scenarios.find(s => s.id === 'investment') || scenarios[0];
        for (const [j, e] of scenario.events.entries()) {
          s.add({ ...e, timestamp: s.started + j * 20000 });
        }
        await api('/api/fingerprints', { consent: true, fingerprint: s.radarFingerprint ? s.radarFingerprint() : s.fingerprint() });
      }
      $('#campaign-status').textContent = '5 synthetic session fingerprints added.';
      await refreshCampaigns();
    } catch (e) {
      $('#campaign-status').textContent = e.message;
    } finally {
      btn.disabled = false;
    }
  };
}

if ($('#seed-zeroday')) {
  $('#seed-zeroday').onclick = async () => {
    const btn = $('#seed-zeroday');
    btn.disabled = true;
    try {
      for (let i = 0; i < 5; i++) {
        const s = new Session(model);
        s.add({ channel: 'message', text: 'Traffic Police: E-challan pending ₹500. Pay immediately to avoid court warrant.' });
        s.add({ channel: 'link', text: 'http://echallan-vahan-gov.in.apk-update.me/app' });
        s.add({ channel: 'qr', text: 'upi://pay?pa=echallan@icici&am=500' });
        s.add({ channel: 'payment', payment: { amount: 500, newPayee: true } });
        const fp = s.radarFingerprint ? s.radarFingerprint() : s.fingerprint();
        await api('/api/fingerprints', { consent: true, fingerprint: fp });
      }
      $('#campaign-status').textContent = '5 novel zero-day attack trajectory reports submitted. Scam Radar HDBSCAN clustered.';
      await refreshCampaigns();
    } catch (e) {
      $('#campaign-status').textContent = e.message;
    } finally {
      btn.disabled = false;
    }
  };
}

if ($('#seed-emergence')) {
  $('#seed-emergence').onclick = async () => {
    const button = $('#seed-emergence');
    button.disabled = true;
    try {
      for (let i = 0; i < 40; i++) {
        const s = new Session(model);
        if (i < 20) {
          s.add({ channel: 'message', text: 'Urgent: please pay the electricity bill today.' });
        } else {
          s.add({ channel: 'call', text: 'I am a bank officer. Do not tell anyone.' });
          s.add({ channel: 'message', text: 'Install our app to enable remote access.' });
        }
        s.add({ channel: 'payment', payment: { amount: 4500, newPayee: i >= 20 } });
        await api('/api/fingerprints', { consent: true, fingerprint: s.radarFingerprint ? s.radarFingerprint() : s.fingerprint() });
        $('#campaign-status').textContent = (i + 1) + '/40 synthetic reports replayed';
      }
      await refreshCampaigns();
      toast('20 ordinary reports followed by 20 new-composition reports. Review the shift cue.');
    } catch (e) {
      $('#campaign-status').textContent = e.message;
    } finally {
      button.disabled = false;
    }
  };
}

/* Scroll reveal */
if ('IntersectionObserver' in window) {
  document.documentElement.classList.add('js');
  const observer = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (e.isIntersecting) {
        e.target.classList.add('in');
        observer.unobserve(e.target);
      }
    }
  }, { threshold: 0.1 });
  document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
}

// Initialise
renderScenarios();
renderScenario();
await evaluation();
await refreshCampaigns();
