import {modules,byId,fieldAccess,canView,recordsFor,type Session,type Role,type RecordData,type Assignment,specializedActions,canRecordAct,STUDIO_SECTION_CAPABILITIES,type StudioCapabilityId} from './model';
export const testProfiles=['Owner','Delegated Experience Admin','Delegated Experience Admin · Brand Only','Delegated Experience Admin · Widgets + Responsive','Unauthorized Manager','Unauthorized Employee','Group Admin','Manager','Employee','Provisional','Multi-role','Multi-company','No permission','Expired override','Reduced override'];
const studioCapability=(section:string):StudioCapabilityId|undefined=>STUDIO_SECTION_CAPABILITIES.find(item=>item.section===section)?.id;
const delegatedExperienceSession=(profile:string,sections:string[]):Session=>{
 const capabilities=sections.map(studioCapability).filter((id):id is StudioCapabilityId=>Boolean(id));
 return {role:'Experience Admin',company:'printing',personId:'demo-experience-admin-'+profile.toLowerCase().replace(/[^a-z0-9]+/g,'-'),profile,overrides:{},assignments:[{module:'signin-design',level:'Manage',companies:['printing'],scope:'ASSIGNED',capabilities}],capabilities:{'signin-design':capabilities}};
};
export function sessionForProfile(profile:string):Session {
 const role:Role=profile==='Delegated Experience Admin'?'Experience Admin':['Employee','Unauthorized Employee','Provisional','No permission'].includes(profile)?'Employee':profile==='Manager'||profile==='Unauthorized Manager'||profile==='Multi-role'?'Manager':'Owner';
 if(profile==='Delegated Experience Admin') return delegatedExperienceSession(profile,[]);
 if(profile==='Delegated Experience Admin · Brand Only') return delegatedExperienceSession(profile,['Brand']);
 if(profile==='Delegated Experience Admin · Widgets + Responsive') return delegatedExperienceSession(profile,['Widgets','Responsive']);
 const ownerStudioCapabilities=STUDIO_SECTION_CAPABILITIES.map(item=>item.id);
 const assignments:Assignment[]=modules.filter(m=>m.roles.includes(role)&&(!m.company||role==='Owner'||m.company==='printing')).map(m=>({module:m.id,level:role==='Employee'?'Edit':'Manage',companies:role==='Owner'?['group']:['printing'],scope:role==='Employee'?'OWN':'COMPANY',capabilities:role==='Owner'?[...specializedActions,...ownerStudioCapabilities]:role==='Manager'?['export','print','publish','assign','reconcile','close','investigate','sendCommunication','approveCommunication','manageTemplates']:[]}));
 const base:Session={assignments,role,company:role==='Owner'?'group':'printing',personId:'demo-'+role.toLowerCase(),overrides:{},profile,displayTimeZone:role==='Owner'?'Africa/Lagos':role==='Manager'?'America/Toronto':'Africa/Lagos'};
 if(profile==='Provisional')return {...base,provisional:true,assignments:[]};
 if(profile==='No permission')return {...base,assignments:[]};
 if(profile==='Unauthorized Manager'||profile==='Unauthorized Employee')return {...base,assignments:[],overrides:{},capabilities:{}};
 if(profile==='Group Admin')return {...base,overrides:{payroll:'No Access',finance:'No Access','payroll-batches':'No Access',spend:'No Access','banking-operations':'No Access',treasury:'No Access',transfers:'No Access',beneficiaries:'No Access','payment-verification':'No Access','payroll-execution':'No Access',reconciliation:'No Access','financial-reports':'No Access'},capabilities:{'*':['export','print','assign','override','issuePassword','investigate','runDiagnostic']}};
 if(profile==='Multi-role')return {...base,roles:['Manager','Employee'],capabilities:{'*':['export','print','assign']}};
 if(profile==='Multi-company'){const assignments:Assignment[]=modules.filter(m=>!m.company||['printing','bakery'].includes(m.company)).map(m=>({module:m.id,level:'Manage',companies:['printing','bakery'],scope:'COMPANY',capabilities:['export','print','publish','assign','reconcile','close']}));return {...base,assignments};}
 if(profile==='Expired override')return {...base,timedOverrides:{printing:{level:'No Access',startsAt:'2020-01-01T00:00:00Z',expiresAt:'2020-01-02T00:00:00Z',reason:'Expired fixture override'}}};
 if(profile==='Reduced override')return {...base,overrides:{printing:'View'},capabilities:{printing:[]}};
 return base;
}
export function exportProjection(rows:RecordData[],s:Session):RecordData[]{return rows.flatMap(row=>{
 const source=modules.find(m=>canView(m,s)&&canRecordAct(row,m,s,'export'));
 return source?recordsFor([row],source,s):[];
});}
export interface AuditEvent {id:string;type:'business'|'security';action:string;actor:string;company:string;target:string;time:string;session:string;correlation:string;before:string;after:string;reason:string;device:string;ip:string;}
export function authorizedSurface(s:Session,rows:RecordData[],query=''){
 const available=modules.filter(m=>canView(m,s));const visible=[...new Map(available.flatMap(m=>recordsFor(rows,m,s)).map(r=>[r.module+':'+r.id,r])).values()];
 const search=query.toLowerCase();return {modules:available.filter(m=>(m.title+' '+m.family).toLowerCase().includes(search)),records:visible.filter(r=>(r.title+' '+r.id).toLowerCase().includes(search))};
}

/** Never expose an audit target the current reader cannot inspect. Detail text may
 * contain field values, so restrict it to full field projection for that subject. */
export function projectAudit(events:AuditEvent[],rows:RecordData[],session:Session):AuditEvent[]{
 if(!canView(byId('audit'),session)&&!canView(byId('session-analytics'),session))return [];
 return events.flatMap(event=>{
  if(event.company!==session.company&&session.company!=='group')return [];
  const [module,id]=event.target.split(':');const mod=byId(module);
  if(!mod||!canView(mod,session))return [];
  const record=id?rows.find(r=>r.module===module&&r.id===id):undefined;
  if(id&&(!record||!recordsFor([record],mod,session).length))return [];
  const fields=[...mod.fields,'Title','Amount','Evidence','History'];
  const full=fields.every(f=>['view','edit'].includes(fieldAccess(module,f,session)));
  return [{...event,...(full?{}:{action:'Record activity',before:'',after:'',reason:'',actor:'',target:module})}];
 });
}
