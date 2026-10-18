import {activeEvidence} from './evidence-state';
import {byId,canView,recordsFor,type Session,type RecordData} from './model';
import {type ConfigVersion,metricValue} from './enterprise-contract';

export function activeConfigurations(versions:ConfigVersion[],session:Session):ConfigVersion[]{
 const active=new Map<string,ConfigVersion>();
 for(const v of versions)if(['Published','Rolled Back'].includes(v.state))active.set(v.id,v);
 return [...active.values()].filter(v=>canView(byId(v.target),session)&&(
   v.scope==='Company'||v.scope==='Individual'&&v.definition.assignee===session.personId||
   v.scope==='Role'&&(session.roles||[session.role]).includes(v.definition.assignee as Session['role'])||
   v.scope==='Team'&&(session.assignments||[]).some(a=>a.scope==='TEAM'&&a.values?.includes(v.definition.assignee))));
}
export function configurationResult(config:ConfigVersion,rows:RecordData[],session:Session){
 const m=byId(config.target);return m?metricValue(recordsFor(rows,m,session),config.definition.metric,m.required):0;
}
export function configurationGuard(config:ConfigVersion,row:RecordData,actor:string):string|null{
 const condition=config.definition.condition;
 if(condition==='Evidence present'&&!activeEvidence(row).length)return 'Attach evidence required by the active workflow.';
 if(condition==='Different authorized reviewer'&&row.owner===actor)return 'A different authorized reviewer is required.';
 if(condition==='All required fields valid'&&byId(row.module)?.required&&!row.fields[byId(row.module)!.required!]?.trim())return 'Complete the required workflow fields.';
 if(condition==='No unexplained variance'&&['Resolution Quantity','Resolution Amount'].some(k=>Number(row.fields[k]||0)!==0))return 'An investigated variance requires separate review.';
 return null;
}
