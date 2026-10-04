const METHODS=new Set(['ready','loadReviews','saveReviews','exportReport','openRoute']);
const ROUTES=new Set(['cybercrime','chakshu','helpline']);

// Android exposes this transport only to the packaged origin and main frame.
// All replies are asynchronous; no broad JavaScript interface is needed.
export function createNativeReviewBridge(transport,receiveNative,{timeoutMs=5000}={}) {
 if(!transport||typeof transport.postMessage!=='function')throw Error('Native review messaging is unavailable.');
 const pending=new Map();let counter=0;
 transport.onmessage=event=>{
  let message;try{message=JSON.parse(event.data);}catch{return;}
  if(!message||typeof message!=='object')return;
  if(message.type==='native') {
   if(message.payload&&['call','share','postcall'].includes(message.payload.kind))Promise.resolve().then(()=>receiveNative(message.payload)).catch(()=>{});
   return;
  }
  const request=pending.get(message.id);if(!request)return;
  pending.delete(message.id);clearTimeout(request.timer);
  if(typeof message.error==='string')request.reject(Error(message.error));
  else request.resolve(message.result);
 };
 function request(method,payload=null) {
  if(!METHODS.has(method))return Promise.reject(Error('Unsupported native review action.'));
  if(method==='openRoute'&&!ROUTES.has(payload))return Promise.reject(Error('Unsupported report route.'));
  if(['saveReviews','exportReport'].includes(method)&&(typeof payload!=='string'||payload.length>512000))return Promise.reject(Error('Native review data is invalid or too large.'));
  const id='review-'+(++counter);
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{pending.delete(id);reject(Error('Native review action timed out.'));},timeoutMs);
   pending.set(id,{resolve,reject,timer});
   try{transport.postMessage(JSON.stringify({id,method,payload}));}catch(error){clearTimeout(timer);pending.delete(id);reject(error);}
  });
 }
 return Object.freeze({ready:()=>request('ready'),loadReviews:()=>request('loadReviews'),saveReviews:state=>request('saveReviews',state),exportReport:report=>request('exportReport',report),openRoute:route=>request('openRoute',route)});
}
