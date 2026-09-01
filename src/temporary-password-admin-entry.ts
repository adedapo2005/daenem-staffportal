import './temporary-password-admin.css';

type Context = { permissions?: Record<string,string> };
type Employee = { id:string;displayName:string;email?:string;jobTitle?:string;department?:string;status:string;hasLoginAccess?:number;pendingUsername?:string };
type TempRow = { id:string;employeeId:string;displayName:string;email?:string;username:string;deliveryMethod:string;deliveryStatus:string;issuedAt:string;expiresAt:string;firstUsedAt?:string };
type IssueResult = { ok?:boolean;displayName?:string;username?:string;temporaryPassword?:string;expiresAt?:string;delivered?:boolean;message?:string;error?:string;reference?:string };

const ROOT_ID='daenem-temp-password-admin-root';
const rank:Record<string,number>={none:0,view:1,create:2,edit:3,approve:4,manage:5};
let context:Context|null=null;
let employees:Employee[]=[];
let active:TempRow[]=[];
let latest:IssueResult|null=null;

async function api<T>(path:string,options:RequestInit={}):Promise<T>{const headers=new Headers(options.headers);if(options.body&&!headers.has('content-type'))headers.set('content-type','application/json');const response=await fetch(path,{...options,headers,credentials:'include',cache:'no-store'});const data=await response.json().catch(()=>({})) as any;if(!response.ok)throw new Error(`${data.error||`Request failed (${response.status})`}${data.reference?` Reference: ${data.reference}`:''}`);return data as T}
function canManage(){return rank[String(context?.permissions?.['users.access']||'none')]>=rank.manage}
function escapeHtml(v:string){return v.replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]||c))}
function fmt(v?:string){if(!v)return'';try{return new Intl.DateTimeFormat('en-NG',{dateStyle:'medium',timeStyle:'short',timeZone:'Africa/Lagos'}).format(new Date(v))+' WAT'}catch{return v}}

function ensureRoot(){let root=document.getElementById(ROOT_ID);if(root)return root;root=document.createElement('div');root.id=ROOT_ID;document.body.appendChild(root);return root}
function close(){const root=ensureRoot();root.innerHTML='';latest=null}

async function load(){const [people,temps]=await Promise.all([api<{employees:Employee[]}>('/api/admin/profile-completion'),api<{temporaryPasswords:TempRow[]}>('/api/admin/login-access/temporary-password')]);employees=people.employees||[];active=temps.temporaryPasswords||[]}

function render(search=''){
 const root=ensureRoot();const q=search.trim().toLowerCase();const visible=employees.filter(e=>!q||`${e.displayName} ${e.email||''} ${e.jobTitle||''} ${e.department||''}`.toLowerCase().includes(q));
 root.innerHTML=`<div class="tpa-backdrop" data-close></div><section class="tpa-modal" role="dialog" aria-modal="true"><header><div><small>OWNER / ADMIN · ACCOUNT RECOVERY</small><h2>Temporary Password Center</h2><p>Issue a one-time password when an employee cannot use normal Forgot Password recovery.</p></div><button class="tpa-close" data-close>×</button></header>
 <div class="tpa-toolbar"><input id="tpa-search" placeholder="Search employee, email, department…" value="${escapeHtml(search)}"><button id="tpa-refresh">Refresh</button></div>
 ${latest?.temporaryPassword?`<div class="tpa-issued"><div><small>SHOW ONCE · COPY NOW</small><strong>${escapeHtml(latest.displayName||'Employee')}</strong><span>Username: <b>${escapeHtml(latest.username||'')}</b></span><span>Expires: ${escapeHtml(fmt(latest.expiresAt))}</span></div><div class="tpa-secret"><code>${escapeHtml(latest.temporaryPassword)}</code><button id="tpa-copy">Copy password</button></div><p>${escapeHtml(latest.message||'Temporary password created.')}</p></div>`:''}
 <div class="tpa-list">${visible.map(e=>{const t=active.find(x=>x.employeeId===e.id);return`<article data-employee="${escapeHtml(e.id)}"><div class="tpa-person"><span>${escapeHtml(e.displayName.split(/\s+/).map(x=>x[0]).slice(0,2).join(''))}</span><div><strong>${escapeHtml(e.displayName)}</strong><small>${escapeHtml(e.email||'No email')} · ${escapeHtml(e.jobTitle||e.department||e.status)}</small></div></div><div class="tpa-state">${t?`<b>Temporary access active</b><small>${escapeHtml(t.username)} · expires ${escapeHtml(fmt(t.expiresAt))}${t.firstUsedAt?' · used':''}</small>`:`<b>${e.hasLoginAccess?'Login active':'No password login yet'}</b><small>${escapeHtml(e.pendingUsername||'')}</small>`}</div><div class="tpa-actions"><button data-issue="manual">Generate only</button><button class="primary" data-issue="email" ${e.email?'':'disabled'}>Generate & email</button>${t?'<button class="danger" data-revoke>Revoke</button>':''}</div></article>`}).join('')}</div></section>`;
 root.querySelectorAll('[data-close]').forEach(x=>x.addEventListener('click',close));
 const searchInput=root.querySelector<HTMLInputElement>('#tpa-search');searchInput?.addEventListener('input',()=>render(searchInput.value));
 root.querySelector('#tpa-refresh')?.addEventListener('click',async()=>{await load();render(search)});
 root.querySelector('#tpa-copy')?.addEventListener('click',async()=>{if(latest?.temporaryPassword){await navigator.clipboard.writeText(latest.temporaryPassword);const b=root.querySelector<HTMLButtonElement>('#tpa-copy');if(b)b.textContent='Copied';}});
 root.querySelectorAll<HTMLElement>('article[data-employee]').forEach(article=>{
   const employeeId=article.dataset.employee||'';
   article.querySelectorAll<HTMLButtonElement>('[data-issue]').forEach(button=>button.addEventListener('click',async()=>{
     if(button.disabled)return;button.disabled=true;const sendEmail=button.dataset.issue==='email';
     try{latest=await api<IssueResult>('/api/admin/login-access/temporary-password',{method:'POST',body:JSON.stringify({employeeId,sendEmail,reason:'Password recovery assistance'})});await load();render(search)}catch(error){alert(error instanceof Error?error.message:'Temporary password could not be created.');button.disabled=false}
   }));
   article.querySelector<HTMLButtonElement>('[data-revoke]')?.addEventListener('click',async()=>{try{await api('/api/admin/login-access/temporary-password/revoke',{method:'POST',body:JSON.stringify({employeeId})});await load();render(search)}catch(error){alert(error instanceof Error?error.message:'Temporary password could not be revoked.')}});
 });
}

async function open(){try{await load();render()}catch(error){alert(error instanceof Error?error.message:'Account recovery tools could not be opened.')}}

window.addEventListener('daenem:open-temporary-password',()=>void open());

async function boot(){try{const me=await api<{authenticated:boolean;context?:Context}>('/api/auth/me');context=me.context||null;if(!me.authenticated||!canManage())return;const button=document.createElement('button');button.className='tpa-launch';button.innerHTML='<span>🔑</span><b>Password Recovery</b>';button.title='Issue or revoke temporary employee passwords';button.addEventListener('click',()=>void open());document.body.appendChild(button)}catch{/* signed out */}}
if(document.readyState==='loading')window.addEventListener('load',()=>void boot(),{once:true});else void boot();
