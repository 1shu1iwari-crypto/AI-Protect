import {ReviewSession,QUICK_SIGNALS,signalText,responsePlan,REVIEW_LABELS} from '/core/review.mjs';
import {parseUPI,LABELS} from '/core/engine.mjs';
import {CameraScanner,decodeImage} from '/web/qr.mjs';
import {createNativeReviewBridge} from '/web/native-review.mjs';
import {Analytics} from '/web/analytics.mjs';
if(window.NativeReviewMessages)window.NativeReview=createNativeReviewBridge(window.NativeReviewMessages,payload=>receiveNative(payload));
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let pendingShared=false;let pendingEvidenceType=null;
let model=null;try{model=await(await fetch('/core/model.json')).json();}catch{}
let session=new ReviewSession(model);const reviews=new Map();const analytics=new Analytics();let channel='message',lastResult=null,lastLatency=0,toastTimer,sharedIds=new Set();
const names={home:'Home',protect:'Check',reviews:'Reviews',privacy:'Privacy'};
function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,4500);}
function view(name){camera.stop();$('#camera-dialog').close();document.documentElement.dataset.view=name;for(const v of $$('.view'))v.hidden=v.id!=='view-'+name;for(const b of $$('.nav[data-view]'))b.classList.toggle('active',b.dataset.view===name);$('#page-name').textContent=names[name];if(name==='home')renderHome();if(name==='reviews')renderReviews();if(name==='privacy')renderFingerprint();window.scrollTo(0,0);}
$$('[data-view]').forEach(b=>b.addEventListener('click',()=>view(b.dataset.view)));
function reset(){camera.stop();$('#camera-dialog').close();reviews.delete(session.id);session.reset();lastResult=null;$('#content').value='';$('#payee').value='';$('#form-error').textContent='';$('#sharing-consent').checked=false;$('#sharing-status').textContent='';$('#alert-card').hidden=true;$('#action-center').hidden=true;$('#response-plan').replaceChildren();$('#decision-result').textContent='';render();renderHome();toast('Session cleared. Local checks are ready.');}
$('#clear-session').onclick=reset;$('#privacy-clear').onclick=reset;
const help={message:['Paste a message you want to check','Only content you submit is checked. Text is cleared after analysis.','Your refund is ready. Scan this QR to receive money…'],link:['Paste a suspicious link','The link is inspected as text. AI-Protect never opens the destination.','https://example.invalid/support.apk'],qr:['Paste the decoded UPI QR payload','An upi://pay intent sends money. Payee details are parsed locally and discarded.','upi://pay?pa=merchant@demo&am=2500&cu=INR'],call:['Paste what the caller said','This form checks typed text only and never activates the microphone.','I am a police officer. Do not disconnect. Transfer to a safe account.']};
function setChannel(c){camera.stop();$('#camera-dialog').close();channel=c;for(const b of $$('[data-channel]')){const on=b.dataset.channel===c;b.classList.toggle('selected',on);b.setAttribute('aria-pressed',String(on));}$('#payment-input').hidden=c!=='payment';$('#text-input').hidden=c==='payment';$('#qr-import').hidden=c!=='qr';if($('#audio-import'))$('#audio-import').hidden=c!=='call';$('#form-error').textContent='';if(help[c]){$('#input-label').textContent=help[c][0];$('#input-help').textContent=help[c][1];$('#content').placeholder=help[c][2];}$('#content').value='';}
$$('[data-channel]').forEach(b=>b.onclick=()=>setChannel(b.dataset.channel));
function check(input,source='user_check'){const start=performance.now();const r=session.add({...input,userTriggered:true});lastLatency=performance.now()-start;lastResult=r;render();analytics.capture('check_completed',{severity:r.severity,stage:r.stage,latency_ms:lastLatency,channel:input.channel,source,intervention:r.showWarning?'shown':r.suppressed?'suppressed':'none'});if(r.suppressed)analytics.capture('warning_suppressed',{severity:r.severity,stage:r.stage,source});if(r.showWarning){$('#alert-card').hidden=false;$('#alert-title').textContent='STOP & VERIFY';$('#alert-reason').textContent=r.reason;$('#decision-result').textContent='';analytics.capture('warning_shown',{severity:r.severity,stage:r.stage,latency_ms:lastLatency,source});if(!$('#view-protect').hidden){$('#alert-card').focus({preventScroll:true});$('#alert-card').scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}}return r;}
$('#check-form').onsubmit=ev=>{ev.preventDefault();try{let input={channel,text:$('#content').value,evidence_type:pendingEvidenceType};if(channel==='payment')input={channel,payment:{amount:Number($('#amount').value),newPayee:$('#new-payee').checked}};else if(!input.text.trim())throw Error('Paste content before checking.');check(input);pendingShared=false;pendingEvidenceType=null;$('#content').value='';$('#payee').value='';$('#form-error').textContent='';toast(lastResult.showWarning?'Pause and verify this request.':'Context checked locally.');}catch(e){$('#form-error').textContent=e.message;}};
function render(){renderReviewDetails();const count=session.events.length;$('#event-count').textContent=count+' event'+(count===1?'':'s');$('#session-empty').hidden=count>0;$('#session-result').hidden=!count;$('#export-session').disabled=!count;if(lastResult){$('#evidence').innerHTML=lastResult.evidenceScore+'<span>/100</span>';if($('#requested-risk'))$('#requested-risk').innerHTML=(lastResult.requestedActionRisk??0)+'<span>/100</span>';$('#risk').innerHTML=(lastResult.executionRisk??lastResult.actionRisk)+'<span>/100</span>';$('#risk-bar').style.width=Math.max(lastResult.requestedActionRisk??0,lastResult.executionRisk??lastResult.actionRisk)+'%';$('#stage').textContent=lastResult.stage;$('#severity').textContent=lastResult.suppressed?'Repeated warning limited':lastResult.severity.toUpperCase();$('#result-note').textContent=lastResult.reason;$('#latency').textContent='Last local check: '+lastLatency.toFixed(1)+' ms';$('#timeline').innerHTML=session.timeline.map((e,i)=>'<div class="timeline-item"><strong>'+String(i+1).padStart(2,'0')+' / '+escape(e.channel.toUpperCase())+' · '+escape(e.change)+'</strong>'+audioOffset(e.audio_segment)+'<span>Verification: '+escape(e.verification)+' · '+escape(e.evidence.map(t=>REVIEW_LABELS[t]||LABELS[t]||t).join(' · ')||'No tactic evidence')+'</span><p>'+escape(e.reason)+'</p></div>').join('');}else{$('#timeline').replaceChildren();$('#latency').textContent='Waiting for your first check';}renderFingerprint();}
function nativeAction(action){Promise.resolve(action).catch(error=>toast(error.message));}
function download(name,value){if(window.NativeReview){nativeAction(window.NativeReview.exportReport(JSON.stringify(value)));return;}const u=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
$('#export-session').onclick=exportReview;
$('#cancel-payment').onclick=()=>{session.recordAction('cancel_simulation');persistReviews();$('#decision-result').textContent='Simulated request cancelled. No money has moved.';analytics.capture('user_cancelled_payment',{severity:lastResult?.severity,stage:lastResult?.stage});};
$('#continue-payment').onclick=()=>$('#continue-dialog').showModal();$('#keep-paused').onclick=()=>$('#continue-dialog').close();$('#confirm-continue').onclick=()=>{session.recordAction('continue_simulation');persistReviews();$('#continue-dialog').close();$('#decision-result').textContent='Simulated request continued by your choice. No real transaction occurred.';analytics.capture('user_continued',{severity:lastResult?.severity,stage:lastResult?.stage});};
$('#false-positive').onclick=()=>{$('#decision-result').textContent='Feedback recorded for this visit. The detection policy has not been changed.';analytics.capture('false_positive_feedback',{severity:lastResult?.severity,stage:lastResult?.stage});};
async function api(path,body,method='POST',headers={}){if(window.NativeReview)throw Error('Pattern sharing needs the web app and local server. Export this redacted review instead.');const r=await fetch(path,{method,headers:{'Content-Type':'application/json',...headers},body:body?JSON.stringify(body):undefined});const p=await r.json();if(!r.ok)throw Error(p.error||'Request failed');return p;}
function renderFingerprint(){$('#fingerprint-preview').textContent=JSON.stringify(session.fingerprint(),null,2);}
$('#share-pattern').onclick=async()=>{try{if(!$('#sharing-consent').checked)throw Error('Choose to share this pattern first.');if(!session.events.length)throw Error('Check at least one event first.');session.consent=$('#sharing-consent').checked;await api('/api/fingerprints',session.report());sharedIds.add(session.id);$('#sharing-status').textContent='Shared with the local campaign service. Retained for at most 24 hours.';analytics.capture('user_reported_scam');}catch(e){$('#sharing-status').textContent=e.message;}};
$('#delete-pattern').onclick=async()=>{try{if(!sharedIds.size)throw Error('No pattern has been shared during this visit.');for(const id of [...sharedIds]){await api('/api/fingerprints/'+encodeURIComponent(id),null,'DELETE');sharedIds.delete(id);}$('#sharing-status').textContent='Your shared patterns were deleted.';}catch(e){$('#sharing-status').textContent=e.message;}};
$('#analytics-consent').onchange=async()=>{await analytics.load();analytics.enable($('#analytics-consent').checked);if(!analytics.enabled)$('#analytics-consent').checked=false;$('#analytics-status').textContent=analytics.enabled?'Anonymous usage events enabled for this visit.':'Analytics are off. The operator must configure a PostHog project token to enable them.';if(analytics.enabled)analytics.capture('scamguard_activated');};
const camera=new CameraScanner($('#camera-video'),value=>{try{parseUPI(value);$('#content').value=value;$('#camera-dialog').close();toast('QR read locally. Choose Review now to inspect it.');}catch(e){$('#camera-dialog').close();$('#form-error').textContent=e.message;}},message=>$('#camera-status').textContent=message);
$('#qr-file').onchange=async ev=>{const file=ev.target.files[0];try{if(!file)return;const value=await decodeImage(file);parseUPI(value);$('#content').value=value;$('#form-error').textContent='';toast('QR decoded locally. Tap Review now to inspect the payment intent.');}catch(e){$('#form-error').textContent=e.message;}finally{ev.target.value='';}};
$('#scan-camera').onclick=async()=>{$('#camera-dialog').showModal();try{await camera.start();}catch(e){camera.stop();$('#camera-status').textContent=e.name==='NotAllowedError'?'Camera permission was declined. Use a screenshot or paste the QR payload.':e.message;}};
$('#stop-camera').onclick=()=>{camera.stop();$('#camera-dialog').close();};
$('#camera-dialog').addEventListener('close',()=>camera.stop());
$('#camera-dialog').addEventListener('cancel',()=>camera.stop());
document.addEventListener('visibilitychange',()=>{if(document.hidden){camera.stop();$('#camera-dialog').close();}});
window.addEventListener('pagehide',()=>camera.stop());
let installPrompt=null;window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;$('#install-app').hidden=false;});
$('#install-app').onclick=async()=>{if(!installPrompt)return;await installPrompt.prompt();installPrompt=null;$('#install-app').hidden=true;};
$$('[data-channel]').forEach((button,i,buttons)=>button.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const j=e.key==='Home'?0:e.key==='End'?buttons.length-1:(i+(e.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;buttons[j].focus();setChannel(buttons[j].dataset.channel);}));
async function receiveSharedContent(){
  const match=location.hash.match(/^#shared=([a-zA-Z0-9-]{8,64})$/);if(!match)return;
  history.replaceState(null,'',location.pathname);
  try{await navigator.serviceWorker.ready;const worker=navigator.serviceWorker.controller;if(!worker)throw Error('Paste the shared content to check it.');
  const payload=await new Promise((resolve,reject)=>{const channel=new MessageChannel();const timer=setTimeout(()=>{channel.port1.close();reject(Error('Shared content expired. Paste it again.'));},4000);channel.port1.onmessage=e=>{clearTimeout(timer);channel.port1.close();resolve(e.data);};worker.postMessage({type:'TAKE_SHARE',token:match[1]},[channel.port2]);});
  if(payload.error)throw Error(payload.error);if(payload.review){try{session=ReviewSession.restore(payload.review,model);lastResult=session.events.length?session.assess(session.events.at(-1)):null;render();}catch{}}view('protect');setChannel(payload.text.trim().startsWith('upi://')?'qr':'message');pendingShared=true;$('#content').value=payload.text;toast('Shared content is ready. You choose when to check it.');
  }catch(e){toast(e.message);}
}
window.addEventListener('offline',()=>$('#connectivity').textContent='Offline checks');window.addEventListener('online',()=>$('#connectivity').textContent='On-device engine');
if('serviceWorker' in navigator&&!window.NativeReview){navigator.serviceWorker.register('/web/sw.js',{scope:'/'}).then(receiveSharedContent).catch(()=>{});}

function persistReviews(){
  if(session.events.length||session.user_flagged)reviews.set(session.id,session.snapshot());
  while(reviews.size>10)reviews.delete(reviews.keys().next().value);
  const state=JSON.stringify({active:session.id,reviews:[...reviews.values()]});
  if(window.NativeReview)nativeAction(window.NativeReview.saveReviews(state));
  navigator.serviceWorker?.controller?.postMessage({type:'REVIEW_CONTEXT',review:session.events.length?session.snapshot():null});
}
async function initializeReviews(){
  if(!window.NativeReview)return;
  for(const id of ['analytics-consent','scan-camera'])$('#'+id).disabled=true;
  $('#analytics-status').textContent='Android companion: no network permission; analytics are unavailable.';
  try{const state=JSON.parse(await window.NativeReview.loadReviews()||'{}');for(const r of state.reviews||[]){try{const restored=ReviewSession.restore(r,model);reviews.set(restored.id,restored.snapshot());}catch{}}if(reviews.has(state.active)){session=ReviewSession.restore(reviews.get(state.active),model);lastResult=session.events.length?session.assess(session.events.at(-1)):null;}}catch(error){toast('Saved reviews could not be loaded: '+error.message);}
  window.receiveNative=receiveNative;
  try{await window.NativeReview.ready();}catch(error){toast(error.message);}
}

/* Activity rows shared by Home and Reviews: contact-style, risk chip at a glance. */
const CHANNEL_TITLES={call:'Call review',message:'Message review',link:'Link review',qr:'UPI / QR review',payment:'Payment review'};
const CHANNEL_NAMES={call:'Call',message:'Message',link:'Link',qr:'UPI QR',payment:'Payment'};
function riskChip(r){const last=r.timeline?.at(-1);const severity=last?.severity;if(severity==='high'||severity==='warning')return ['red','Potential scam'];if(severity==='watch')return ['amber','Be careful'];if(!last&&r.user_flagged)return ['amber','Call flagged'];return ['green','No strong signs'];}
function when(ts){const d=new Date(ts);if(Number.isNaN(d.getTime()))return '';const today=new Date();return d.toDateString()===today.toDateString()?d.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}):d.toLocaleDateString([],{day:'numeric',month:'short'});}
function activityRow(r){
  const [tone,label]=riskChip(r);const channels=[...new Set((r.events||[]).map(e=>e.channel))];
  const title=r.claimed_org?r.claimed_org.toUpperCase()+' claim':r.direction==='incoming'&&!channels.length?'Incoming call':CHANNEL_TITLES[channels[0]]||'Private review';
  const initials=title.replace(/[^A-Za-z ]/g,'').split(' ').filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase()||'AP';
  const detail=(channels.map(c=>CHANNEL_NAMES[c]||c).join(' + ')||'Flagged by you')+' · '+r.events.length+' event'+(r.events.length===1?'':'s');
  return '<button class="row review-summary" data-review-id="'+escape(r.session_id)+'"><div class="row-top"><span class="avatar tone-'+tone+'">'+escape(initials)+'</span><div class="row-main"><strong>'+escape(title)+'</strong><span>'+escape(detail)+'</span></div><span class="row-time">'+escape(when(r.updated||r.started))+'</span></div><div class="row-bottom"><span>'+escape(r.workflow_state)+' · '+escape(r.payment_status.replaceAll('_',' '))+'</span><span class="risk '+tone+'">'+label+'</span></div></button>';
}
function openReview(id){persistReviews();session=ReviewSession.restore(reviews.get(id),model);lastResult=session.events.length?session.assess(session.events.at(-1)):null;$('#alert-card').hidden=!lastResult||!['high','warning'].includes(lastResult.severity);$('#alert-title').textContent='STOP & VERIFY';$('#alert-reason').textContent=lastResult?.reason||'';$('#sharing-consent').checked=false;render();view('protect');}
function bindReviewRows(root){$$(root+' [data-review-id]').forEach(b=>b.onclick=()=>openReview(b.dataset.reviewId));}
function renderReviews(){persistReviews();$('#review-list').innerHTML=[...reviews.values()].reverse().map(activityRow).join('')||'<div class="empty-row"><strong>No reviews yet.</strong>Your checks and flagged calls will appear here.</div>';bindReviewRows('#review-list');}
function renderHome(){persistReviews();const all=[...reviews.values()].reverse();$('#recent-count').textContent=all.length;$('#recent-list').innerHTML=all.slice(0,3).map(activityRow).join('')||'<div class="empty-row"><strong>Nothing checked yet.</strong>Paste a message, link or UPI request above and AI-Protect will review it privately.</div>';bindReviewRows('#recent-list');}
function renderReviewDetails(){
  $('#active-review-label').textContent='Review '+session.id.slice(0,6)+(session.user_flagged?' · call flagged':'');
  $('#action-center').hidden=!(((session.events.length && lastResult?.severity !== 'quiet') || session.user_flagged));
  const v=lastResult?.verification;const fused=lastResult?.fused;
  let fusedHtml='';
  if(fused?.media_authenticity?.assessment==='synthetic_suspected'){
    fusedHtml+='<div style="background:#fee2e2;border:1px solid #ef4444;color:#991b1b;padding:8px 12px;border-radius:8px;margin-bottom:8px;font-size:13px;"><strong>Voice authenticity needs review</strong>: An evaluated acoustic model flagged possible synthetic speech (raw score: '+(fused.media_authenticity.raw_score*100).toFixed(0)+'%). This does not verify caller identity.</div>';
  } else if(fused?.media_authenticity?.assessment==='no_strong_synthetic_indication'){
    fusedHtml+='<div style="background:#ecfdf5;border:1px solid #10b981;color:#065f46;padding:8px 12px;border-radius:8px;margin-bottom:8px;font-size:13px;"><strong>Voice assessment</strong>: No strong synthetic indication was found. This is not proof of a genuine voice. Caller identity remains unverified.</div>';
  }
  if(v?.domain_consistency==='lookalike_impersonation'){
    fusedHtml+='<div style="background:#fffbeb;border:1px solid #f59e0b;color:#92400e;padding:8px 12px;border-radius:8px;margin-bottom:8px;font-size:13px;"><strong>⚠️ Deceptive Lookalike Domain Detected</strong>: The link mimics '+escape(v.claimed_name)+' brand keywords on an unauthorized domain.</div>';
  }
  $('#verification-evidence').innerHTML=fusedHtml+(session.timeline.some(e=>e.verification==='mismatch'||e.verification==='lookalike_impersonation')?'<p class="verification-status">Earlier domain mismatch in this review. Caller identity is unverified.</p>':'')+(v?'<div class="eyebrow">Claimed identity</div><h3>'+escape(v.claimed_name)+'</h3><span class="verification-status">'+escape(v.status.toUpperCase())+' · DOMAIN CHECK</span><p>'+escape(v.explanation)+'</p>'+v.domains.map(d=>'<div class="domain-evidence">'+escape(d.domain)+' · '+escape(d.status)+'</div>').join('')+'<p class="help">Caller: unverified · Contact context: '+escape(v.sender_context)+' · Support contact: '+escape(v.support_contact)+' · Destination: '+escape(v.destination_type)+'</p><h3>Manipulation evidence</h3><p>'+escape(lastResult.manipulation?.map(e=>e.label).join(' · ')||'No manipulation evidence in this event.')+'</p><h3>Workflow risk</h3>':session.events.length?'<p>Review restored from derived signals. Caller identity remains unverified.</p>':'');
  if(session.payment_status!=='unknown')showResponse(session.payment_status==='sent'?'yes':'no',false);else $('#response-plan').replaceChildren();
  persistReviews();
}
function newReview(){persistReviews();session=new ReviewSession(model);lastResult=null;if(!pendingShared)$('#content').value='';$('#alert-card').hidden=true;$('#sharing-consent').checked=false;$('#sharing-status').textContent='';render();view('protect');}
$('#new-review').onclick=newReview;$('#reviews-new').onclick=newReview;
$('#quick-signals').innerHTML=QUICK_SIGNALS.map(([key,label])=>'<label class="check-label"><input type="checkbox" value="'+key+'"> '+escape(label)+'</label>').join('');
function openCall(details={}){if(details.id&&details.id!==session.id){persistReviews();session=reviews.has(details.id)?ReviewSession.restore(reviews.get(details.id),model):new ReviewSession(model);lastResult=null;}session.startCall(details);$('#quick-signals').querySelectorAll('input').forEach(i=>i.checked=false);render();view('protect');$('#call-dialog').showModal();}
$('#review-call').onclick=()=>openCall();$('#close-call').onclick=()=>$('#call-dialog').close();
$('#call-signals').onsubmit=e=>{e.preventDefault();const chosen=$$('#quick-signals input:checked').map(i=>i.value);check({channel:'call',text:signalText(chosen)||'Call reviewed; no listed signals noticed.'});$('#call-dialog').close();};
function showResponse(paid,record=true){const plan=record?session.choosePayment(paid):responsePlan(paid);$('#response-plan').innerHTML='<h3>'+escape(plan.title)+'</h3><ol>'+plan.steps.map(s=>'<li>'+escape(s)+'</li>').join('')+'</ol><div class="response-links">'+plan.routes.map(r=>'<a class="outline" href="'+r.url+'" target="_blank" rel="noopener noreferrer" data-route="'+r.id+'">'+escape(r.label)+'</a>').join('')+'</div>';$$('[data-route]').forEach(a=>a.onclick=e=>{session.recordAction('report_route');persistReviews();if(window.NativeReview){e.preventDefault();nativeAction(window.NativeReview.openRoute(a.dataset.route));}});if(record)persistReviews();}
$('#paid-no').onclick=()=>showResponse('no');$('#paid-yes').onclick=()=>showResponse('yes');
$('#independent-verify').onclick=()=>{session.recordAction('verify_independently');persistReviews();toast('End the call. Use the bank app you already use, your bank card or branch. Do not use contact details in the suspicious message.');};
$('#block-ignore').onclick=()=>{session.recordAction('block_ignore');persistReviews();toast('Preserve needed evidence, then use Block in your phone or messaging app. AI-Protect has not blocked anyone.');};
$('#report-review').onclick=()=>view('privacy');
function exportReview(){session.recordAction('export');persistReviews();download('ai-protect-redacted-review.json',{prototype:true,review:session.snapshot(),fingerprint:session.fingerprint(),note:'Derived signals only. Preserve original receipts and messages separately.'});}
$('#save-review').onclick=exportReview;$('#delete-review').onclick=reset;

