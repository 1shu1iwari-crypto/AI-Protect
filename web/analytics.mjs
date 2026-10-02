import {randomId} from '../core/engine.mjs';
const EVENTS=new Set(['scamguard_activated','check_completed','warning_shown','warning_suppressed','user_continued','user_cancelled_payment','user_reported_scam','false_positive_feedback']);
export function analyticsPayload(event,properties={}) {
 if(!EVENTS.has(event))throw Error('Unknown analytics event');
 const safe={};
 if(['quiet','watch','warning','high'].includes(properties.severity))safe.severity=properties.severity;
 if(['Normal','Pretext','Pressure','Sensitive action','Payment intent','Transfer prepared'].includes(properties.stage))safe.stage=properties.stage;
 if(['message','call','link','qr','payment'].includes(properties.channel))safe.channel=properties.channel;
 if(['user_check','synthetic_scam','synthetic_benign'].includes(properties.source))safe.source=properties.source;
 if(['shown','suppressed','none'].includes(properties.intervention))safe.intervention=properties.intervention;
 if(typeof properties.latency_ms==='number'&&Number.isFinite(properties.latency_ms)&&properties.latency_ms>=0)safe.latency_bucket=properties.latency_ms<10?'under_10ms':properties.latency_ms<100?'10_100ms':'100ms_plus';
 return {event,properties:safe};
}
export class Analytics {
 constructor(){this.enabled=false;this.id=randomId();this.configured=false;}
 async load(){try{this.configured=(await(await fetch('/api/config')).json()).external_analytics===true;}catch{}return this.configured;}
 enable(value){this.enabled=Boolean(value)&&this.configured;if(!this.enabled)this.id=randomId();}
 async capture(event,properties){if(!this.enabled)return;const payload=analyticsPayload(event,properties);try{await fetch('/api/analytics',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,consent:true,distinct_id:this.id})});}catch{/* Analytics failure never interrupts protection. */}}
}
