import React,{useEffect,useMemo,useState}from'react';
import { createRoot } from 'react-dom/client';
import{
  GripVertical,LayoutGrid,ListTree,Menu,PanelLeft,PanelTop,Pin,Search,
  ShieldCheck,X,
}from'lucide-react';
import{api,type AccessLevel,type WorkforceContext}from'./auth';
import'./navigation-studio.css';

type Style={id:string;name:string;badge:string;description:string};
type NavAction={kind:'native'|'module'|'selector'|'group-erp'|'hr-workflow'|'navigation';target:string;view?:string};
type NavItem={key:string;group:string;label:string;shortLabel:string;description:string;permissionCode?:string;minimum?:AccessLevel;action:NavAction;ownerPriority?:number};
type Effective={styles:Style[];policy:{defaultStyle:string;forcedStyle?:string;allowEmployeeChoice:boolean};preference:{preferredStyle:string;effectiveStyle:string;itemOrder:string[];groupOrder:string[];pinnedItems:string[]};canManagePolicy:boolean;canAssign:boolean;owner:boolean;items:NavItem[]};
type AccessEmployee={id:string;employeeNo?:string;displayName:string;email?:string;jobTitle?:string;department?:string;roleIds:string[];roleNames:string[];roleCodes:string[]};
type AccessRole={id:string;code:string;name:string;displayName?:string;description?:string;isSystem:number};
type Permission={id:string;code:string;module:string;description?:string;sensitive:number};
type PermissionLevel={roleId:string;permissionCode:string;accessLevel:AccessLevel};
type EmployeeOverride={employeeId:string;permissionCode:string;accessLevel:AccessLevel;reason:string;expiresAt?:string};
type AccessData={company:{id:string;code:string;name:string};items:NavItem[];permissionLevels:AccessLevel[];permissions:Permission[];employees:AccessEmployee[];roles:AccessRole[];rolePermissions:PermissionLevel[];employeeOverrides:EmployeeOverride[];changes:Array<Record<string,unknown>>;ownerProtected:boolean};
type StudioTab='styles'|'access'|'layout';

const levelLabels:Record<AccessLevel,string>={none:'No Access',view:'View Only',create:'Create',edit:'Edit',approve:'Approve',manage:'Manage / Admin'};
const styleIcons:Record<string,React.ComponentType<{size?:number}>>={
  'guided-groups':ListTree,'full-workspace':PanelLeft,'compact-rail':Menu,'two-column':LayoutGrid,'top-navigation':PanelTop,
};

function normalizeLabel(value:string){return value.replace(/\s+/g,' ').trim()}
function clickNative(label:string){
  const target=[...document.querySelectorAll<HTMLButtonElement>('.sidebar-functional-item')].find((button)=>normalizeLabel(button.textContent||'').startsWith(label));
  target?.click();
}
function clickSelector(selector:string){document.querySelector<HTMLButtonElement>(selector)?.click()}

function execute(item:NavItem,openStudio:(tab:StudioTab)=>void){
  const action=item.action;
  if(action.kind==='native')clickNative(action.target);
  else if(action.kind==='module')window.dispatchEvent(new CustomEvent('daenem:launch-module',{detail:{id:action.target,view:action.view}}));
  else if(action.kind==='selector')clickSelector(action.target);
  else if(action.kind==='group-erp')window.dispatchEvent(new CustomEvent('daenem:open-group-erp',{detail:{tab:action.target}}));
  else if(action.kind==='hr-workflow')window.dispatchEvent(new CustomEvent('daenem:open-hr-workflows',{detail:{tab:action.target}}));
  else openStudio(action.target==='access'?'access':'styles');
  document.querySelector<HTMLElement>('.sidebar')?.classList.remove('is-open', 'open');
}

