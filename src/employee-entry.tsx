import React,{useEffect,useState}from'react';
import{createRoot}from'react-dom/client';
import{UserRound}from'lucide-react';
import{api,type WorkforceContext}from'./auth';
import{EmployeeCenter}from'./employee-center';
import'./employee-entry.css';

function Launcher(){
 const[context,setContext]=useState<WorkforceContext|null>(null),[open,setOpen]=useState(false);
 useEffect(() => {
  let active = true;
  let latestRequest = 0;
  const refresh = async () => {
   const request = ++latestRequest;
   try {
    const response = await api<{ authenticated: boolean; context?: WorkforceContext }>('/api/auth/me');
    if (!active || request !== latestRequest) return;
    const next = response.authenticated === true && response.context?.employee?.id
     ? response.context : null;
    setContext(next);
    if (!next) setOpen(false);
   } catch {
    if (active && request === latestRequest) {
     setContext(null);
     setOpen(false);
    }
   }
  };
  void refresh();
  const focus = () => void refresh();
  // Portal logout emits before the server logout call completes.
  // Clear locally first; do not revalidate that still-live session mid-logout.
  const authChanged = () => {
   latestRequest++;
   setContext(null);
   setOpen(false);
  };
  window.addEventListener('focus', focus);
  window.addEventListener('daenem-auth-changed', authChanged);
  const timer = window.setInterval(() => void refresh(), 120000);
  return () => {
   active = false;
   latestRequest++;
   window.removeEventListener('focus', focus);
   window.removeEventListener('daenem-auth-changed', authChanged);
   window.clearInterval(timer);
  };
 }, []);
 if(!context)return null;
 return <><button className="employee-center-launcher" onClick={()=>setOpen(true)}><UserRound size={18}/><span>My Workspace</span></button>{open&&<EmployeeCenter context={context} onClose={()=>setOpen(false)}/>}</>;
}
const host=document.createElement('div');host.id='employee-center-launcher';document.body.appendChild(host);createRoot(host).render(<Launcher/>);
