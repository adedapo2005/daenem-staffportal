import './owner-studio-page-builder.css';

type BlockKind='heading'|'text'|'clock'|'weather'|'brand'|'auth';
type Block={id:string;kind:BlockKind;label:string;x:number;y:number;width:number;height:number};
type Draft={name:string;blocks:Block[]};
const blank=():Draft=>({name:'New DAENEM Sign-In Design',blocks:[]});
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
 host.innerHTML='<header class="owner-builder-head"><div><small>ALTERNATE DESIGN WORKSPACE</small><h4>Create A New Sign-In Design</h4><p>Build a separate design without replacing the approved Sign-In. This is a local, unsaved preview only.</p></div><button type="button" data-builder-exit>Return To Approved Design</button></header>'+
 '<div class="owner-builder-toolbar"><label>Design Name <input data-builder-name maxlength="70" value="New DAENEM Sign-In Design"></label><label>Preview Size <select data-builder-device><option value="390">Mobile · 390px</option><option value="768">Tablet · 768px</option><option value="1366" selected>Laptop · 1366px</option><option value="1920">Desktop · 1920px</option><option value="3840">4K · 3840px</option></select></label><button type="button" data-builder-undo>Undo</button><button type="button" data-builder-redo>Redo</button><button type="button" data-builder-clear>Clear Canvas</button><button type="button" data-builder-save>Save Concept</button><select data-builder-library aria-label="Saved Session Designs"><option value="">Saved Concepts</option></select><button type="button" data-builder-load>Load Concept</button><button type="button" data-builder-duplicate>Duplicate</button></div>'+
 '<div class="owner-builder-shell"><aside><h5>Add Components</h5>'+catalogue.map(c=>'<button type="button" data-builder-add="'+c.kind+'">+ '+esc(c.label)+'</button>').join('')+'<p>Authentication remains a protected component; visual edits cannot alter login security or providers.</p></aside><div class="owner-builder-stage"><div class="owner-builder-canvas" data-builder-canvas></div></div><aside><h5>Selected Component</h5><p data-builder-selection>No component selected</p><label>Display Text <input data-builder-text maxlength="100"></label><label>Horizontal Position <input data-builder-x type="number" min="0" max="3600"></label><label>Vertical Position <input data-builder-y type="number" min="0" max="2000"></label><label>Width <input data-builder-width type="number" min="80" max="900"></label><label>Height <input data-builder-height type="number" min="40" max="600"></label><button type="button" data-builder-remove>Remove Component</button></aside></div>'+
 '<p class="owner-builder-warning">This is a visual concept canvas, not a deployable Sign-In page. Publishing, provider connections, and persistence require separate verified implementation and Owner approval.</p>';
 studio.appendChild(host);
 let draft=blank();let undo:Draft[]=[],redo:Draft[]=[],selected:string|null=null,serial=0;
 const library:Draft[]=[];
 let drag:{id:string;x:number;y:number;startX:number;startY:number;zoom:number}|null=null;
 const $=<T>(s:string)=>host.querySelector(s) as unknown as T;
 const clone=()=>JSON.parse(JSON.stringify(draft)) as Draft;
 const record=()=>{undo.push(clone());if(undo.length>60)undo.shift();redo=[];};
 const width=()=>Number($<HTMLSelectElement>('[data-builder-device]').value);
 const draw=()=>{
  const canvas=$<HTMLElement>('[data-builder-canvas]');canvas.style.width=width()+'px';canvas.style.height=(width()<=430?850:width()<=768?1024:width()>=3840?2160:900)+'px';
  const stage=$<HTMLElement>('.owner-builder-stage');const zoom=Math.min(1,(stage.clientWidth-32)/width());canvas.style.zoom=String(Math.max(.2,zoom));
  canvas.innerHTML=draft.blocks.map(b=>'<button type="button" class="owner-builder-block'+(selected===b.id?' is-selected':'')+'" data-block="'+b.id+'" style="left:'+b.x+'px;top:'+b.y+'px;width:'+b.width+'px;height:'+b.height+'px">'+
    (b.kind==='clock'?'<span class="owner-builder-dial">◷</span>':b.kind==='auth'?'<strong>Sign In</strong><span>Email Address</span><span>Password</span><em>Continue Securely</em>':b.kind==='weather'?'<strong>Weather</strong><span>Live provider preview unavailable</span>':esc(b.label))+'</button>').join('');
  const b=draft.blocks.find(b=>b.id===selected);$<HTMLElement>('[data-builder-selection]').textContent=b?b.kind.toUpperCase()+' · '+b.id:'No component selected';
  for(const k of ['x','y','width','height'] as const){$<HTMLInputElement>('[data-builder-'+k+']').value=b?String(b[k]):'';}
  $<HTMLInputElement>('[data-builder-text]').value=b?.label||'';
  $<HTMLButtonElement>('[data-builder-undo]').disabled=!undo.length;$<HTMLButtonElement>('[data-builder-redo]').disabled=!redo.length;
 };
 const switchMode=(on:boolean)=>{host.hidden=!on;studio.classList.toggle('owner-builder-active',on);draw();};
 const modeButton=document.createElement('button');modeButton.type='button';modeButton.textContent='Create New Sign-In Design';modeButton.dataset.builderEnter='';
 studio.querySelector('.owner-pro-nav')?.appendChild(modeButton);
 modeButton.addEventListener('click',()=>switchMode(true));$<HTMLButtonElement>('[data-builder-exit]').addEventListener('click',()=>switchMode(false));
 for(const c of catalogue){$<HTMLButtonElement>('[data-builder-add="'+c.kind+'"]').addEventListener('click',()=>{record();const id='b'+(++serial);draft.blocks.push({id,kind:c.kind,label:c.label,x:30+(draft.blocks.length%5)*42,y:25+(draft.blocks.length%5)*70,width:c.width,height:c.height});selected=id;draw();});}
 $<HTMLElement>('[data-builder-canvas]').addEventListener('click',e=>{const btn=(e.target as HTMLElement).closest<HTMLElement>('[data-block]');if(!btn)return;selected=btn.dataset.block||null;draw();});
 const canvas=$<HTMLElement>('[data-builder-canvas]');
 canvas.addEventListener('pointerdown',e=>{
  const node=(e.target as HTMLElement).closest<HTMLElement>('[data-block]');
  if(!node||e.button!==0)return;
  const block=draft.blocks.find(b=>b.id===node.dataset.block);if(!block)return;
  selected=block.id;record();
  drag={id:block.id,x:e.clientX,y:e.clientY,startX:block.x,startY:block.y,zoom:Number(canvas.style.zoom)||1};
  node.setPointerCapture(e.pointerId);e.preventDefault();
 });
 canvas.addEventListener('pointermove',e=>{
  if(!drag)return;
  const block=draft.blocks.find(b=>b.id===drag!.id);if(!block)return;
  block.x=Math.max(0,Math.min(3600,Math.round(drag.startX+(e.clientX-drag.x)/drag.zoom)));
  block.y=Math.max(0,Math.min(2000,Math.round(drag.startY+(e.clientY-drag.y)/drag.zoom)));
  const node=canvas.querySelector<HTMLElement>('[data-block="'+block.id+'"]');
  if(node){node.style.left=block.x+'px';node.style.top=block.y+'px';}
 });
 canvas.addEventListener('pointerup',()=>{if(!drag)return;drag=null;draw();});
 canvas.addEventListener('pointercancel',()=>{if(!drag)return;drag=null;draw();});
 for(const k of ['x','y','width','height'] as const){$<HTMLInputElement>('[data-builder-'+k+']').addEventListener('change',e=>{const b=draft.blocks.find(b=>b.id===selected);if(!b)return;record();b[k]=Math.max(0,Math.min(k==='x'?3600:k==='y'?2000:k==='width'?900:600,Number((e.target as HTMLInputElement).value)||0));draw();});}
 $<HTMLInputElement>('[data-builder-text]').addEventListener('change',e=>{const b=draft.blocks.find(b=>b.id===selected);if(!b||b.kind==='auth')return;record();b.label=(e.target as HTMLInputElement).value.slice(0,100);draw();});
 $<HTMLButtonElement>('[data-builder-remove]').addEventListener('click',()=>{if(!selected)return;record();draft.blocks=draft.blocks.filter(b=>b.id!==selected);selected=null;draw();});
 $<HTMLButtonElement>('[data-builder-clear]').addEventListener('click',()=>{record();draft=blank();selected=null;draw();});
 $<HTMLButtonElement>('[data-builder-undo]').addEventListener('click',()=>{if(!undo.length)return;redo.push(clone());draft=undo.pop()!;selected=null;draw();});
 $<HTMLButtonElement>('[data-builder-redo]').addEventListener('click',()=>{if(!redo.length)return;undo.push(clone());draft=redo.pop()!;selected=null;draw();});
 const refreshLibrary=()=>{
  const select=$<HTMLSelectElement>('[data-builder-library]');
  select.replaceChildren(new Option('Saved Concepts',''),...library.map((design,i)=>new Option(design.name+' ('+design.blocks.length+' items)',String(i))));
 };
 $<HTMLButtonElement>('[data-builder-save]').addEventListener('click',()=>{
  draft.name=$<HTMLInputElement>('[data-builder-name]').value.trim().slice(0,70)||'Untitled Design';
  library.push(clone());refreshLibrary();$<HTMLSelectElement>('[data-builder-library]').value=String(library.length-1);
 });
 $<HTMLButtonElement>('[data-builder-load]').addEventListener('click',()=>{
  const index=Number($<HTMLSelectElement>('[data-builder-library]').value);
  if($<HTMLSelectElement>('[data-builder-library]').value===''||!library[index])return;
  record();draft=JSON.parse(JSON.stringify(library[index])) as Draft;selected=null;$<HTMLInputElement>('[data-builder-name]').value=draft.name;draw();
 });
 $<HTMLButtonElement>('[data-builder-duplicate]').addEventListener('click',()=>{
  record();draft=clone();draft.name=(draft.name+' Copy').slice(0,70);$<HTMLInputElement>('[data-builder-name]').value=draft.name;selected=null;draw();
 });
 $<HTMLSelectElement>('[data-builder-device]').addEventListener('change',draw);
 $<HTMLInputElement>('[data-builder-name]').addEventListener('change',e=>{record();draft.name=(e.target as HTMLInputElement).value.slice(0,70);});
 draw();
}
