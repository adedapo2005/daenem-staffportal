import './owner-studio-pro.css';

/** Preview-only editing surface. Never writes published Sign-In preferences. */
type ElementEdit={x:number;y:number;width:number;height:number;scale:number;opacity:number;rotate:number;glow:number;radius:number};
type ClockLook='approved'|'champagne'|'emerald'|'midnight'|'ice'|'minimal';
const selectors=[
 ['Global Operations','#staff-global-operations'],
 ['Ibadan weather','#staff-local-weather'],
 ['Sign-In card','.sp-auth-card.sp-auth-gateway'],
 ['Sign-In logo','.sp-auth-card .sp-auth-logo-v101'],
 ['Access badge','.sp-auth-card .sp-secure-chip'],
 ['Hero headline','.sp-hero-title'],
 ['Toronto clock','#staff-global-operations [data-city-id="toronto"] .gw-city-clock'],
 ['London clock','#staff-global-operations [data-city-id="london"] .gw-city-clock'],
 ['New York clock','#staff-global-operations [data-city-id="newyork"] .gw-city-clock'],
 ['Moscow clock','#staff-global-operations [data-city-id="moscow"] .gw-city-clock'],
 ['Tokyo clock','#staff-global-operations [data-city-id="tokyo"] .gw-city-clock'],
 ['Beijing clock','#staff-global-operations [data-city-id="beijing"] .gw-city-clock'],
 ['Ibadan clock','#staff-local-weather .gw-city-clock']
] as const;
const presets=[['Mobile · 360×800',360,800],['Mobile · 390×844',390,844],['Mobile · 430×932',430,932],['Tablet · 768×1024',768,1024],['Tablet · 1024×768',1024,768],['Laptop · 1280×720',1280,720],['Laptop · 1366×768',1366,768],['Desktop · 1680×900',1680,900],['Desktop · 1920×1080',1920,1080],['WQHD · 2560×1440',2560,1440],['32-inch 4K · 3840×2160',3840,2160]] as const;
const defaults=():ElementEdit=>({x:0,y:0,width:0,height:0,scale:1,opacity:1,rotate:0,glow:0,radius:0});
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
type Snapshot={edits:Record<string,ElementEdit>;clock:ClockLook;animation:string;glow:number;};
const clone=(v:Snapshot)=>JSON.parse(JSON.stringify(v)) as Snapshot;
let snap:Snapshot={edits:{},clock:'approved',animation:'approved',glow:0};
let undo:Snapshot[]=[],redo:Snapshot[]=[];
let selected=selectors[0][1] as string, selectedLabel='Global Operations';
let activeDevice='1366x768';
const currentKey=()=>activeDevice+'|'+selected;
let editor:HTMLElement|null=null;
let frame:HTMLIFrameElement|null=null;
let listeningFrame:Document|null=null;
let dragOrigin:{x:number;y:number;base:ElementEdit}|null=null;
const getDoc=()=>{try{return frame?.contentDocument||null;}catch{return null;}};
const selectNode=(root:unknown,selector:string)=>(root as {querySelector(selector:string):unknown}).querySelector(selector) as HTMLSelectElement|null;
const q=()=>getDoc()?.querySelector<HTMLElement>(selected)||null;
function history(){undo.push(clone(snap));if(undo.length>80)undo.shift();redo=[];}
function entry(){return snap.edits[currentKey()]||defaults();}
function setEntry(value:ElementEdit,record=true){if(JSON.stringify(entry())===JSON.stringify(value))return;if(record)history();snap.edits[currentKey()]=value;apply();updateControls();}
const styleId='daenem-owner-studio-preview-style';
function clockCss(){
 const styles:Record<ClockLook,string>={approved:'',champagne:'filter:drop-shadow(0 0 9px rgba(226,184,96,.8)) sepia(.32) saturate(1.45);',emerald:'filter:drop-shadow(0 0 12px rgba(36,217,162,.85)) hue-rotate(64deg) saturate(1.3);',midnight:'filter:drop-shadow(0 0 12px rgba(52,126,255,.8)) contrast(1.2) brightness(.85);',ice:'filter:drop-shadow(0 0 12px rgba(121,231,255,.85)) brightness(1.15);',minimal:'filter:grayscale(1) contrast(1.08);'};
 const glow=snap.glow>0?'filter:drop-shadow(0 0 '+(snap.glow/5).toFixed(0)+'px rgba(82,210,255,.8));':'';
 const animation=snap.animation==='float'?'animation:studio-clock-float 3s ease-in-out infinite alternate !important;':snap.animation==='pulse'?'animation:studio-clock-pulse 2.4s ease-in-out infinite alternate !important;':snap.animation==='still'?'animation:none !important;':'';
 const orbit=snap.animation==='spin'?'.sp-root .gw-city-clock{position:relative!important}.sp-root .gw-city-clock::after{content:"";position:absolute;inset:-4px;border:2px dashed rgba(106,229,245,.7);border-radius:50%;pointer-events:none;animation:studio-clock-spin 14s linear infinite;}':'';
 return '.sp-root .gw-city-clock{'+(styles[snap.clock]||'')+glow+animation+'}'+orbit+' @keyframes studio-clock-float{to{translate:0 -5px}} @keyframes studio-clock-pulse{to{filter:brightness(1.23) drop-shadow(0 0 14px #69dcff)}} @keyframes studio-clock-spin{to{rotate:360deg}} @media (prefers-reduced-motion: reduce){.sp-root .gw-city-clock,.sp-root .gw-city-clock::after{animation:none!important}}';
}
function apply(){
 const doc=getDoc();if(!doc)return;
 const style=doc.getElementById(styleId)||doc.createElement('style');style.id=styleId;
 const rules:string[]=[];
 for(const [key,value] of Object.entries(snap.edits)){
  const sep=key.indexOf('|');if(key.slice(0,sep)!==activeDevice)continue;const selector=key.slice(sep+1);
  try{if(!doc.querySelector(selector))continue;rules.push(selector+'{translate:'+value.x+'px '+value.y+'px!important;scale:'+value.scale+'!important;rotate:'+value.rotate+'deg!important;opacity:'+value.opacity+'!important;'+(value.width?'width:'+value.width+'px!important;':'')+(value.height?'height:'+value.height+'px!important;':'')+(value.radius?'border-radius:'+value.radius+'px!important;':'')+(value.glow?'filter:drop-shadow(0 0 '+value.glow/4+'px rgba(60,205,255,.8))!important;':'')+'}');}
  catch{/* invalid draft selectors remain ignored without affecting other layers */}
 }
 style.textContent=clockCss()+' [data-studio-selected]{outline:2px dashed #14baad !important;outline-offset:3px !important;}'+rules.join('\n');
 if(!style.isConnected)doc.head.appendChild(style);
 highlight();
}
function highlight(){const doc=getDoc();if(!doc)return;doc.querySelectorAll('[data-studio-selected]').forEach(el=>el.removeAttribute('data-studio-selected'));q()?.setAttribute('data-studio-selected','');}
function updateControls(){
 if(!editor)return;const e=entry();
 for(const [name,value] of Object.entries(e)){const input=editor.querySelector<HTMLInputElement>('[data-prop="'+name+'"]');if(input)input.value=String(value);const display=editor.querySelector<HTMLElement>('[data-value="'+name+'"]');if(display)display.textContent=Number(value).toFixed(name==='opacity'||name==='scale'?2:0);}
 const look=selectNode(editor,'[data-clock-look]');if(look)look.value=snap.clock;
 const motion=selectNode(editor,'[data-clock-motion]');if(motion)motion.value=snap.animation;
 const clockGlow=editor.querySelector<HTMLInputElement>('[data-clock-glow]');if(clockGlow)clockGlow.value=String(snap.glow);
 const info=editor.querySelector('[data-studio-selection]');if(info)info.textContent=selectedLabel;
 const state=editor.querySelector('[data-studio-state]');if(state)state.textContent='PREVIEW ONLY · '+undo.length+' undo steps';
 (editor.querySelector('[data-undo]') as HTMLButtonElement|null)?.toggleAttribute('disabled',undo.length===0);
 (editor.querySelector('[data-redo]') as HTMLButtonElement|null)?.toggleAttribute('disabled',redo.length===0);
}
function pickElement(target:EventTarget|null){
 const el=target&&(target as Node).nodeType===1?target as Element:null;if(!el)return false;
 const doc=getDoc();if(!doc||!doc.querySelector('.sp-root')?.contains(el))return false;
 let selector='';let cur:Element|null=el;let depth=0;
 while(cur&&cur!==doc.body&&depth++<18){
  if(cur.id){selector='#'+CSS.escape(cur.id)+selector;break;}
  const tag=cur.localName;
  const parent:Element|null=cur.parentElement;
  const siblings=parent?[...parent.children].filter(child=>child.localName===tag):[];
  selector=tag+(siblings.length>1?':nth-of-type('+(siblings.indexOf(cur)+1)+')':'')+(selector?' > '+selector:'');
  cur=parent;
 }
 if(!selector)return false;
 selected=selector;selectedLabel=(el.textContent||'').trim().slice(0,25)||el.localName||'Element';
 const layer=editor?selectNode(editor,'[data-owner-pro-layer]'):null;
 if(layer&&!Array.from(layer.options).some(o=>o.value===selector)){
  const option=document.createElement('option');option.value=selector;option.textContent='Selected · '+selectedLabel;layer.appendChild(option);
 }
 if(layer)layer.value=selector;
 apply();updateControls();return true;
}
function locate(event:MouseEvent){
 if(!getDoc()||!editor?.querySelector<HTMLInputElement>('[data-select-mode]')?.checked)return;
 if(pickElement(event.target)){event.preventDefault();event.stopPropagation();}
}
function installFrame(){
 const doc=getDoc();if(!doc)return;
 if(listeningFrame!==doc){listeningFrame=doc;doc.addEventListener('click',locate,true);doc.addEventListener('pointerdown',e=>{
  if(e.button!==0||!editor?.querySelector<HTMLInputElement>('[data-drag-mode]')?.checked)return;
  if(!pickElement(e.target))return;
  dragOrigin={x:e.clientX,y:e.clientY,base:{...entry()}};e.preventDefault();updateControls();
 },true);doc.addEventListener('pointermove',e=>{if(!dragOrigin)return;const dx=e.clientX-dragOrigin.x,dy=e.clientY-dragOrigin.y;lastDrag={x:dx,y:dy};snap.edits[currentKey()]={...dragOrigin.base,x:clamp(dragOrigin.base.x+dx,-800,800),y:clamp(dragOrigin.base.y+dy,-800,800)};apply();updateControls();},true);
 doc.addEventListener('pointerup',()=>{if(dragOrigin){snap.edits[currentKey()]={...dragOrigin.base};history();snap.edits[currentKey()]={...dragOrigin.base,x:clamp(dragOrigin.base.x+(lastDrag?.x||0),-800,800),y:clamp(dragOrigin.base.y+(lastDrag?.y||0),-800,800)};dragOrigin=null;lastDrag=null;apply();updateControls();}},true);
 doc.addEventListener('pointercancel',()=>{dragOrigin=null;lastDrag=null;},true);
 }
 apply();
}
let lastDrag:{x:number;y:number}|null=null;

