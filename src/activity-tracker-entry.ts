import { api } from './auth';

type AuthMe={authenticated?:boolean;context?:{employee?:{id?:string}}};
let authenticated=false;
let lastSent='';
let lastSentAt=0;
async function refreshAuth(){try{const j=await api<AuthMe>('/api/auth/me');authenticated=Boolean(j.authenticated&&j.context?.employee?.id)}catch{authenticated=false}}
function safeText(el:Element){const raw=(el.getAttribute('aria-label')||el.getAttribute('title')||el.textContent||'').replace(/\s+/g,' ').trim();return raw.slice(0,120)}
function send(action:string,metadata:Record<string,unknown>){if(!authenticated)return;const signature=`${action}:${JSON.stringify(metadata)}`;const now=Date.now();if(signature===lastSent&&now-lastSentAt<1200)return;lastSent=signature;lastSentAt=now;void fetch('/api/activity/record',{method:'POST',credentials:'include',keepalive:true,headers:{'content-type':'application/json'},body:JSON.stringify({module:'portal',action,path:location.pathname,metadata})}).catch(()=>undefined)}
void refreshAuth();window.addEventListener('focus',refreshAuth);window.addEventListener('pageshow',()=>{void refreshAuth();send('page_view',{path:location.pathname})});
document.addEventListener('click',event=>{const target=(event.target as HTMLElement).closest('button,a,[role="button"]');if(!target)return;if(target.closest('.signin-page,.owner-change-card,.temporary-password-change-card'))return;send('click',{control:safeText(target),tag:target.tagName.toLowerCase(),id:(target as HTMLElement).id||undefined,className:(target as HTMLElement).className?.toString().slice(0,120)||undefined})},true);
document.addEventListener('submit',event=>{const form=event.target as HTMLFormElement;if(form.closest('.signin-page,.owner-change-card,.temporary-password-change-card'))return;send('form_submit',{form:form.getAttribute('aria-label')||form.id||form.className?.toString().slice(0,120)||'form'})},true);
window.addEventListener('online',()=>send('connection_online',{}));window.addEventListener('offline',()=>send('connection_offline',{}));