/* Home shortcuts. Nothing is analysed until the user presses Review now. */
function guessChannel(text){const t=text.trim();return t.startsWith('upi://')?'qr':/^(https?:\/\/|www\.)\S+$/i.test(t)?'link':'message';}
$('#home-form').onsubmit=e=>{e.preventDefault();const text=$('#home-input').value;view('protect');if(text.trim()){setChannel(guessChannel(text));$('#content').value=text;$('#home-input').value='';toast('Ready. Tap Review now when you want it checked.');}else $('#content').focus();};
$$('[data-quick]').forEach(b=>b.onclick=()=>{const kind=b.dataset.quick;if(kind==='call'){openCall();return;}view('protect');setChannel(kind);});
$('#scan-fab').onclick=()=>{view('protect');setChannel('qr');$('#scan-camera').focus();};
$('#paste-clipboard').onclick=async()=>{try{const text=await navigator.clipboard.readText();if(!text.trim())throw Error('empty');if(channel==='payment')setChannel(guessChannel(text));$('#content').value=text.slice(0,10000);toast('Pasted from clipboard. Tap Review now to check it.');}catch{toast('Clipboard is unavailable. Paste into the box instead.');}};

async function receiveNative(payload){
  if(payload.kind==='call'){openCall({id:payload.id,direction:payload.direction});return;}
  if(payload.kind==='postcall'){view('protect');$('#action-center').hidden=false;$('#action-center').scrollIntoView({block:'start'});return;}
  if(payload.kind==='share'){
   view('protect');setChannel(String(payload.text||'').trim().startsWith('upi://')?'qr':'message');pendingShared=true;pendingEvidenceType=null;$('#content').value=String(payload.text||'').slice(0,10000);
   if(payload.image){pendingEvidenceType='screenshot';try{const bytes=Uint8Array.from(atob(payload.image),c=>c.charCodeAt(0));const value=await decodeImage(new Blob([bytes],{type:payload.mime||'image/png'}));setChannel(value.startsWith('upi://')?'qr':'message');$('#content').value=value;}catch{$('#content').value='Screenshot supplied by user; no readable QR. Contents not analyzed.';toast('No readable QR. Tap Review now to record screenshot evidence only, or replace this text with relevant words. Keep the original image yourself.');return;}}
   toast('Shared content is ready for review '+session.id.slice(0,6)+'. Tap Review now to associate it, or New review for another request.');
  }
}
await initializeReviews();render();renderHome();

function audioOffset(segment){if(!segment)return '';const stamp=ms=>Math.floor(ms/60000)+':'+String(Math.floor(ms/1000)%60).padStart(2,'0');return '<span>Recording '+stamp(segment.start_ms)+'–'+stamp(segment.end_ms)+' · '+escape(segment.speaker==='other'?'Other person':'Speaker unknown')+' · '+escape(segment.language)+'</span>';}