function setClock<K extends keyof Pick<Snapshot,'clock'|'animation'|'glow'>>(key:K,value:Snapshot[K]){history();snap[key]=value;apply();updateControls();}
function fitPreview(){
 const stage=editor?.querySelector<HTMLElement>('.owner-pro-canvas');const inner=editor?.querySelector<HTMLElement>('.owner-pro-canvas-inner');
 if(!stage||!inner||!frame)return;
 const width=parseInt(frame.style.width,10)||1366,height=parseInt(frame.style.height,10)||768;
 const zoom=clamp(Math.min((stage.clientWidth-24)/width,(stage.clientHeight-24)/height),.2,1);
 inner.style.width=Math.round(width*zoom)+'px';inner.style.height=Math.round(height*zoom)+'px';
 frame.style.transform='scale('+zoom+')';frame.style.transformOrigin='top left';
 stage.dataset.zoom=String(Math.round(zoom*100));
}
function deviceChanged(input:HTMLSelectElement){
 const preset=presets[Number(input.value)];if(!preset||!frame)return;
 const [,width,height]=preset;activeDevice=width+'x'+height;const stage=editor?.querySelector<HTMLElement>('.owner-pro-canvas');
 stage?.style.setProperty('--owner-pro-width',width+'px');
 stage?.style.setProperty('--owner-pro-height',height+'px');
 frame.style.width=width+'px';frame.style.height=height+'px';
 requestAnimationFrame(fitPreview);
 const frameSize=editor?.querySelector('[data-device-size]');if(frameSize)frameSize.textContent=width+' × '+height;apply();updateControls();
}
function stack(action:'undo'|'redo'|'reset-element'|'reset-all'){
 if(action==='undo'&&undo.length){redo.push(clone(snap));snap=undo.pop()!;}
 if(action==='redo'&&redo.length){undo.push(clone(snap));snap=redo.pop()!;}
 if(action==='reset-element'){history();delete snap.edits[currentKey()];}
 if(action==='reset-all'){history();snap={edits:{},clock:'approved',animation:'approved',glow:0};}
 apply();updateControls();
}
function propMarkup(label:string,id:keyof ElementEdit,min:number,max:number,step:number){
 return '<label class="owner-pro-setting"><span>'+label+' <output data-value="'+id+'"></output></span><input type="range" min="'+min+'" max="'+max+'" step="'+step+'" data-prop="'+id+'"></label>';
}
export function mountOwnerStudioPro(root:HTMLElement){
 const section=root.querySelector<HTMLElement>('.signin-admin-preview');if(!section)return;
 if(section.querySelector('.owner-pro-studio'))return;
 const studio=document.createElement('section');studio.className='owner-pro-studio';editor=studio;
 studio.innerHTML='<nav class="owner-pro-nav" aria-label="Owner Studio sections"><button type="button" data-studio-jump="canvas">Design Canvas</button><button type="button" data-studio-jump="media">Media Library</button><button type="button" data-studio-jump="widgets">Widget Management</button><button type="button" data-studio-jump="clock">Clock Studio</button><button type="button" data-studio-jump="publish">Review & Publish</button></nav><div class="owner-pro-header"><div><span>OWNER STUDIO · PRECISION CANVAS</span><h4>Live visual designer</h4><p>The current approved Sign-In is the source. Everything below stays in this private review and never publishes automatically.</p></div><strong data-studio-state>PREVIEW ONLY</strong></div>'+
 '<div class="owner-pro-bar"><label>Device viewport<select data-owner-pro-preset>'+presets.map(([label,width,height],i)=>'<option value="'+i+'"'+(width===1366?' selected':'')+'>'+label+'</option>').join('')+'</select></label><label>Layer<select data-owner-pro-layer>'+selectors.map(([label,sel])=>'<option value="'+sel.replace(/"/g,'&quot;')+'">'+label+'</option>').join('')+'</select></label><label class="owner-pro-check"><input data-select-mode type="checkbox" checked> Pick layer</label><label class="owner-pro-check"><input data-drag-mode type="checkbox"> Drag in preview</label></div>'+
 '<div class="owner-pro-actions"><button type="button" data-undo>Undo</button><button type="button" data-redo>Redo</button><button type="button" data-reset-element>Revert element</button><button type="button" data-reset-all>Revert everything</button><button type="button" data-zoom-fit>Fit entire device</button><span data-device-size>1366 × 768</span></div>'+
 '<div class="owner-pro-content"><div class="owner-pro-canvas" style="--owner-pro-width:1366px;--owner-pro-height:768px"><div class="owner-pro-canvas-inner"><iframe title="Approved Sign-In owner preview · interactive" data-owner-pro-frame src="/staff-portal-signin?studioReview=signin-v180" loading="lazy"></iframe></div></div>'+
 '<aside class="owner-pro-inspector"><h5>Selected: <span data-studio-selection></span></h5><p>Move or resize your selected layer. Touch devices can use the sliders. Changes can be undone instantly.</p>'+
 propMarkup('Move horizontally','x',-800,800,1)+propMarkup('Move vertically','y',-800,800,1)+propMarkup('Width · 0 = automatic','width',0,800,1)+propMarkup('Height · 0 = automatic','height',0,800,1)+propMarkup('Size','scale',.4,2.5,.01)+propMarkup('Rotate','rotate',-180,180,1)+propMarkup('Round corners','radius',0,100,1)+propMarkup('Transparency','opacity',.15,1,.01)+propMarkup('Glow','glow',0,100,1)+
 '<div class="owner-pro-clock-controls"><h5>Analog clock studio</h5><label>Clock design<select data-clock-look>'+(['approved','champagne','emerald','midnight','ice','minimal'] as const).map(x=>'<option value="'+x+'">'+x+'</option>').join('')+'</select></label>'+
 '<label>Motion<select data-clock-motion><option value="approved">Approved default</option><option value="still">Still</option><option value="float">Levitation</option><option value="pulse">Glow pulse</option><option value="spin">Artistic dial rotation</option></select></label>'+
 '<label>Glow strength<input type="range" min="0" max="100" step="1" data-clock-glow value="0"></label></div></aside></div>'+
 '<p class="owner-pro-note">Session-only preview. This studio cannot publish or alter the authenticated Sign-In without an explicit release action. Use the existing review controls for the separate publish workflow.</p>';
 section.appendChild(studio);
 studio.querySelectorAll<HTMLButtonElement>('[data-studio-jump]').forEach(button=>button.addEventListener('click',()=>{
  const target=button.dataset.studioJump;
  const map:Record<string,string>={canvas:'.owner-pro-canvas',media:'.signin-background-section',widgets:'.signin-admin-section:has([data-signin-widget])',clock:'.owner-pro-clock-controls',publish:'.studio-review-draft-actions'};
  (root.querySelector(map[target||'canvas'])||studio)?.scrollIntoView({behavior:'smooth',block:'nearest'});
  studio.querySelectorAll('[data-studio-jump]').forEach(item=>item.setAttribute('aria-current',item===button?'page':'false'));
 }));
 frame=studio.querySelector<HTMLIFrameElement>('[data-owner-pro-frame]');
 const layer=selectNode(studio,'[data-owner-pro-layer]');
 layer?.addEventListener('change',()=>{selected=layer.value;selectedLabel=selectors.find(([,sel])=>sel===selected)?.[0]||'Element';apply();updateControls();});
 selectNode(studio,'[data-owner-pro-preset]')?.addEventListener('change',e=>deviceChanged(e.target as HTMLSelectElement));
 for(const input of studio.querySelectorAll<HTMLInputElement>('[data-prop]'))input.addEventListener('input',()=>{const name=input.dataset.prop as keyof ElementEdit;const next={...entry(),[name]:Number(input.value)};setEntry(next);});
 studio.querySelector('[data-undo]')?.addEventListener('click',()=>stack('undo'));
 studio.querySelector('[data-redo]')?.addEventListener('click',()=>stack('redo'));
 studio.querySelector('[data-reset-element]')?.addEventListener('click',()=>stack('reset-element'));
 studio.querySelector('[data-reset-all]')?.addEventListener('click',()=>stack('reset-all'));
 studio.querySelector('[data-zoom-fit]')?.addEventListener('click',fitPreview);
 selectNode(studio,'[data-clock-look]')?.addEventListener('change',e=>setClock('clock',(e.target as HTMLSelectElement).value as ClockLook));
 selectNode(studio,'[data-clock-motion]')?.addEventListener('change',e=>setClock('animation',(e.target as HTMLSelectElement).value));
 studio.querySelector<HTMLInputElement>('[data-clock-glow]')?.addEventListener('input',e=>setClock('glow',Number((e.target as HTMLInputElement).value)));
 frame?.addEventListener('load',installFrame);
 updateControls();requestAnimationFrame(fitPreview);if(frame?.contentDocument?.readyState==='complete')installFrame();
}
