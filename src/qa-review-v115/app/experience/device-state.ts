'use client';
import {useCallback,useSyncExternalStore,type Dispatch,type SetStateAction} from 'react';

const deviceStateMemory=new Map<string,unknown>();
const deviceStateListeners=new Map<string,Set<()=>void>>();

function storageKey(key:string){return 'daenem-draft-'+key;}
function readDeviceState<T>(key:string,initial:T):T{
 if(deviceStateMemory.has(key))return deviceStateMemory.get(key) as T;
 if(typeof window==='undefined')return initial;
 try{
  const raw=window.localStorage.getItem(storageKey(key));
  const value=raw?JSON.parse(raw) as T:initial;
  deviceStateMemory.set(key,value);
  return value;
 }catch{return initial;}
}

function publishDeviceState(key:string){
 deviceStateListeners.get(key)?.forEach(notify=>notify());
}

/** Clear route-stable draft memory whenever the signed-in permission projection changes. */
export function purgeDeviceStateMemory(){
 const keys=[...deviceStateMemory.keys()];
 deviceStateMemory.clear();
 keys.forEach(publishDeviceState);
}

/** Explicitly device-local demo drafts. Never store credentials or actual auth tokens. */
export function useDeviceState<T>(key:string,initial:T):[T,Dispatch<SetStateAction<T>>]{
 const subscribe=useCallback((notify:()=>void)=>{
  const listeners=deviceStateListeners.get(key)??new Set<()=>void>();
  listeners.add(notify);
  deviceStateListeners.set(key,listeners);
  return ()=>{
   listeners.delete(notify);
   if(!listeners.size)deviceStateListeners.delete(key);
  };
 },[key]);
 const getSnapshot=useCallback(()=>readDeviceState(key,initial),[initial,key]);
 const getServerSnapshot=useCallback(()=>initial,[initial]);
 const value=useSyncExternalStore(subscribe,getSnapshot,getServerSnapshot);

 const setValue=useCallback<Dispatch<SetStateAction<T>>>((next)=>{
  const current=readDeviceState(key,initial);
  const value=typeof next==='function'?(next as (value:T)=>T)(current):next;
  deviceStateMemory.set(key,value);
  try{window.localStorage.setItem(storageKey(key),JSON.stringify(value));}
  catch{window.dispatchEvent(new Event('daenem-storage-warning'));}
  publishDeviceState(key);
 },[initial,key]);

 return [value,setValue];
}
