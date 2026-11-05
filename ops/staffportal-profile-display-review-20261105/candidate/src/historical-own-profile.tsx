import{createContext,useContext,useRef,useState}from'react';
import{Context as LabContext,useLab}from'../source-snapshots/DAENEM-StaffPortal-Post-SignIn-v115/app/experience/lab-context';
import type{RecordData}from'../source-snapshots/DAENEM-StaffPortal-Post-SignIn-v115/app/experience/model';
import OriginalProfile from'../source-snapshots/DAENEM-StaffPortal-Post-SignIn-v115/app/experience/profile-v3';
import{Empty,Btn}from'../source-snapshots/DAENEM-StaffPortal-Post-SignIn-v115/app/experience/ui';
import{Stage1RuntimeContext}from'./stage1-runtime-context';
import{api}from'./auth';
import{useBoundOwnProfile,type ProfileBinding}from'./own-profile-load';
import{isOwnProfileDisplayShape}from'./own-profile-display-shape';
type Response={binding:ProfileBinding;profile:{id:string;firstName?:string|null;lastName?:string|null;displayName?:string|null;phone?:string|null;email?:string|null;jobTitle?:string|null;department?:string|null;status:string;completionPercent?:number};workplace:{locationName?:string}|null};
type Contract={canEdit:boolean;saving:boolean;editableFields:string[];completion:{percent:number|string;completed:string;total:string;missing:string[]};save:(draft:Record<string,string>)=>Promise<{ok:boolean;message?:string}>};
const ContractContext=createContext<Contract|null>(null);
export function useHistoricalProfileContract(){const c=useContext(ContractContext);if(!c)throw Error('Verified profile contract unavailable');return c}
export default function HistoricalOwnProfile(){
 const{workforce}=useContext(Stage1RuntimeContext),lab=useLab(),bound=useBoundOwnProfile<Response>(workforce||null),busy=useRef(false),[saving,setSaving]=useState(false);
 const data=bound.data,p=data?.profile,shapeValid=!!data&&isOwnProfileDisplayShape(data.profile),canEdit=!!workforce&&['edit','approve','manage'].includes(workforce.permissions['profile.access']||'none');
 if(!workforce||!p||!shapeValid)return <Empty title={bound.loading?'Loading Your Profile':'Profile Unavailable'} message={bound.loading?'Checking The Current Account Binding.':bound.error||'Your Profile Could Not Be Verified.'} action={!bound.loading?<Btn variant="outline" onClick={()=>void bound.reload()}>Retry</Btn>:undefined}/>;
 const fields:Record<string,string>={'Legal Name':p.displayName||[p.firstName,p.lastName].filter(Boolean).join(' '),'First Name':p.firstName||'','Last Name':p.lastName||'',Phone:p.phone||'','Work Email':p.email||'','Employee ID':p.id,'Job Title':p.jobTitle||'',Department:p.department||'','Employment Status':p.status,'Work Location':data?.workplace?.locationName||''};
 const record:RecordData={id:'PROFILE-'+workforce.employee.id,module:'profile',title:fields['Legal Name'],subtitle:'Verified Own Profile',company:lab.session.company,status:p.status,owner:fields['Legal Name'],amount:0,due:'',evidence:[],history:[],fields};
 const save:Contract['save']=async draft=>{
  if(!canEdit||busy.current)return{ok:false,message:'Profile Editing Is Unavailable.'};
  const firstName=(draft['First Name']||'').trim(),lastName=(draft['Last Name']||'').trim();
  if(firstName.length<2||lastName.length<2)return{ok:false,message:'Enter At Least Two Characters For Each Name.'};
  const ticket=bound.ticket();if(!bound.accepts(ticket))return{ok:false,message:'Profile Authority Changed. Reload Before Saving.'};
  busy.current=true;setSaving(true);
  try{await api('/api/profile/mine',{method:'POST',body:JSON.stringify({firstName,lastName,phone:(draft.Phone||'').trim()})});
   if(!bound.accepts(ticket))return{ok:false,message:'Account Changed; The Late Result Was Discarded.'};
   const loaded=await bound.reload();if(loaded&&bound.accepts(loaded))window.dispatchEvent(new Event('daenem-auth-changed'));return loaded&&bound.accepts(loaded)?{ok:true}:{ok:false,message:'The Result Could Not Be Verified. Reload Your Profile.'};
  }catch(e){return{ok:false,message:bound.accepts(ticket)?(e instanceof Error?e.message:'The Result Is Unavailable. Reload Before Continuing.'):'Account Changed; The Late Result Was Discarded.'}}
  finally{busy.current=false;setSaving(false)}
 };
 const c:Contract={canEdit,saving,editableFields:['First Name','Last Name','Phone'],completion:{percent:Number.isFinite(p.completionPercent)&&p.completionPercent!>=0&&p.completionPercent!<=100?p.completionPercent!:'Unavailable',completed:'Verified Service',total:'Current Policy',missing:[]},save};
 return <ContractContext.Provider value={c}><LabContext.Provider value={{...lab,records:[record]}}><OriginalProfile key={JSON.stringify([workforce.sessionId,workforce.employee.id,p])}/></LabContext.Provider></ContractContext.Provider>;
}
