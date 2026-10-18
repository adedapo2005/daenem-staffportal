'use client';
import {createContext,useContext} from 'react';
import type {Session,RecordData,Mode,ModuleDef} from './model';
import type {Preferences} from './Portal';
import type {AuditEvent} from './security-contract';

export interface LabContext {
    handoff:(row:RecordData,target:string,reason:string)=>boolean;
    importBatch:(rows:RecordData[])=>boolean;
    auditLog: AuditEvent[];
    audit:(action:string,target:string,before?:string,after?:string,reason?:string,type?:'business'|'security')=>void;
    session: Session;
    setSession: (s: Session) => void;
    records: RecordData[];
    mode: Mode;
    setMode: (s: Mode) => void;
    go: (id: string) => void;
    open: (r: RecordData, m?: ModuleDef) => void;
    create: (m: ModuleDef) => void;
    mutate: (r: RecordData, fields: Record<string, string>, status?: string, action?: string) => boolean;
    prefs: Preferences;
    setPrefs: (p: Preferences) => void;
    notice: (s: string) => void;
    signout: () => void;
    reauth: (action: () => void) => void;
}
export const Context = createContext<LabContext | null>(null);
export function useLab() { const c = useContext(Context); if (!c)
    throw new Error('Missing lab context'); return c; }
