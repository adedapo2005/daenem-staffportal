import React from 'react';
import type { ReactNode } from 'react';
import './owner-studio-concept-runtime.css';

export type ConceptBlock = { id:string; kind:string; label:string; x:number; y:number; width:number; height:number };
export type ConceptDesign = { name:string; blocks:ConceptBlock[] };

/** Owner-only in-memory preview. Never used by the published Sign-In route. */
function stopPreviewAction(event:React.SyntheticEvent) {
 // Block every interactive control before its React handler can submit, redirect, or create a session.
 event.preventDefault();
 event.stopPropagation();
}
function stopPreviewClick(event:React.MouseEvent<HTMLElement>) {
 if ((event.target as Element).closest('button,a,input[type="submit"],input[type="button"]')) stopPreviewAction(event);
}
function stopPreviewKey(event:React.KeyboardEvent<HTMLElement>) {
 if ((event.key==='Enter'||event.key===' ') &&
  (event.target as Element).closest('button,a,input[type="submit"],input[type="button"]')) stopPreviewAction(event);
}
export function OwnerConceptRuntime({design, authPanel}:{design:ConceptDesign;authPanel:ReactNode}) {
 const auth=design.blocks.filter(b=>b.kind==='auth');
 if(auth.length!==1) return <div className="owner-concept-invalid" role="status">Add exactly one Protected Sign-In component to preview this layout.</div>;
 const safeBlocks=design.blocks.filter(b=>['brand','heading','text','clock','weather','auth'].includes(b.kind) &&
  [b.x,b.y,b.width,b.height].every(n=>Number.isFinite(n)&&n>=0&&n<=4000));
 return <section className="owner-concept-runtime" aria-label={design.name}
  onClickCapture={stopPreviewClick} onSubmitCapture={stopPreviewAction} onKeyDownCapture={stopPreviewKey}>
  <div className="owner-concept-banner" role="status">Private Owner Preview — Not Published</div>
  {safeBlocks.map(block=><div key={block.id} className={'owner-concept-block owner-concept-'+block.kind}
   style={{left:block.x,top:block.y,width:block.kind==='auth'?Math.max(block.width,310):block.width,
    minHeight:block.kind==='auth'?Math.max(block.height,290):block.height}}>
   {block.kind==='auth'?<div id="staffportal-auth-mount" className="sp-auth-mode-signin" data-auth-gateway="cloudflare-worker">{authPanel}</div>:
   block.kind==='heading'?<h1>{block.label}</h1>:
   block.kind==='brand'?<strong>{block.label}</strong>:
   <p>{block.label}</p>}
  </div>)}
 </section>;
}
