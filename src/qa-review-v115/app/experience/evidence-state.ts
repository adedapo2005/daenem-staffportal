import type {RecordData} from './model';
/** Deleted attachments never satisfy workflow evidence requirements. */
export const activeEvidence=(row:RecordData)=>row.evidence.filter(name=>!row.filePolicies?.[name]?.deleted);
