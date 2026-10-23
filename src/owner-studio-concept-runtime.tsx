import React from 'react';
import type { ReactNode, CSSProperties } from 'react';
import './owner-studio-concept-runtime.css';

export type ConceptInnerItem = {id:string;label:string;x:number;y:number};
export type ConceptBlock = {id:string;kind:string;label:string;x:number;y:number;width:number;height:number;items?:ConceptInnerItem[]};
export type ConceptDesign = {name:string;blocks:ConceptBlock[]};
const heights:Record<number,number>={390:844,430:932,768:1024,1024:768,1280:720,1366:900,1920:1080,2560:1440,3840:2160};
function stopPreviewAction(event:React.SyntheticEvent){event.preventDefault();event.stopPropagation();}
function previewSafeAction(target:Element){return Boolean(target.closest(
  '.sp-auth-tabs [role="tab"], .sp-forgot, .sp-show-password, .sp-signup-close, .usp-back-link, .usp-tabs [role="tab"]'
));}
function stopPreviewClick(event:React.MouseEvent<HTMLElement>){
  const target=event.target as Element;
  if(target.closest('button,a,input[type="submit"],input[type="button"]')&&!previewSafeAction(target))stopPreviewAction(event);
}
function stopPreviewKey(event:React.KeyboardEvent<HTMLElement>){
  const target=event.target as Element;
  if((event.key==='Enter'||event.key===' ')&&target.closest('button,a,input[type="submit"],input[type="button"]')&&!previewSafeAction(target))stopPreviewAction(event);
}
/** Preview is never a public entry point. Only the untouched starter preset receives a fluid split layout. */
export function OwnerConceptRuntime({design,authPanel,viewportWidth=1366}:{
  design:ConceptDesign;authPanel:ReactNode;viewportWidth?:number;
}){
  const width=heights[viewportWidth]?viewportWidth:1366;
  const height=heights[width];
  const factor=Math.max(1,width/1366);
  const auth=design.blocks.filter(b=>b.kind==='auth');
  const previewRef=React.useRef<HTMLElement|null>(null);
  React.useEffect(()=>{
    const root=previewRef.current;
    if(!root)return;
    const protectFields=()=>{
      for(const field of root.querySelectorAll<HTMLInputElement|HTMLTextAreaElement>('.owner-concept-auth input,.owner-concept-auth textarea')){
        if(field instanceof HTMLInputElement&&['checkbox','radio','hidden','button','submit'].includes(field.type))continue;
        if(!field.readOnly)field.readOnly=true;
        if(field.getAttribute('autocomplete')!=='off')field.setAttribute('autocomplete','off');
        if(field.getAttribute('aria-description')!=='Credentials are disabled in this design preview.')
          field.setAttribute('aria-description','Credentials are disabled in this design preview.');
      }
    };
    protectFields();
    const observer=new MutationObserver(protectFields);
    observer.observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:['readonly','autocomplete']});
    return ()=>observer.disconnect();
  },[auth.length,authPanel]);
  if(auth.length!==1)return <div className="owner-concept-invalid" role="status">Add exactly one Protected Sign-In component to preview this layout.</div>;
  const safeBlocks=design.blocks.filter(b=>['brand','heading','text','clock','weather','auth'].includes(b.kind)&&
    [b.x,b.y,b.width,b.height].every(n=>Number.isFinite(n)&&n>=0&&n<=4000));
  const byKind=(kind:string)=>safeBlocks.find(b=>b.kind===kind);
  const brand=byKind('brand'),heading=byKind('heading'),login=byKind('auth');
  const untouchedStarter=safeBlocks.length>=3&&safeBlocks.filter(b=>b.kind==='auth').length===1&&brand?.x===20&&brand?.y===20&&
    brand.width===210&&brand.height===60&&
    heading?.x===20&&heading?.y===100&&heading.width===330&&heading.height===65&&
    login?.x===20&&login?.y===190&&login.width===310&&login.height===290;
  const desktopSplit=untouchedStarter&&width>=768;
  const gutter=Math.round(width*.05);
  const loginWidth=Math.round(width*(width<=1024?.48:width<=1366?.44:.36));
  const loginX=width-gutter-loginWidth;
  const blockStyle=(b:ConceptBlock):CSSProperties=>{
    if(untouchedStarter&&!['brand','heading','auth'].includes(b.kind)){
      const supplements=safeBlocks.filter(item=>!['brand','heading','auth'].includes(item.kind));
      const supplementIndex=supplements.findIndex(item=>item.id===b.id);
      const isAutomaticPlacement=b.x===70&&b.y===510+supplementIndex*190;
      if(isAutomaticPlacement){
       return {left:width<768?20:gutter,top:width<768?1000+supplementIndex*230:Math.max(Math.round(height*.55),b.y*factor),
        width:Math.min(b.width*factor,width-(width<768?40:gutter*2)),minHeight:b.height*factor};
      }
    }
    if(desktopSplit){
      if(b.kind==='auth')return {left:loginX,top:Math.round(height*.035),width:loginWidth,minHeight:Math.round(290*factor)};
      if(b.kind==='brand')return {left:gutter,top:Math.round(height*.18),width:loginX-gutter*1.5,minHeight:Math.round(65*factor)};
      if(b.kind==='heading')return {left:gutter,top:Math.round(height*.34),width:loginX-gutter*1.5,minHeight:Math.round(120*factor)};
    }
    return {left:b.x*factor,top:b.y*factor,width:Math.max(b.kind==='auth'?310:0,b.width)*factor,
      minHeight:Math.max(b.kind==='auth'?290:0,b.height)*factor};
  };
  const runtimeStyle={width,minHeight:height,'--concept-scale':String(factor)} as CSSProperties;
  return <section ref={previewRef} className="owner-concept-runtime" style={runtimeStyle}
    aria-label={design.name+' — Private Owner Preview'}
    onClickCapture={stopPreviewClick} onSubmitCapture={stopPreviewAction} onKeyDownCapture={stopPreviewKey}>
    <span className="owner-concept-sr" role="status">Private Owner Preview. All credential entry, form submissions and provider actions are disabled. Nothing is published.</span>
    {safeBlocks.map(block=><div key={block.id} className={'owner-concept-block owner-concept-'+block.kind}
      style={blockStyle(block)}>
      {block.kind==='auth'?<div id="staffportal-auth-mount" className="sp-auth-mode-signin" data-auth-gateway="preview-only"><p className="owner-concept-preview-notice">Design Preview Only · Credentials Disabled</p>{authPanel}</div>:
        block.kind==='heading'?<h1>{block.label}</h1>:
        block.kind==='brand'?<div className="owner-concept-identity"><strong>DAENEM</strong><small>STAFF PORTAL</small></div>:
        block.kind==='clock'||block.kind==='weather'?<div className="owner-concept-widget" role="group" aria-label={block.label+' — editable concept, not live data'} style={{minHeight:block.height*factor}}>
          <strong className="owner-concept-widget-title">{block.label}</strong>
          <div className="owner-concept-widget-content">
            {(block.items||[]).filter(item=>[item.x,item.y].every(n=>Number.isFinite(n)&&n>=0&&n<=4000)).map(item=><span key={item.id} data-concept-item={item.id} className="owner-concept-widget-item" style={{left:item.x*factor,top:item.y*factor}}>{item.label}</span>)}
          </div>
          <small className="owner-concept-widget-note">Layout Concept — Not Live Data</small>
        </div>:<p>{block.label}</p>}
    </div>)}
  </section>;
}
