/**
 * "Router tab bridge": a bookmarklet the user clicks while their router's own
 * admin page (e.g. http://192.168.1.1) is open. It opens RouterDeck in a new
 * tab and answers its requests from inside the router's page, where the
 * browser allows reading the router (same origin). Nothing to install.
 *
 * Safety:
 *  - only answers messages from the RouterDeck origin baked into it,
 *  - only fetches URLs on the router page's own origin,
 *  - shows a visible banner while active.
 */
export function bridgeSource(appOrigin: string): string {
  // Plain ES2017 so it runs in any browser on any router page.
  return `(function(){
var O=${JSON.stringify(appOrigin)};
if(window.__rdBridge){window.__rdBridge.open();return;}
var w=null;
function open(){w=window.open(O+'/?bridge=tab','routerdeck');if(!w)alert('Please allow pop-ups for this page, then click RouterDeck again.');}
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
},function(e){clearTimeout(t);throw new Error(e&&e.name==='AbortError'?'The router took too long to answer.':'The router could not be reached.');});
}
window.addEventListener('message',function(e){
var m=e.data;if(e.origin!==O||!m||m.source!=='routerdeck-app'||typeof m.id!=='string')return;
function reply(d){d.source='routerdeck-tab';d.id=m.id;e.source.postMessage(d,O);}
if(m.type==='hello')return reply({ok:true,result:{version:'1',origin:location.origin}});
if(m.type==='request')return rq(m.payload||{}).then(function(r){reply({ok:true,result:r});},function(err){reply({ok:false,error:String(err.message||err),code:'unreachable'});});
if(m.type==='probe')return reply({ok:true,result:[location.origin]});
if(m.type==='network')return reply({ok:true,result:{gateway:location.hostname}});
if(m.type==='reset')return reply({ok:true,result:null});
reply({ok:false,error:'Unknown request',code:'not-allowed'});
});
var bar=document.createElement('div');
bar.setAttribute('style','position:fixed;z-index:2147483647;left:50%;bottom:16px;transform:translateX(-50%);background:#1b1a17;color:#f7f6f2;font:500 14px/1.4 system-ui,-apple-system,Segoe UI,sans-serif;padding:10px 14px;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.25);display:flex;gap:10px;align-items:center;max-width:calc(100% - 32px)');
bar.innerHTML='<span style="width:8px;height:8px;border-radius:50%;background:#f2632a;flex:none"></span><span>RouterDeck is connected through this tab. Keep it open.</span>';
var a=document.createElement('button');a.textContent='Open RouterDeck';a.setAttribute('style','all:unset;cursor:pointer;background:#f7f6f2;color:#1b1a17;padding:6px 10px;border-radius:8px;font-weight:600;white-space:nowrap');a.onclick=open;bar.appendChild(a);
(document.body||document.documentElement).appendChild(bar);
window.__rdBridge={open:open};
open();
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
