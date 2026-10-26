import { useEffect, useState } from 'react';
import { ArrowLeft, ExternalLink, Laptop, Monitor, Smartphone, Tablet, ShieldCheck } from 'lucide-react';
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
 * Security headers enforce frame-ancestors 'none' and X-Frame-Options: DENY.
 * Do NOT weaken those protections to embed authenticated pages here. Instead,
 * each user-initiated control opens a separate same-origin review window at
 * the requested dimensions when supported by the browser.
 */
export default function Stage1ResponsiveReview({context}:{context:WorkforceContext}){
  const permitted=hasWorkforcePermission(context,'navigation.studio','view')
    || hasWorkforcePermission(context,'settings.access','view');
  const [presetIndex,setPresetIndex]=useState(1);
  const [route,setRoute]=useState('/forms');
  const [requestNote,setRequestNote]=useState('');
  const [currentSize,setCurrentSize]=useState({width:0,height:0});

  useEffect(()=>{
    const measure=()=>setCurrentSize({width:window.innerWidth,height:window.innerHeight});
    measure();window.addEventListener('resize',measure);
    return()=>window.removeEventListener('resize',measure);
  },[]);

  if(!permitted)return <main className="sp-viewport-review-shell"><h1>Responsive review access not assigned</h1>
    <p>Request the Navigation Studio or Settings review permission from Access Control. Owner and Admin titles do not automatically grant access.</p>
    <a href="/home">Return to StaffPortal</a></main>;

  const preset=presets[presetIndex];
  function openReviewWindow(){
    // Only these predefined local routes are eligible; do not accept external URLs.
    window.open(route,'_blank',
      'noopener,noreferrer,popup=yes,width='+preset.width+',height='+preset.height);
    setRequestNote('Requested '+preset.label+' ('+preset.width+' × '+preset.height+
      '). Browsers may open a tab, clamp the requested window size, or block pop-ups. Verify the actual CSS viewport before accepting the layout.');
  }
  return <main className="sp-viewport-review-shell" data-responsive-review="authorised" aria-label="StaffPortal responsive review workbench">
    <header className="sp-viewport-review-header">
      <div><span className="sp-viewport-review-eyebrow"><ShieldCheck size={17}/> AUTHORISED PRE-PRODUCTION REVIEW</span>
        <h1>Responsive layout workbench</h1>
        <p>Launch the authenticated StaffPortal page in a separate review window at a requested viewport size. This does not replace testing on real devices.</p></div>
      <a className="sp-viewport-back" href="/home"><ArrowLeft size={16}/> Return to workspace</a>
    </header>
    <div className="sp-viewport-control-groups">
      <fieldset><legend>Viewport</legend><div className="sp-viewport-choice-row">
        {presets.map((item,i)=>{const Icon=item.icon;return <button key={item.id} type="button" aria-pressed={presetIndex===i}
          onClick={()=>{setPresetIndex(i);setRequestNote('');}}><Icon size={16}/><span>{item.label}</span>
          <small>{item.width} × {item.height}</small></button>})}
      </div></fieldset>
      <fieldset><legend>Workspace page</legend><div className="sp-viewport-choice-row">
        {routes.map(item=><button key={item.path} type="button" aria-pressed={route===item.path}
          onClick={()=>{setRoute(item.path);setRequestNote('');}}>{item.label}</button>)}
      </div></fieldset>
    </div>
    <section className="sp-viewport-review-instructions" aria-label="Viewport verification controls">
      <div><strong>Requested viewport: {preset.width} × {preset.height} CSS pixels</strong>
        <p>Current review-window viewport: {currentSize.width} × {currentSize.height} CSS pixels. The new browser window may not match the requested size if limited by the screen or browser.</p>
        <p>For accurate 4K, tablet and mobile acceptance, use browser device emulation or an actual device and record the final viewport dimensions, clipping, keyboard focus and scroll behaviour.</p>
      </div>
      <button type="button" className="sp-viewport-open" onClick={openReviewWindow}>
        <ExternalLink size={17}/> Open requested review window
      </button>
      <a href={route} target="_blank" rel="noopener noreferrer">Open selected workspace in a normal new tab</a>
      {requestNote&&<p className="sp-viewport-result" role="status">{requestNote}</p>}
    </section>
    <p className="sp-viewport-disclaimer" role="note">StaffPortal blocks embedding via <code>frame-ancestors 'none'</code> and <code>X-Frame-Options: DENY</code>. These protections remain intact. Opening a window is not proof of its actual size. No data is submitted by this workbench; the opened application remains interactive, so use only approved synthetic QA data. The content is the currently deployed Pre-Production application; unmerged PR changes are not included.</p>
  </main>;
}
