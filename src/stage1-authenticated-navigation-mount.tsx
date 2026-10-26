import {useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import {Grid3X3} from 'lucide-react';
import type {WorkforceContext} from './auth';
import Stage1GrantNavigation from './stage1-grant-navigation';

type NavigationMount = {legacy:HTMLElement;host:HTMLDivElement};

/**
 * Integrates with the protected command-navigation overlay without changing
 * its source bytes/checksum or the approved V115 snapshot. Both desktop rail
 * and mobile Sheet render a legacy ECC anchor. Each gets one authenticated,
 * permission-derived navigation portal; the legacy menu is hidden by CSS.
 */
export default function Stage1AuthenticatedNavigationMount({context}:{context:WorkforceContext}){
  const [mounts,setMounts]=useState<NavigationMount[]>([]);
  useEffect(()=>{
    const active=new Map<HTMLElement,HTMLDivElement>();
    let stopped=false;
    function sync(){
      if(stopped)return;
      let changed=false;
      const found=document.querySelectorAll<HTMLElement>(
        '[data-approved-postlogin="qa-review-v115"] nav.ecc-navigation:not([data-grant-navigation])'
      );
      const present=new Set(Array.from(found));
      for(const legacy of present){
        if(active.has(legacy) || !legacy.parentElement)continue;
        const host=document.createElement('div');
        host.className='sp-grant-nav-host';
        host.dataset.authenticatedNavigationHost='true';
        legacy.insertAdjacentElement('afterend',host);
        active.set(legacy,host);
        changed=true;
      }
      for(const [legacy,host] of active){
        if(!present.has(legacy)||!legacy.isConnected||!host.isConnected){
          host.remove();active.delete(legacy);changed=true;
        }
      }
      if(changed)setMounts([...active].map(([legacy,host])=>({legacy,host})));
    }
    const observer=new MutationObserver(sync);
    observer.observe(document.body,{childList:true,subtree:true});
    sync();
    return()=>{
      stopped=true;observer.disconnect();
      for(const host of active.values())host.remove();
      active.clear();
    };
  },[]);

  return <>{mounts.map(({legacy,host})=>createPortal(
    <div className="sp-grant-nav-mount" data-authenticated-grant-navigation="true">
      <button type="button" className="sp-grant-rail-open"
        aria-label="Expand authorised company pages"
        onClick={()=>legacy.closest('.p-sidebar')?.querySelector<HTMLButtonElement>('.p-shell-collapse')?.click()}>
        <Grid3X3 size={19} aria-hidden="true" />
      </button>
      <Stage1GrantNavigation context={context} collapsed={false}
        onExpand={()=>legacy.closest('.p-sidebar')?.querySelector<HTMLButtonElement>('.p-shell-collapse')?.click()}/>
    </div>,host,legacy.dataset.navigationAnchorId||legacy.id||String(mounts.indexOf(mounts.find(m=>m.legacy===legacy)!))))}</>;
}