function StylePanel({data,onChanged}:{data:Effective;onChanged:()=>Promise<void>}){
  const[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  async function choose(styleId:string){setBusy(true);try{await api('/api/navigation/preference',{method:'POST',body:JSON.stringify({styleId})});setMessage('Navigation style saved to your Workforce profile.');await onChanged()}catch(error){setMessage((error as Error).message)}finally{setBusy(false)}}
  async function policy(change:Record<string,unknown>,success:string){setBusy(true);try{await api('/api/navigation/policy',{method:'POST',body:JSON.stringify(change)});setMessage(success);await onChanged()}catch(error){setMessage((error as Error).message)}finally{setBusy(false)}}
  return <div className="dn-styles-panel">{message&&<div className="dn-message">{message}</div>}<div className="dn-style-grid">{data.styles.map((style)=>{const Icon=styleIcons[style.id]||LayoutGrid,selected=data.preference.effectiveStyle===style.id;return <button key={style.id} className={selected?'selected':''} onClick={()=>choose(style.id)} disabled={busy||Boolean(data.policy.forcedStyle&&!data.canManagePolicy)}><span className="dn-style-preview" data-style-preview={style.id}><Icon size={25}/><i/><i/><i/></span><span><b>{style.name}</b><em>{style.badge}</em><small>{style.description}</small></span><strong>{selected?'Selected':'Choose'}</strong></button>})}</div>{data.canManagePolicy&&<section className="dn-policy"><header><div><small>OWNER / ADMIN POLICY</small><h3>Group navigation policy</h3><p>Set the normal starting layout, force one style for everyone, or allow personal choice.</p></div><ShieldCheck size={22}/></header><div className="dn-policy-actions"><button onClick={()=>policy({defaultStyle:data.preference.effectiveStyle},'Group default navigation updated.')} disabled={busy}>Set selected as Group default</button><button onClick={()=>policy({forcedStyle:data.preference.effectiveStyle},'Selected navigation is now forced Group-wide.')} disabled={busy}>Force selected Group-wide</button><button onClick={()=>policy({forcedStyle:''},'Forced navigation cleared.')} disabled={busy}>Clear forced style</button><label><input type="checkbox" checked={data.policy.allowEmployeeChoice} onChange={(event)=>policy({allowEmployeeChoice:event.target.checked},event.target.checked?'Employee style choice enabled.':'Employee style choice disabled.')}/><span>Allow employees to choose their style</span></label></div>{data.policy.forcedStyle&&<div className="dn-forced"><Pin size={15}/> Group-wide style currently forced: <b>{data.styles.find((style)=>style.id===data.policy.forcedStyle)?.name||data.policy.forcedStyle}</b></div>}</section>}</div>;
}

function AccessPanel({context}:{context:WorkforceContext}){
  const[companyId,setCompanyId]=useState(context.companies[0]?.id||''),[data,setData]=useState<AccessData|null>(null),[targetType,setTargetType]=useState<'employee'|'role'>('employee'),[targetId,setTargetId]=useState(''),[query,setQuery]=useState(''),[reason,setReason]=useState('Authorized Workspace assignment'),[busyKey,setBusyKey]=useState(''),[message,setMessage]=useState('');
  async function load(id=companyId){if(!id)return;try{const result=await api<AccessData>(`/api/navigation/access?companyId=${encodeURIComponent(id)}`);setData(result);setTargetId((current)=>targetType==='employee'?(result.employees.some((employee)=>employee.id===current)?current:result.employees[0]?.id||''):(result.roles.some((role)=>role.id===current&&role.code!=='owner')?current:result.roles.find((role)=>role.code!=='owner')?.id||''))}catch(error){setMessage((error as Error).message)}}
  useEffect(()=>{void load(companyId)},[companyId]);
  useEffect(()=>{if(!data)return;setTargetId(targetType==='employee'?data.employees[0]?.id||'':data.roles.find((role)=>role.code!=='owner')?.id||'')},[targetType]);
  const target=targetType==='employee'?data?.employees.find((employee)=>employee.id===targetId):data?.roles.find((role)=>role.id===targetId);
  const targetRoleIds=targetType==='employee'?(target as AccessEmployee|undefined)?.roleIds||[]:[];
  function currentLevel(item:NavItem):AccessLevel|'inherit'{if(!data||!item.permissionCode)return'none';if(targetType==='role')return data.rolePermissions.find((row)=>row.roleId===targetId&&row.permissionCode===item.permissionCode)?.accessLevel||'none';const direct=data.employeeOverrides.find((row)=>row.employeeId===targetId&&row.permissionCode===item.permissionCode);if(direct)return direct.accessLevel;const roleLevels=data.rolePermissions.filter((row)=>targetRoleIds.includes(row.roleId)&&row.permissionCode===item.permissionCode).map((row)=>row.accessLevel);if(!roleLevels.length)return'inherit';return'inherit'}
  async function assign(item:NavItem,accessLevel:AccessLevel|'inherit'){if(!targetId)return;setBusyKey(item.key);try{await api('/api/navigation/assign',{method:'POST',body:JSON.stringify({companyId,targetType,targetId,itemKey:item.key,accessLevel:accessLevel==='inherit'?'none':accessLevel,clear:accessLevel==='inherit',reason})});setMessage(`${item.label}: ${accessLevel==='inherit'?'role access restored':levelLabels[accessLevel]} saved.`);await load()}catch(error){setMessage((error as Error).message)}finally{setBusyKey('')}}
  const groups=useMemo(()=>{const map=new Map<string,NavItem[]>();for(const item of data?.items||[]){if(query&&!`${item.label} ${item.description} ${item.group}`.toLowerCase().includes(query.toLowerCase()))continue;const rows=map.get(item.group)||[];rows.push(item);map.set(item.group,rows)}return[...map.entries()]},[data,query]);
  return <div className="dn-access-panel"><aside className="dn-access-sidebar"><label><span>Company</span><select value={companyId} onChange={(event)=>setCompanyId(event.target.value)}>{context.companies.map((company)=><option key={company.id} value={company.id}>{company.name}</option>)}</select></label><div className="dn-target-type"><button className={targetType==='employee'?'active':''} onClick={()=>setTargetType('employee')}>Employee</button><button className={targetType==='role'?'active':''} onClick={()=>setTargetType('role')}>Role</button></div><div className="dn-target-list">{targetType==='employee'?data?.employees.map((employee)=><button key={employee.id} className={targetId===employee.id?'active':''} onClick={()=>setTargetId(employee.id)}><b>{employee.displayName}</b><small>{employee.jobTitle||employee.department||employee.roleNames.join(', ')||'Employee'}</small></button>):data?.roles.filter((role)=>role.code!=='owner').map((role)=><button key={role.id} className={targetId===role.id?'active':''} onClick={()=>setTargetId(role.id)}><b>{role.name}</b><small>{role.description||'Company role'}</small></button>)}</div></aside><main className="dn-access-main"><header><div><small>AUTHORIZED WORKSPACE</small><h3>{target?(target as AccessEmployee|AccessRole).displayName||(target as AccessRole).name:'Select a target'}</h3><p>Assign the exact modules and submenus this {targetType} can open. The same access level is enforced by the Worker API.</p></div><div className="dn-access-search"><Search size={15}/><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Filter modules…"/></div></header>{message&&<div className="dn-message">{message}</div>}<label className="dn-reason"><span>Reason recorded in audit history</span><input value={reason} onChange={(event)=>setReason(event.target.value)} /></label><div className="dn-access-groups">{groups.map(([group,items])=><section key={group}><header><b>{group}</b><span>{items.length} assignment{items.length===1?'':'s'}</span></header>{items.map((item)=>{const level=currentLevel(item);return <div className="dn-access-row" key={item.key}><span><b>{item.label}</b><small>{item.description}<em>{item.permissionCode}</em></small></span><select value={level} disabled={!targetId||busyKey===item.key} onChange={(event)=>assign(item,event.target.value as AccessLevel|'inherit')}>{targetType==='employee'&&<option value="inherit">Use role access</option>}{data?.permissionLevels.map((value)=><option value={value} key={value}>{levelLabels[value]}</option>)}</select></div>})}</section>)}</div></main></div>;
}

function LayoutPanel({data,onChanged}:{data:Effective;onChanged:()=>Promise<void>}){
  const groups=[...new Set(data.items.map((item)=>item.group))];
  const[order,setOrder]=useState<string[]>(()=>data.preference.groupOrder.length?data.preference.groupOrder.filter((group)=>groups.includes(group)):groups),[pinned,setPinned]=useState<string[]>(data.preference.pinnedItems||[]),[message,setMessage]=useState('');
  function move(index:number,direction:-1|1){const next=[...order],target=index+direction;if(target<0||target>=next.length)return;[next[index],next[target]]=[next[target],next[index]];setOrder(next)}
  async function save(){try{await api('/api/navigation/preference',{method:'POST',body:JSON.stringify({groupOrder:order,pinnedItems:pinned})});setMessage('Personal navigation order saved.');await onChanged()}catch(error){setMessage((error as Error).message)}}
  return <div className="dn-layout-panel">{message&&<div className="dn-message">{message}</div>}<section><header><small>PERSONAL LAYOUT</small><h3>Arrange your workspace groups</h3><p>Move the groups into the order that best matches your daily work. This changes presentation only; permissions remain enforced.</p></header><div className="dn-order-list">{order.map((group,index)=><div key={group}><GripVertical size={17}/><b>{group}</b><span><button onClick={()=>move(index,-1)} disabled={index===0}>Up</button><button onClick={()=>move(index,1)} disabled={index===order.length-1}>Down</button></span></div>)}</div><h4>Pin frequent functions</h4><div className="dn-pin-grid">{data.items.map((item)=><label key={item.key}><input type="checkbox" checked={pinned.includes(item.key)} onChange={(event)=>setPinned((current)=>event.target.checked?[...current,item.key]:current.filter((key)=>key!==item.key))}/><Pin size={14}/><span>{item.label}</span></label>)}</div><button className="dn-primary" onClick={save}>Save personal layout</button></section></div>;
}

function NavigationStudio({data,context,initial,onClose,onChanged}:{data:Effective;context:WorkforceContext;initial:StudioTab;onClose:()=>void;onChanged:()=>Promise<void>}){
  const[tab,setTab]=useState<StudioTab>(initial);
  return <div className="dn-backdrop" onClick={onClose}><section className="dn-studio" onClick={(event)=>event.stopPropagation()}><header className="dn-studio-head"><div><small>DAENEM GROUP · OWNER NAVIGATION STUDIO</small><h2>Navigation & Authorized Workspace</h2><p>Choose how the ERP feels and control which functions each employee or role can use.</p></div><button onClick={onClose} aria-label="Close Navigation Studio"><X size={21}/></button></header><nav><button className={tab==='styles'?'active':''} onClick={()=>setTab('styles')}><LayoutGrid size={16}/>Five Navigation Styles</button><button className={tab==='layout'?'active':''} onClick={()=>setTab('layout')}><GripVertical size={16}/>My Layout</button>{data.canAssign&&<button className={tab==='access'?'active':''} onClick={()=>setTab('access')}><ShieldCheck size={16}/>Authorized Workspace</button>}</nav><main>{tab==='styles'?<StylePanel data={data} onChanged={onChanged}/>:tab==='access'&&data.canAssign?<AccessPanel context={context}/>:<LayoutPanel data={data} onChanged={onChanged}/>}</main></section></div>;
}

function NavigationApp(){
  const[context,setContext]=useState<WorkforceContext|null>(null),[data,setData]=useState<Effective|null>(null),[studio,setStudio]=useState<StudioTab|null>(null);
  async function refresh(){try{const[me,navigation]=await Promise.all([api<{context?:WorkforceContext}>('/api/auth/me'),api<Effective>('/api/navigation/effective')]);setContext(me.context||null);setData(navigation);document.documentElement.dataset.navigationStyle=navigation.preference.effectiveStyle;document.documentElement.dataset.navigationReady='true'}catch{setContext(null);setData(null);delete document.documentElement.dataset.navigationReady}}
  useEffect(()=>{void refresh();const focus=()=>void refresh();window.addEventListener('focus',focus);const timer=window.setInterval(()=>void refresh(),120000);return()=>{window.removeEventListener('focus',focus);window.clearInterval(timer)}},[]);
  useEffect(()=>{const open=(event:Event)=>{const detail=(event as CustomEvent<{tab?:StudioTab}>).detail;setStudio(detail?.tab||'styles')};window.addEventListener('daenem:open-navigation',open as EventListener);return()=>window.removeEventListener('daenem:open-navigation',open as EventListener)},[]);
  useEffect(()=>{const open=(event:Event)=>{const key=(event as CustomEvent<{key?:string}>).detail?.key,item=data?.items.find((candidate)=>candidate.key===key);if(item)execute(item,setStudio)};window.addEventListener('daenem:guide-open-function',open as EventListener);return()=>window.removeEventListener('daenem:guide-open-function',open as EventListener)},[data]);
  if(!context||!data)return null;
  return <>{studio&&<NavigationStudio data={data} context={context} initial={studio} onClose={()=>setStudio(null)} onChanged={refresh}/>}</>;
}

const host=document.createElement('div');host.id='daenem-navigation-studio-root';document.body.appendChild(host);createRoot(host).render(<NavigationApp/>);
