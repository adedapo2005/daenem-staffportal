import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Laptop, Monitor, Smartphone, Tablet, ShieldCheck } from 'lucide-react';
import { hasWorkforcePermission, type WorkforceContext } from './auth';
import './stage1-responsive-review.css';

const presets=[
  {id:'desktop4k',label:'32-inch 4K',width:3840,height:2160,icon:Monitor},
  {id:'desktop',label:'Desktop 1080p',width:1920,height:1080,icon:Laptop},
  {id:'tablet',label:'Tablet',width:1024,height:768,icon:Tablet},
  {id:'mobile',label:'Mobile',width:390,height:844,icon:Smartphone},
] as const;

const routes=[
  {label:'Overview',path:'/home'},
  {label:'Forms Center',path:'/forms'},
  {label:'Facilities',path:'/facilities'},
  {label:'Spend',path:'/spend'},
] as const;

/**
 * Authenticated read-only visual QA aid. The preview viewport is sized
 * independently of the surrounding browser; it is not a device acceptance
 * certificate and it does not submit real data.
 */
export default function Stage1ResponsiveReview({context}:{context:WorkforceContext}){
  const permitted=hasWorkforcePermission(context,'navigation.studio','view')
    || hasWorkforcePermission(context,'settings.access','view');
  const [presetIndex,setPresetIndex]=useState(1);
  const [route,setRoute]=useState('/forms');
  const [containerWidth,setContainerWidth]=useState(1000);
  const container=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const node=container.current;if(!node)return;
    const measure=()=>setContainerWidth(Math.max(1,node.clientWidth));
    measure();
    const observer=new ResizeObserver(measure);observer.observe(node);
    return()=>observer.disconnect();
  },[permitted]);
  if(!permitted)return <main className="sp-viewport-review-shell"><h1>Responsive review access not assigned</h1>
    <p>Request the Navigation Studio or Settings review permission from Access Control. Owner and Admin titles do not automatically grant access.</p>
    <a href="/home">Return to StaffPortal</a></main>;

  const preset=presets[presetIndex];
  const scale=Math.min(1,Math.max(.12,(containerWidth-2)/preset.width));
  const url=route;
  return <main className="sp-viewport-review-shell" data-responsive-review="authorised" aria-label="StaffPortal responsive review workbench">
    <header className="sp-viewport-review-header">
      <div><span className="sp-viewport-review-eyebrow"><ShieldCheck size={17}/> AUTHORISED PRE-PRODUCTION REVIEW</span>
        <h1>Responsive layout workbench</h1>
        <p>View the current authenticated StaffPortal layout at defined CSS viewport sizes. This is a read-only preview; it does not replace testing on real devices.</p></div>
      <a className="sp-viewport-back" href="/home"><ArrowLeft size={16}/> Return to workspace</a>
    </header>
    <div className="sp-viewport-control-groups">
      <fieldset><legend>Viewport</legend><div className="sp-viewport-choice-row">
        {presets.map((item,i)=><button key={item.id} type="button" aria-pressed={presetIndex===i}
          onClick={()=>setPresetIndex(i)}><item.icon size={16}/><span>{item.label}</span>
          <small>{item.width} × {item.height}</small></button>)}
      </div></fieldset>
      <fieldset><legend>Workspace page</legend><div className="sp-viewport-choice-row">
        {routes.map(item=><button key={item.path} type="button" aria-pressed={route===item.path}
          onClick={()=>setRoute(item.path)}>{item.label}</button>)}
      </div></fieldset>
    </div>
    <p className="sp-viewport-disclaimer" role="note">The embedded preview cannot be interacted with or used to make changes. The content shown is the currently deployed Pre-Production application; unmerged PR changes are not included. Verify real desktop, 4K, tablet and mobile devices separately before release.</p>
    <section className="sp-viewport-preview-area" aria-label="Responsive frame preview" ref={container}>
      <div className="sp-viewport-preview-caption"><strong>{preset.label}</strong>
        <span>{preset.width} × {preset.height} CSS pixels · Preview scale {Math.round(scale*100)}%</span></div>
      <div className="sp-viewport-frame-clip" style={{height:Math.ceil(preset.height*scale),width:Math.ceil(preset.width*scale)}}>
        <iframe key={route+'-'+preset.id} src={url} title={preset.label+' read-only '+route+' preview'}
          tabIndex={-1} aria-hidden="true"
          style={{width:preset.width,height:preset.height,transform:'scale('+scale+')',transformOrigin:'top left',pointerEvents:'none'}} />
      </div>
    </section>
  </main>;
}
