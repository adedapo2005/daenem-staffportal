import { hasPermission, type AccessLevel, type AuthEnv, type SessionContext } from './auth';
import { routeAutosV2 } from './autos-v2';

interface Env extends AuthEnv {}
const COMPANY='company-autos';
const json=(body:Record<string,unknown>,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const ranks:Record<AccessLevel,number>={none:0,view:1,create:2,edit:3,approve:4,manage:5};
function access(context:SessionContext,code:string,minimum:AccessLevel='view'){return context.companies.some(company=>company.id===COMPANY)&&hasPermission(context,code,minimum,COMPANY)}
function elevated(context:SessionContext,autosLevel:AccessLevel='view',salesLevel?:AccessLevel):SessionContext{
 const permissions={...context.permissions};
 const companyPermissions={...context.companyPermissions,[COMPANY]:{...(context.companyPermissions[COMPANY]||{})}};
 if(ranks[permissions['autos.access']||'none']<ranks[autosLevel])permissions['autos.access']=autosLevel;
 if(ranks[companyPermissions[COMPANY]['autos.access']||'none']<ranks[autosLevel])companyPermissions[COMPANY]['autos.access']=autosLevel;
 if(salesLevel&&ranks[permissions['sales.access']||'none']<ranks[salesLevel])permissions['sales.access']=salesLevel;
 if(salesLevel&&ranks[companyPermissions[COMPANY]['sales.access']||'none']<ranks[salesLevel])companyPermissions[COMPANY]['sales.access']=salesLevel;
 return{...context,permissions,companyPermissions};
}
function denied(label:string){return json({error:`${label} permission is required.`},403)}

export async function routeAutosV3(request:Request,env:Env,context:SessionContext):Promise<Response|null>{
 const url=new URL(request.url),p=url.pathname,m=request.method;
 if(p==='/api/autos/dashboard'&&m==='GET'){
  if(!access(context,'autos.stock','view')&&!access(context,'autos.workshop','view')&&!access(context,'autos.sales_pipeline','view'))return denied('Autos');
  return routeAutosV2(request,env,elevated(context,'view'));
 }
 if(p==='/api/autos/vehicles'&&m==='GET'){
  if(!access(context,'autos.stock','view'))return denied('Vehicle stock');
  return routeAutosV2(request,env,elevated(context,'view'));
 }
 if(p==='/api/autos/vehicles'&&m==='POST'){
  if(!access(context,'autos.stock','create'))return denied('Create vehicle stock');
  return routeAutosV2(request,env,elevated(context,'create'));
 }
 if(p==='/api/autos/vehicles/cost'&&m==='POST'){
  if(!access(context,'autos.costs','create'))return denied('Vehicle cost');
  const level:AccessLevel=access(context,'autos.costs','approve')?'approve':'edit';
  return routeAutosV2(request,env,elevated(context,level));
 }
 if(p==='/api/autos/vehicles/status'&&m==='POST'){
  if(!access(context,'autos.stock','edit'))return denied('Edit vehicle stock');
  return routeAutosV2(request,env,elevated(context,'edit'));
 }
 if(p==='/api/autos/leads'&&m==='GET'){
  if(!access(context,'autos.sales_pipeline','view'))return denied('Autos sales pipeline');
  return routeAutosV2(request,env,elevated(context,'view','view'));
 }
 if(p==='/api/autos/leads'&&m==='POST'){
  if(!access(context,'autos.sales_pipeline','create'))return denied('Create Autos lead');
  return routeAutosV2(request,env,elevated(context,'create','create'));
 }
 if(p==='/api/autos/leads/activity'&&m==='POST'){
  if(!access(context,'autos.sales_pipeline','edit'))return denied('Edit Autos sales pipeline');
  return routeAutosV2(request,env,elevated(context,'edit','edit'));
 }
 if(p==='/api/autos/workshop'&&m==='GET'){
  if(!access(context,'autos.workshop','view'))return denied('Autos workshop');
  return routeAutosV2(request,env,elevated(context,'view'));
 }
 if(p==='/api/autos/workshop'&&m==='POST'){
  if(!access(context,'autos.workshop','create'))return denied('Create workshop job');
  return routeAutosV2(request,env,elevated(context,'create'));
 }
 if(p==='/api/autos/workshop/update'&&m==='POST'){
  if(!access(context,'autos.workshop','edit'))return denied('Edit workshop job');
  const level:AccessLevel=access(context,'autos.workshop','approve')?'approve':'edit';
  return routeAutosV2(request,env,elevated(context,level));
 }
 if(p==='/api/autos/sales'&&m==='POST'){
  if(!access(context,'autos.sales_pipeline','edit'))return denied('Autos sale');
  const level:AccessLevel=access(context,'autos.sales_pipeline','approve')?'approve':'edit';
  return routeAutosV2(request,env,elevated(context,level,level));
 }
 if(p==='/api/autos/movements'&&m==='POST'){
  if(!access(context,'autos.movement','create'))return denied('Vehicle movement');
  const gate=access(context,'autos.gatepass','approve');
  return routeAutosV2(request,env,elevated(context,gate?'approve':'create'));
 }
 return null;
}
