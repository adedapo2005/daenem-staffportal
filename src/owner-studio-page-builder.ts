import './owner-studio-page-builder.css';

type BlockKind='heading'|'text'|'clock'|'weather'|'brand'|'auth';
type InnerItem={id:string;label:string;x:number;y:number};
type Block={id:string;kind:BlockKind;label:string;x:number;y:number;width:number;height:number;items?:InnerItem[]};
type Draft={name:string;blocks:Block[]};
const blank=():Draft=>({name:'New DAENEM Sign-In Design',blocks:[]});
const widgetItems=(kind:BlockKind):InnerItem[]=>(kind==='weather'?['Weather Icon','Temperature','Location','Forecast']:kind==='clock'?['Clock Face','Time','City Name','Timezone']:[]).map((label,i)=>({id:'item-'+i,label,x:12+(i%2)*85,y:12+Math.floor(i/2)*48}));
const catalogue:{kind:BlockKind;label:string;width:number;height:number}[]=[
 {kind:'brand',label:'DAENEM Branding',width:210,height:60},
 {kind:'heading',label:'Page Heading',width:330,height:65},
 {kind:'text',label:'Supporting Text',width:320,height:70},
 {kind:'clock',label:'Analog Clock',width:150,height:150},
 {kind:'weather',label:'Weather Widget',width:250,height:145},
 {kind:'auth',label:'Protected Sign-In',width:310,height:280}
];
const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||c));
export function mountSignInPageBuilder(studio:HTMLElement){
 if(studio.querySelector('.owner-builder'))return;
 const host=document.createElement('section');host.className='owner-builder';host.hidden=true;
 host.innerHTML='<header class="owner-builder-head"><div><small>ALTERNATE DESIGN WORKSPACE</small><h4>Create A New Sign-In Design</h4><p>Build a separate design without replacing the approved Sign-In. Drafts remain private until you explicitly save or submit them for review.</p></div><button type="button" data-builder-exit>Return To Approved Design</button></header>'+
 '<div class="owner-builder-toolbar"><label>Design Name <input data-builder-name maxlength="70" value="New DAENEM Sign-In Design"></label><label>Preview Size <select data-builder-device><option value="390">Mobile · 390px</option><option value="768">Tablet · 768px</option><option value="1366" selected>Laptop · 1366px</option><option value="1920">Desktop · 1920px</option><option value="3840">4K · 3840px</option></select></label><button type="button" data-builder-undo>Undo</button><button type="button" data-builder-redo>Redo</button><button type="button" data-builder-clear>Clear Canvas</button><button type="button" data-builder-starter>Start From Premium Layout</button><button type="button" data-builder-live-preview>Preview Designed Sign-In</button><button type="button" data-builder-auth-preview aria-expanded="false" aria-controls="owner-builder-protected-auth">Inspect Real Sign-In</button><button type="button" data-builder-save>Save Concept</button><button type="button" data-builder-cloud-save>Save Owner Library</button><button type="button" data-builder-cloud-load>Load Owner Library</button><span data-builder-cloud-status role="status" aria-live="polite"></span><select data-builder-library aria-label="Saved Session Designs"><option value="">Saved Concepts</option></select><button type="button" data-builder-load>Load Concept</button><button type="button" data-builder-duplicate>Duplicate</button><button type="button" data-builder-export>Export Design</button><label class="owner-builder-import">Import Design <input type="file" accept="application/json,.json" data-builder-import></label></div>'+
 '<div class="owner-builder-shell"><aside><h5>Add Components</h5>'+catalogue.map(c=>'<button type="button" data-builder-add="'+c.kind+'">+ '+esc(c.label)+'</button>').join('')+'<p>Authentication remains a protected component; visual edits cannot alter login security or providers.</p></aside><div class="owner-builder-stage"><div class="owner-builder-canvas" data-builder-canvas></div></div><aside><h5>Selected Component</h5><p data-builder-selection>No component selected</p><label>Display Text <input data-builder-text maxlength="100"></label><label>Horizontal Position <input data-builder-x type="number" min="0" max="3600"></label><label>Vertical Position <input data-builder-y type="number" min="0" max="2000"></label><label>Width <input data-builder-width type="number" min="80" max="900"></label><label>Height <input data-builder-height type="number" min="40" max="600"></label><button type="button" data-builder-remove>Remove Component</button><div class="owner-builder-inner"><h5>Widget Items</h5><label>Item <select data-builder-item><option value="">Select An Item</option></select></label><label>Label <input data-inner-label maxlength="60"></label><label>Move Item Horizontally <input data-inner-x type="number" min="0" max="800"></label><label>Move Item Vertically <input data-inner-y type="number" min="0" max="500"></label><button type="button" data-inner-add>Add Widget Item</button></div></aside></div>'+
 '<section class="owner-builder-live" data-builder-live-panel hidden><header><strong>Live Alternative Layout — Owner Preview Only</strong><button type="button" data-builder-live-close>Close Preview</button></header><div class="owner-builder-live-stage"><div data-builder-live-root></div></div></section>'+
 '<section id="owner-builder-protected-auth" class="owner-builder-protected-auth" hidden><header><strong>Protected V180 Authentication — Live Component Reference</strong><p>This separate reference contains the real Sign-In, Create Account, recovery and configured provider controls. Canvas authentication blocks are still placeholders, and inspecting this reference never publishes a design.</p></header><iframe title="Protected V180 authentication component reference" data-builder-auth-frame loading="lazy" referrerpolicy="same-origin"></iframe></section>'+
 '<p class="owner-builder-warning">This is a concept canvas, not a deployable Sign-In page. Concepts are private drafts. Owner Library saves and release-review requests are explicit, auditable actions; neither publishes a new Sign-In.</p>';
 studio.appendChild(host);
 let liveRoot:import('react-dom/client').Root|null=null;
 const livePanel=host.querySelector<HTMLElement>('[data-builder-live-panel]')!;
 host.querySelector<HTMLButtonElement>('[data-builder-live-preview]')!.addEventListener('click',async()=>{
  const [React,{createRoot},{AuthScreen}]=await Promise.all([import('react'),import('react-dom/client'),import('./auth')]);
  if(!liveRoot)liveRoot=createRoot(host.querySelector<HTMLElement>('[data-builder-live-root]')!);
  livePanel.hidden=false;
  liveRoot.render(React.createElement(AuthScreen,{onAuthenticated:()=>undefined,ownerConcept:JSON.parse(JSON.stringify(draft)) as Draft}));
 });
 host.querySelector<HTMLButtonElement>('[data-builder-live-close]')!.addEventListener('click',()=>{livePanel.hidden=true;liveRoot?.render(null);});
 const previewButton=host.querySelector<HTMLButtonElement>('[data-builder-auth-preview]')!;
 const previewPanel=host.querySelector<HTMLElement>('#owner-builder-protected-auth')!;
 const previewFrame=host.querySelector<HTMLIFrameElement>('[data-builder-auth-frame]')!;
 previewButton.addEventListener('click',()=>{
  const opening=previewPanel.hidden;
  previewPanel.hidden=!opening;
  previewButton.setAttribute('aria-expanded',String(opening));
  previewButton.textContent=opening?'Close Real Sign-In Reference':'Inspect Real Sign-In';
  if(opening&&!previewFrame.getAttribute('src'))previewFrame.src='/staff-portal-signin?studioReview=signin-v180';
 });
 const reviewPanel=document.createElement('section');reviewPanel.className='owner-builder-review';
 reviewPanel.innerHTML='<header><div><small>PROTECTED RELEASE PROCESS</small><h5>Design Readiness & Owner Review</h5><p>Verify a saved design before requesting authenticated release acceptance. This never replaces Approved V180.</p></div></header>'+
 '<div class="owner-builder-review-actions"><button type="button" data-builder-check>Check Saved Design</button><button type="button" data-builder-request disabled>Submit For Release Review</button><button type="button" data-builder-review-refresh>Review Status</button><button type="button" data-builder-review-withdraw>Withdraw Review</button></div>'+
 '<p data-builder-review-status role="status" aria-live="polite">No review requested. Approved V180 remains live.</p><div data-builder-review-report aria-live="polite"></div>'+
 '<p class="owner-builder-review-note">Structural checks do not establish functional authentication, accessibility or production readiness. Only the existing authenticated release gates can authorize an eventual activation.</p>';
 host.appendChild(reviewPanel);
 let draft=blank();let undo:Draft[]=[],redo:Draft[]=[],selected:string|null=null,selectedInner:string|null=null,serial=0;
 const library:Draft[]=[];
 const libraryKey='daenem-owner-studio-concept-library-v1';
 try{
  const stored=JSON.parse(sessionStorage.getItem(libraryKey)||'[]') as unknown;
  if(Array.isArray(stored)){
   for(const item of stored.slice(0,20)){
    if(item&&typeof item==='object'&&typeof item.name==='string'&&Array.isArray(item.blocks)&&item.blocks.length<=100){
     const valid=item.blocks.every((b:unknown)=>!!b&&typeof b==='object'&&typeof (b as Block).id==='string'&&typeof (b as Block).kind==='string'&&typeof (b as Block).label==='string'&&['x','y','width','height'].every(k=>Number.isFinite((b as unknown as Record<string,unknown>)[k] as number)));
     if(valid)library.push(item as Draft);
    }
   }
  }
 }catch{/* session data may be unavailable or malformed */}
 const persistLibrary=()=>{try{sessionStorage.setItem(libraryKey,JSON.stringify(library.slice(-20)));}catch{/* private browsing or quota restrictions */}};
 let cloudRevision:number|null=null;
 let syncedLibrarySignature:string|null=null;
 const cloudStatus=(message:string)=>{const el=host.querySelector<HTMLElement>('[data-builder-cloud-status]');if(el)el.textContent=message;};
 const libraryEndpoint='/api/theme/signin/designs';
 const loadCloud=async()=>{
  const response=await fetch(libraryEndpoint,{method:'GET',credentials:'same-origin',cache:'no-store'});
  const result=await response.json() as {revision?:number;designs?:Draft[];error?:string};
  if(!response.ok||!Array.isArray(result.designs)||typeof result.revision!=='number')throw Error(result.error||'Owner library could not be loaded.');
  cloudRevision=result.revision;syncedLibrarySignature=JSON.stringify(result.designs);return result.designs;
 };

 let drag:{id:string;x:number;y:number;startX:number;startY:number;zoom:number;innerId?:string}|null=null;
 const $=<T>(s:string)=>host.querySelector(s) as unknown as T;
 let reviewEligible:{index:number;revision:number}|null=null;
 const setReviewStatus=(message:string)=>{const el=$<HTMLElement>('[data-builder-review-status]');el.textContent=message;};
 const invalidateReadiness=()=>{
  reviewEligible=null;$<HTMLButtonElement>('[data-builder-request]').disabled=true;
 };
 const selectedSavedDesign=()=>{
  const value=$<HTMLSelectElement>('[data-builder-library]').value;
  if(value===''||!Number.isInteger(Number(value))||!library[Number(value)])throw Error('Select a saved concept in the design library first.');
  if(cloudRevision===null)throw Error('Load Owner Library and save your concept before release review.');
  if(syncedLibrarySignature!==JSON.stringify(library))throw Error('Save your current Owner Library changes before checking release readiness.');
  return {index:Number(value),revision:cloudRevision};
 };
 const requestReview=async(url:string,method:string,body?:Record<string,unknown>)=>{
  const response=await fetch(url,{method,credentials:'same-origin',cache:'no-store',
   headers:body?{'content-type':'application/json'}:undefined,
   body:body?JSON.stringify(body):undefined});
  const result=await response.json() as Record<string,unknown>;
  if(!response.ok)throw Error(String(result.error||'Review request failed.'));
  return result;
 };
 const renderReadiness=(report:Record<string,unknown>)=>{
  const container=$<HTMLElement>('[data-builder-review-report]');
  const blockers=Array.isArray(report.blockers)?report.blockers.map(String):[];
  const checks=Array.isArray(report.checks)?report.checks as Array<{name:string;passed:boolean;detail:string}>:[];
  const pending=Array.isArray(report.pendingAcceptance)?report.pendingAcceptance.map(String):[];
  container.replaceChildren();
  const heading=document.createElement('strong');heading.textContent=Boolean(report.structuralPass)?
   'Structure Passed — Manual Acceptance Still Required':'Corrections Needed Before Release Review';
  container.appendChild(heading);
  const list=document.createElement('ul');
  for(const check of checks){
   const line=document.createElement('li');line.textContent=(check.passed?'Pass: ':'Review: ')+check.name+' — '+check.detail;
   line.className=check.passed?'is-passed':'is-blocked';list.appendChild(line);
  }
  container.appendChild(list);
  if(blockers.length){const note=document.createElement('p');note.textContent=blockers.length+' structural blockers must be corrected.';container.appendChild(note);}
  if(pending.length){
   const manual=document.createElement('p');manual.textContent='Not yet verified: '+pending.join(' • ');container.appendChild(manual);
  }
 };
 const clone=()=>JSON.parse(JSON.stringify(draft)) as Draft;
 const record=()=>{undo.push(clone());if(undo.length>60)undo.shift();redo=[];};
 const width=()=>Number($<HTMLSelectElement>('[data-builder-device]').value);
 const deviceScale=()=>Math.max(1,width()/1366);
 const draw=()=>{
  const canvas=$<HTMLElement>('[data-builder-canvas]');canvas.style.width=width()+'px';canvas.style.height=(width()<=430?850:width()<=768?1024:width()>=3840?2160:900)+'px';
  const stage=$<HTMLElement>('.owner-builder-stage');const zoom=Math.min(1,(stage.clientWidth-32)/width());canvas.style.zoom=String(Math.max(.2,zoom));const sf=deviceScale();
  canvas.innerHTML=draft.blocks.map(b=>'<button type="button" class="owner-builder-block'+(selected===b.id?' is-selected':'')+'" data-block="'+b.id+'" style="left:'+Math.round(b.x*sf)+'px;top:'+Math.round(b.y*sf)+'px;width:'+Math.round(b.width*sf)+'px;height:'+Math.round(b.height*sf)+'px;font-size:'+Math.round(15*sf)+'px">'+
    (b.kind==='auth'?'<strong>Sign In</strong><span>Email Address</span><span>Password</span><em>Continue Securely</em>':b.items?.length?b.items.map(item=>'<span class="owner-builder-inner-item" data-inner-id="'+esc(item.id)+'" style="left:'+Math.round(item.x*sf)+'px;top:'+Math.round(item.y*sf)+'px;font-size:'+Math.round(12*sf)+'px!important">'+esc(item.label)+'</span>').join(''):esc(b.label))+'</button>').join('');
  const b=draft.blocks.find(b=>b.id===selected);$<HTMLElement>('[data-builder-selection]').textContent=b?b.kind.toUpperCase()+' · '+b.id:'No component selected';
  for(const k of ['x','y','width','height'] as const){$<HTMLInputElement>('[data-builder-'+k+']').value=b?String(b[k]):'';}
  $<HTMLInputElement>('[data-builder-text]').value=b?.label||'';
  const items=b?.items||[];const innerSelect=$<HTMLSelectElement>('[data-builder-item]');
  innerSelect.replaceChildren(new Option('Select An Item',''),...items.map(item=>new Option(item.label,item.id)));
  if(!items.some(item=>item.id===selectedInner))selectedInner=null;
  innerSelect.value=selectedInner||'';const item=items.find(item=>item.id===selectedInner);
  $<HTMLInputElement>('[data-inner-label]').value=item?.label||'';
  $<HTMLInputElement>('[data-inner-x]').value=item?String(item.x):'';
  $<HTMLInputElement>('[data-inner-y]').value=item?String(item.y):'';
  $<HTMLButtonElement>('[data-builder-undo]').disabled=!undo.length;$<HTMLButtonElement>('[data-builder-redo]').disabled=!redo.length;
 };
 const switchMode=(on:boolean)=>{host.hidden=!on;studio.classList.toggle('owner-builder-active',on);draw();};
 const modeButton=document.createElement('button');modeButton.type='button';modeButton.textContent='Create New Sign-In Design';modeButton.dataset.builderEnter='';
 studio.querySelector('.owner-pro-nav')?.appendChild(modeButton);
 modeButton.addEventListener('click',()=>switchMode(true));$<HTMLButtonElement>('[data-builder-exit]').addEventListener('click',()=>switchMode(false));
 for(const c of catalogue){$<HTMLButtonElement>('[data-builder-add="'+c.kind+'"]').addEventListener('click',()=>{record();const id='b'+(++serial);draft.blocks.push({id,kind:c.kind,label:c.label,x:30+(draft.blocks.length%5)*42,y:25+(draft.blocks.length%5)*70,width:c.width,height:c.height,items:widgetItems(c.kind)});selected=id;draw();});}
 $<HTMLElement>('[data-builder-canvas]').addEventListener('click',e=>{const target=e.target as HTMLElement;const btn=target.closest<HTMLElement>('[data-block]');if(!btn)return;selected=btn.dataset.block||null;selectedInner=target.closest<HTMLElement>('[data-inner-id]')?.dataset.innerId||null;draw();});
 const canvas=$<HTMLElement>('[data-builder-canvas]');
 canvas.addEventListener('pointerdown',e=>{
  const node=(e.target as HTMLElement).closest<HTMLElement>('[data-block]');
  if(!node||e.button!==0)return;
  const block=draft.blocks.find(b=>b.id===node.dataset.block);if(!block)return;
  selected=block.id;const inner=(e.target as HTMLElement).closest<HTMLElement>('[data-inner-id]');
  const item=block.items?.find(v=>v.id===inner?.dataset.innerId);
  selectedInner=item?.id||null;record();
  drag={id:block.id,x:e.clientX,y:e.clientY,startX:item?.x??block.x,startY:item?.y??block.y,zoom:(Number(canvas.style.zoom)||1)*deviceScale(),innerId:item?.id};
  node.setPointerCapture(e.pointerId);e.preventDefault();
 });
 canvas.addEventListener('pointermove',e=>{
  if(!drag)return;
  const block=draft.blocks.find(b=>b.id===drag!.id);if(!block)return;
  const item=block.items?.find(i=>i.id===drag!.innerId);
  const target=item||block;
  target.x=Math.max(0,Math.min(item?800:3600,Math.round(drag.startX+(e.clientX-drag.x)/drag.zoom)));
  target.y=Math.max(0,Math.min(item?500:2000,Math.round(drag.startY+(e.clientY-drag.y)/drag.zoom)));
  const node=Array.from(canvas.querySelectorAll<HTMLElement>('[data-block]')).find(el=>el.dataset.block===block.id);
  const child=item?Array.from(node?.querySelectorAll<HTMLElement>('[data-inner-id]')||[]).find(el=>el.dataset.innerId===item.id):node;
  if(child){child.style.left=Math.round(target.x*deviceScale())+'px';child.style.top=Math.round(target.y*deviceScale())+'px';}
 });
 canvas.addEventListener('pointerup',()=>{if(!drag)return;drag=null;draw();});
 canvas.addEventListener('pointercancel',()=>{if(!drag)return;drag=null;draw();});
 for(const k of ['x','y','width','height'] as const){$<HTMLInputElement>('[data-builder-'+k+']').addEventListener('change',e=>{const b=draft.blocks.find(b=>b.id===selected);if(!b)return;record();b[k]=Math.max(0,Math.min(k==='x'?3600:k==='y'?2000:k==='width'?900:600,Number((e.target as HTMLInputElement).value)||0));draw();});}
 $<HTMLInputElement>('[data-builder-text]').addEventListener('change',e=>{const b=draft.blocks.find(b=>b.id===selected);if(!b||b.kind==='auth')return;record();b.label=(e.target as HTMLInputElement).value.slice(0,100);draw();});
 const selectedItem=()=>draft.blocks.find(b=>b.id===selected)?.items?.find(i=>i.id===selectedInner);
 $<HTMLSelectElement>('[data-builder-item]').addEventListener('change',e=>{selectedInner=(e.target as HTMLSelectElement).value||null;draw();});
 $<HTMLInputElement>('[data-inner-label]').addEventListener('change',e=>{const item=selectedItem();if(!item)return;const value=(e.target as HTMLInputElement).value.slice(0,60);if(item.label===value)return;record();item.label=value;draw();});
 for(const axis of ['x','y'] as const)$<HTMLInputElement>('[data-inner-'+axis+']').addEventListener('change',e=>{
  const item=selectedItem();if(!item)return;
  const value=Math.max(0,Math.min(axis==='x'?800:500,Number((e.target as HTMLInputElement).value)||0));if(item[axis]===value)return;record();item[axis]=value;draw();
 });
 $<HTMLButtonElement>('[data-inner-add]').addEventListener('click',()=>{
  const b=draft.blocks.find(b=>b.id===selected);
  if(!b||b.kind==='auth'||!['clock','weather'].includes(b.kind)||(b.items||[]).length>=12)return;
  record();b.items=b.items||[];const id='custom-'+(++serial);
  b.items.push({id,label:'New Widget Item',x:16,y:16});selectedInner=id;draw();
 });
 $<HTMLButtonElement>('[data-builder-remove]').addEventListener('click',()=>{if(!selected)return;record();draft.blocks=draft.blocks.filter(b=>b.id!==selected);selected=null;draw();});
 $<HTMLButtonElement>('[data-builder-clear]').addEventListener('click',()=>{record();draft=blank();selected=null;draw();});
 $<HTMLButtonElement>('[data-builder-starter]').addEventListener('click',()=>{
  record();const prefix='starter-'+(++serial)+'-';
  draft={name:'DAENEM Executive Emerald Concept',blocks:[
   {id:prefix+'brand',kind:'brand',label:'DAENEM Branding',x:20,y:20,width:210,height:60,items:[]},
   {id:prefix+'heading',kind:'heading',label:'One Secure Workspace. Live On Every Device.',x:20,y:100,width:330,height:65,items:[]},
   {id:prefix+'auth',kind:'auth',label:'Protected Sign-In',x:20,y:190,width:310,height:290,items:[]},
  ]};
  $<HTMLInputElement>('[data-builder-name]').value=draft.name;
  selected=null;selectedInner=null;draw();invalidateReadiness();
 });
 $<HTMLButtonElement>('[data-builder-undo]').addEventListener('click',()=>{if(!undo.length)return;redo.push(clone());draft=undo.pop()!;selected=null;draw();});
 $<HTMLButtonElement>('[data-builder-redo]').addEventListener('click',()=>{if(!redo.length)return;undo.push(clone());draft=redo.pop()!;selected=null;draw();});
 const refreshLibrary=()=>{
  const select=$<HTMLSelectElement>('[data-builder-library]');
  select.replaceChildren(new Option('Saved Concepts',''),...library.map((design,i)=>new Option(design.name+' ('+design.blocks.length+' items)',String(i))));
 };
 $<HTMLButtonElement>('[data-builder-save]').addEventListener('click',()=>{
  draft.name=$<HTMLInputElement>('[data-builder-name]').value.trim().slice(0,70)||'Untitled Design';
  if(library.length>=20){cloudStatus('Design library is full. Export a design before saving another.');return;}
  library.push(clone());persistLibrary();refreshLibrary();invalidateReadiness();$<HTMLSelectElement>('[data-builder-library]').value=String(library.length-1);
 });
 $<HTMLButtonElement>('[data-builder-cloud-load]').addEventListener('click',async()=>{
  try{
   const remote=await loadCloud();
   const unsynced=library.filter(local=>!remote.some(stored=>JSON.stringify(stored)===JSON.stringify(local)));
   if(remote.length+unsynced.length>20)throw Error('Your saved concepts exceed the 20-design limit. Export them before loading the Owner Library.');
   library.splice(0,library.length,...remote,...unsynced);persistLibrary();refreshLibrary();invalidateReadiness();
   cloudStatus('Owner Library loaded · '+remote.length+' remote designs, '+unsynced.length+' local concepts retained');
  }catch(error){cloudStatus(error instanceof Error?error.message:'Owner Library load failed');}
 });
 $<HTMLButtonElement>('[data-builder-cloud-save]').addEventListener('click',async()=>{
  try{
   if(cloudRevision===null)throw Error('Load Owner Library before saving to prevent overwriting existing designs.');
   const response=await fetch(libraryEndpoint,{method:'POST',credentials:'same-origin',
    headers:{'content-type':'application/json'},body:JSON.stringify({revision:cloudRevision,designs:library})});
   const result=await response.json() as {revision?:number;error?:string};
   if(!response.ok||typeof result.revision!=='number')throw Error(result.error||'Owner Library save failed');
   cloudRevision=result.revision;syncedLibrarySignature=JSON.stringify(library);invalidateReadiness();cloudStatus('Owner Library saved · revision '+result.revision);
  }catch(error){cloudStatus(error instanceof Error?error.message:'Owner Library save failed');}
 });
 $<HTMLButtonElement>('[data-builder-load]').addEventListener('click',()=>{
  const index=Number($<HTMLSelectElement>('[data-builder-library]').value);
  if($<HTMLSelectElement>('[data-builder-library]').value===''||!library[index])return;
  record();draft=JSON.parse(JSON.stringify(library[index])) as Draft;selected=null;$<HTMLInputElement>('[data-builder-name]').value=draft.name;draw();
 });
 $<HTMLButtonElement>('[data-builder-duplicate]').addEventListener('click',()=>{
  record();draft=clone();draft.name=(draft.name+' Copy').slice(0,70);$<HTMLInputElement>('[data-builder-name]').value=draft.name;selected=null;draw();
 });
 refreshLibrary();
 const validateImported=(value:unknown):Draft|null=>{
  if(!value||typeof value!=='object')return null;
  const entry=value as Record<string,unknown>;
  if(typeof entry.name!=='string'||entry.name.length>70||!Array.isArray(entry.blocks)||entry.blocks.length>100)return null;
  const blocks:Block[]=[];
  for(const raw of entry.blocks){
   if(!raw||typeof raw!=='object')return null;
   const r=raw as Record<string,unknown>;
   if(typeof r.id!=='string'||r.id.length>80||typeof r.kind!=='string'||!catalogue.some(c=>c.kind===r.kind)||typeof r.label!=='string'||r.label.length>100)return null;
   const coords=['x','y','width','height'] as const;
   if(!coords.every(key=>typeof r[key]==='number'&&Number.isFinite(r[key])&&r[key]>=0&&r[key]<=4000))return null;
   const items:InnerItem[]=[];
   if(r.items!==undefined){
    if(!Array.isArray(r.items)||r.items.length>12||r.kind==='auth')return null;
    for(const item of r.items){
     if(!item||typeof item!=='object')return null;
     const v=item as Record<string,unknown>;
     if(typeof v.id!=='string'||v.id.length>80||typeof v.label!=='string'||v.label.length>60||typeof v.x!=='number'||!Number.isFinite(v.x)||v.x<0||v.x>800||typeof v.y!=='number'||!Number.isFinite(v.y)||v.y<0||v.y>500)return null;
     items.push({id:v.id,label:v.label,x:v.x,y:v.y});
    }
   }
   blocks.push({id:r.id,kind:r.kind as BlockKind,label:r.label,x:r.x as number,y:r.y as number,width:r.width as number,height:r.height as number,items});
  }
  return {name:entry.name,blocks};
 };
 $<HTMLButtonElement>('[data-builder-export]').addEventListener('click',()=>{
  const data=new Blob([JSON.stringify({schemaVersion:1,...clone()},null,2)],{type:'application/json'});
  const url=URL.createObjectURL(data);const link=document.createElement('a');
  link.href=url;link.download='daenem-signin-design.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 });
 $<HTMLInputElement>('[data-builder-import]').addEventListener('change',async event=>{
  const input=event.target as HTMLInputElement;const file=input.files?.[0];input.value='';
  if(!file||file.size>200000)return;
  try{
   const result=validateImported(JSON.parse(await file.text()));
   if(!result)return;
   record();draft=result;selected=null;selectedInner=null;
   serial=Math.max(serial,result.blocks.length+20);
   $<HTMLInputElement>('[data-builder-name]').value=draft.name;draw();
  }catch{/* malformed imported concepts are ignored */}
 });
 $<HTMLSelectElement>('[data-builder-library]').addEventListener('change',invalidateReadiness);
 $<HTMLButtonElement>('[data-builder-check]').addEventListener('click',async()=>{
  invalidateReadiness();
  try{
   const saved=selectedSavedDesign();
   const report=await requestReview(libraryEndpoint+'/readiness','POST',{
    libraryRevision:saved.revision,designIndex:saved.index,
   });
   renderReadiness(report);
   if(report.structuralPass){
    reviewEligible=saved;$<HTMLButtonElement>('[data-builder-request]').disabled=false;
    setReviewStatus('Structural checks passed. Authenticated, visual and release acceptance remain outstanding.');
   }else setReviewStatus('Design requires structural corrections; it cannot be submitted for review yet.');
  }catch(error){setReviewStatus(error instanceof Error?error.message:'Readiness check failed.');}
 });
 $<HTMLButtonElement>('[data-builder-review-refresh]').addEventListener('click',async()=>{
  try{
   const current=await requestReview(libraryEndpoint+'/review','GET');
   const candidate=current.candidate as {designName?:string;status?:string}|null;
   setReviewStatus(candidate
    ?'Review candidate: '+String(candidate.designName||'Untitled')+
      ' · '+(current.stale?'Source designs changed; resubmit after checking readiness.':
      'Awaiting authenticated acceptance. Approved V180 remains live.')
    :'No pending review. Approved V180 remains live.');
  }catch(error){setReviewStatus(error instanceof Error?error.message:'Review status unavailable.');}
 });
 $<HTMLButtonElement>('[data-builder-request]').addEventListener('click',async()=>{
  try{
   const saved=selectedSavedDesign();
   if(!reviewEligible||saved.index!==reviewEligible.index||saved.revision!==reviewEligible.revision){
    throw Error('Run the release readiness check again for the selected saved concept.');
   }
   const current=await requestReview(libraryEndpoint+'/review','GET');
   const result=await requestReview(libraryEndpoint+'/review','POST',{
    reviewRevision:current.revision,libraryRevision:saved.revision,designIndex:saved.index,
   });
   invalidateReadiness();
   const candidate=result.candidate as {designName?:string}|null;
   setReviewStatus('Owner review requested for '+String(candidate?.designName||'the selected design')+
    '. Authentication and visual acceptance are still mandatory. Approved V180 remains live.');
  }catch(error){invalidateReadiness();setReviewStatus(error instanceof Error?error.message:'Could not submit review.');}
 });
 $<HTMLButtonElement>('[data-builder-review-withdraw]').addEventListener('click',async()=>{
  try{
   const current=await requestReview(libraryEndpoint+'/review','GET');
   if(!current.candidate){setReviewStatus('No pending review to withdraw. Approved V180 remains live.');return;}
   await requestReview(libraryEndpoint+'/review','DELETE',{reviewRevision:current.revision});
   invalidateReadiness();
   setReviewStatus('Pending review withdrawn. No public Sign-In change occurred.');
  }catch(error){setReviewStatus(error instanceof Error?error.message:'Could not withdraw review.');}
 });
 $<HTMLSelectElement>('[data-builder-device]').addEventListener('change',draw);
 $<HTMLInputElement>('[data-builder-name]').addEventListener('change',e=>{record();draft.name=(e.target as HTMLInputElement).value.slice(0,70);});
 draw();
}
