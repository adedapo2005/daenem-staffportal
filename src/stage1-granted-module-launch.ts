import type { WorkforceContext } from './auth';
import { getCanonicalModule, isModuleVisible } from './module-hub';

export type ScopedModuleLaunch = {
  scopeId: string;
  moduleId: string;
};

/** Never use role title, the first company, or a URL parameter as permission authority. */
export function authorisedModuleLaunch(context: WorkforceContext, request: ScopedModuleLaunch) {
  const company=context.companies.find(c=>c.id===request.scopeId);
  const module=getCanonicalModule(request.moduleId);
  if(!company || !module || !isModuleVisible(context,module,company.id,company.code))return null;
  return {company,module};
}

async function afterRender():Promise<void> {
  await new Promise<void>(resolve=>window.requestAnimationFrame(()=>resolve()));
}

/**
 * Reuse the existing canonical module entry contract without introducing a
 * separate data writer. The module's own Worker checks remain authoritative.
 */
export async function launchGrantedModule(context:WorkforceContext,request:ScopedModuleLaunch) {
  const allowed=authorisedModuleLaunch(context,request);
  if(!allowed)throw new Error('This company module is not assigned to your account.');
  const {company,module}=allowed;
  const experience={
    moduleId:module.id,
    erpId:module.erpId,
    canonicalPath:module.erpId+'/'+module.submenuId+'/'+module.subsubmenuId+'/'+module.functionalItem,
    layoutId:'executive-command',
    shellMode:'command-rail',
    density:'standard',
    motion:'balanced',
  };
  const publish=()=>{
    (window as Window & {__DAENEM_MODULE_EXPERIENCE__?:typeof experience}).__DAENEM_MODULE_EXPERIENCE__=experience;
    window.dispatchEvent(new CustomEvent('daenem:module-experience',{detail:experience}));
  };
  publish();
  await module.load();
  await afterRender();
  await afterRender();
  // Ensure a newly mounted entry receives the company context before opening.
  publish();
  window.dispatchEvent(new CustomEvent('daenem:active-company-changed',{
    detail:{companyId:company.id,companyCode:company.code},
  }));
  if(module.selector) {
    let opened=false;
    for(let count=0;count<80;count++){
      const button=document.querySelector<HTMLButtonElement>(module.selector);
      if(button && !button.disabled){button.click();opened=true;break;}
      await new Promise<void>(resolve=>window.setTimeout(resolve,100));
    }
    if(!opened)throw new Error(module.label+' could not open its authorised workspace. Please retry.');
  }
  if(module.event)window.dispatchEvent(new CustomEvent(module.event.name,{
    detail:{...module.event.detail,companyId:company.id,companyCode:company.code,experience},
  }));
  return {companyId:company.id,moduleId:module.id};
}
