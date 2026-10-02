// QR frames and images stay on this device. No upload or persistent image cache.
export async function decodeQR(source) {
 if('BarcodeDetector' in globalThis){try{
  const codes=await new BarcodeDetector({formats:['qr_code']}).detect(source);
  if(codes.length>1)throw Error('Use one QR code at a time.');
  if(codes.length===1)return codes[0].rawValue;
 }catch(e){if(e.message==='Use one QR code at a time.')throw e;}}
 const width=source.videoWidth||source.width,height=source.videoHeight||source.height;
 if(!width||!height)return null;
 const scale=Math.min(1,1400/Math.max(width,height));
 const canvas=document.createElement('canvas');canvas.width=Math.round(width*scale);canvas.height=Math.round(height*scale);
 const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(source,0,0,canvas.width,canvas.height);
 const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);
 const result=globalThis.jsQR?.(pixels.data,pixels.width,pixels.height,{inversionAttempts:'attemptBoth'});
 ctx.clearRect(0,0,canvas.width,canvas.height);canvas.width=canvas.height=0;
 return result?.data??null;
}
export async function decodeImage(file){
 if(file.size>5*1024*1024)throw Error('Use an image under 5 MB.');
 if(!file.type.startsWith('image/'))throw Error('Choose a QR image.');
 const bitmap=await createImageBitmap(file);
 try{
  if(bitmap.width*bitmap.height>16000000)throw Error('Use an image smaller than 16 megapixels.');
  const code=await decodeQR(bitmap);
  if(!code)throw Error('No QR found. Try a clearer image, or paste the UPI payload.');
  return code;
 }finally{bitmap.close();}
}
export class CameraScanner {
 constructor(video,onCode,onStatus){this.video=video;this.onCode=onCode;this.onStatus=onStatus;this.stream=null;this.frame=null;this.generation=0;}
 async start(){
  this.stop();const generation=this.generation;
  if(!globalThis.isSecureContext||!navigator.mediaDevices?.getUserMedia)throw Error('Camera scanning needs HTTPS or localhost. Use a QR screenshot instead.');
  const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:640},height:{ideal:480}},audio:false});
  if(generation!==this.generation){stream.getTracks().forEach(t=>t.stop());return;}
  this.stream=stream;this.video.srcObject=stream;await this.video.play();
  this.onStatus('Point at one UPI QR. Frames stay on this device.');
  let last=0;
  const loop=async time=>{
   if(!this.stream||generation!==this.generation)return;
   if(time-last>=200){last=time;try{
    const value=await decodeQR(this.video);
    if(value){this.stop();this.onCode(value);return;}
   }catch(e){this.onStatus(e.message);}}
   if(this.stream&&generation===this.generation)this.frame=requestAnimationFrame(loop);
  };
  this.frame=requestAnimationFrame(loop);
 }
 stop(){this.generation++;if(this.frame)cancelAnimationFrame(this.frame);this.frame=null;this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;this.video.pause();this.video.srcObject=null;}
}
