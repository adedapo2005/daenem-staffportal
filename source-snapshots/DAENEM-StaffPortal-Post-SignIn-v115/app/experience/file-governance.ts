import {byId,canRecordAct,type RecordData,type Session} from './model';
export interface FilePolicy{classification:'Internal'|'Confidential'|'Restricted';category?:string;tags?:string;approval?:'Draft'|'Review'|'Approved'|'Rejected';locked?:boolean;expiresAt?:string;legalHold:boolean;retainUntil:string;deleted?:boolean;history:{action:string;actor:string;time:string}[]}
export function fileChangeError(original:RecordData,next:RecordData,session:Session):string|null{
 const mod=byId(original.module)!;
 for(const name of new Set([...original.evidence,...next.evidence,...Object.keys(next.filePolicies||{})])){const before=original.filePolicies?.[name],after=next.filePolicies?.[name];const removed=!next.evidence.includes(name)||!!after?.deleted&&!before?.deleted;
  const replaced=original.evidenceData?.[name]?.data!==next.evidenceData?.[name]?.data;
  if((removed||replaced)&&before?.legalHold)return 'This evidence is under legal hold. Remove the hold through an authorized override before changing it.';
  if((removed||replaced)&&before?.retainUntil&&Date.parse(before.retainUntil+'T23:59:59Z')>Date.now())return 'The evidence retention period has not ended.';
  if((removed||!!before?.deleted!==!!after?.deleted)&&!canRecordAct(original,mod,session,'delete'))return 'An explicit delete permission is required.';
  if((before?.classification||'Internal')!==(after?.classification||'Internal')&&!canRecordAct(original,mod,session,'manage'))return 'Manage permission is required to change classification.';
  if(!!before?.legalHold!==!!after?.legalHold&&!canRecordAct(original,mod,session,'override'))return 'An explicit override permission is required to change legal hold.';
  if((before?.retainUntil||'')!==(after?.retainUntil||'')&&!canRecordAct(original,mod,session,'manage'))return 'Manage permission is required to change retention.';
  if(!!before?.locked!==!!after?.locked&&!canRecordAct(original,mod,session,'manage'))return 'Manage permission is required to change the file lock.';
  if((before?.approval||'Draft')!==(after?.approval||'Draft')&&!canRecordAct(original,mod,session,'manage'))return 'Manage permission is required to change file approval.';
 }
 return null;
}
