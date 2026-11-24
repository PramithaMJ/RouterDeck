/**
 * "Router page button": a bookmarklet the user taps while their router's own
 * admin page (e.g. http://192.168.1.1) is open. It shows RouterDeck full-screen
 * inside that page (an iframe; no pop-up, so it works on iPhone/Android too)
 * and answers RouterDeck's requests from the router page, where the browser
 * allows reading the router (same origin). Nothing to install.
 *
 * Safety:
 *  - only answers messages coming from the RouterDeck origin baked into it,
 *  - only fetches URLs on the router page's own origin,
 *  - RouterDeck is always visible while the bridge is active.
 */
export function bridgeSource(appOrigin: string): string {
  // Plain ES2017 so it runs in any browser on any router page.
  return `(function(){
var O=${JSON.stringify(appOrigin)};
if(window.__rdBridge){window.__rdBridge.show();return;}
var frame=null,pop=null,wrap=null;
function show(){
if(wrap){wrap.style.display='flex';return;}
wrap=document.createElement('div');
wrap.setAttribute('style','position:fixed;inset:0;z-index:2147483647;background:#f7f6f2;display:flex;flex-direction:column');
var bar=document.createElement('div');
bar.setAttribute('style','display:flex;align-items:center;gap:10px;padding:6px 10px;background:#1b1a17;color:#f7f6f2;font:500 13px/1.3 -apple-system,system-ui,Segoe UI,sans-serif');
bar.innerHTML='<span style="width:8px;height:8px;border-radius:50%;background:#f2632a;flex:none"></span><span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">RouterDeck · connected through this page</span>';
function btn(t,f){var b=document.createElement('button');b.textContent=t;b.setAttribute('style','all:unset;cursor:pointer;padding:5px 9px;border-radius:7px;background:rgba(255,255,255,.12);font-weight:600;white-space:nowrap');b.onclick=f;bar.appendChild(b);}
btn('New tab',function(){pop=window.open(O+'/?bridge=tab','routerdeck');});
btn('Close',function(){wrap.style.display='none';});
frame=document.createElement('iframe');
frame.src=O+'/?bridge=frame';
frame.setAttribute('allow','clipboard-write');
frame.setAttribute('style','flex:1;width:100%;border:0;background:#f7f6f2');
wrap.appendChild(bar);wrap.appendChild(frame);
(document.body||document.documentElement).appendChild(wrap);
}
function b64(buf){var b=new Uint8Array(buf),s='';for(var i=0;i<b.length;i+=32768)s+=String.fromCharCode.apply(null,b.subarray(i,i+32768));return btoa(s);}
function rq(q){
var u=new URL(q.url,location.href);
if(u.origin!==location.origin)return Promise.reject(new Error('This bridge only talks to '+location.host+'.'));
var c=new AbortController(),t=setTimeout(function(){c.abort();},Math.min(q.timeoutMs||15000,60000));
var body=q.method==='POST'?(q.bodyBase64?Uint8Array.from(atob(q.bodyBase64),function(x){return x.charCodeAt(0);}):q.body):undefined;
return fetch(u.toString(),{method:q.method||'GET',headers:q.headers||{},body:body,credentials:'include',cache:'no-store',signal:c.signal}).then(function(r){
var h={};r.headers.forEach(function(v,k){h[k]=v;});
return r.arrayBuffer().then(function(buf){
clearTimeout(t);
if(q.responseType==='base64')return{status:r.status,url:r.url,headers:h,body:'',bodyBase64:b64(buf)};
var cs=((/charset=([\\w-]+)/i.exec(h['content-type']||''))||[])[1]||'utf-8',txt;
try{txt=new TextDecoder(cs).decode(buf);}catch(e){txt=new TextDecoder().decode(buf);}
return{status:r.status,url:r.url,headers:h,body:txt};});
},function(e){clearTimeout(t);var err=new Error(e&&e.name==='AbortError'?'The router took too long to answer.':'The router could not be reached.');err.code=e&&e.name==='AbortError'?'timeout':'unreachable';throw err;});
}
window.addEventListener('message',function(e){
var m=e.data;if(e.origin!==O||!m||m.source!=='routerdeck-app'||typeof m.id!=='string')return;
if(!(frame&&e.source===frame.contentWindow)&&!(pop&&e.source===pop))return;
function reply(d){d.source='routerdeck-tab';d.id=m.id;e.source.postMessage(d,O);}
if(m.type==='hello')return reply({ok:true,result:{version:'2',origin:location.origin}});
if(m.type==='request')return rq(m.payload||{}).then(function(r){reply({ok:true,result:r});},function(err){reply({ok:false,error:String(err.message||err),code:err.code||'unreachable'});});
if(m.type==='probe')return reply({ok:true,result:[location.origin]});
if(m.type==='network')return reply({ok:true,result:{gateway:location.host}});
if(m.type==='reset')return reply({ok:true,result:null});
reply({ok:false,error:'Unknown request',code:'not-allowed'});
});
window.__rdBridge={show:show};
show();
})();`;
}

/** javascript: URL for the bookmark (whitespace collapsed). */
export function bookmarkletHref(appOrigin: string): string {
  const code = bridgeSource(appOrigin)
    .split("\n")
    .map((l) => l.trim())
    .join("");
  return "javascript:" + encodeURIComponent(code);
}
