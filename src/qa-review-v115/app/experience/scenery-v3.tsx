'use client';
import {WorldClockCenter} from './auth-v3';

export const dashboardArt = [
  {name:'Executive Command'},
  {name:'Workspace Canvas'},
  {name:'Operational Cockpit'},
  {name:'Insight Magazine'},
  {name:'Master–Detail Workspace'},
  {name:'Horizon Wide'},
  {name:'Adaptive Bento'},
  {name:'Focus Flow'},
  {name:'Enterprise Studio'},
  {name:'Board Pulse'},
];

export function WorkspaceScenery({layout,name,employee}:{layout:number;name:string;employee:boolean}){
  const art=dashboardArt[layout]||dashboardArt[0];
  return <section className={`v3-workspace-scene scene-layout-${layout}`} aria-label={`${art.name} welcome`}>
    <div className="v3-workspace-welcome"><span className="p-kicker">{employee?'MY WORKSPACE':'A CONNECTED DAENEM'}</span><h1>Welcome back,<br/><span>{name.split(' ')[0]}.</span></h1><p>{employee?'A clear view of your day.':'People. Decisions. A shared direction.'}</p></div>
    <div className="v3-workspace-clocks"><WorldClockCenter ids={['ibadan','london']} compact/></div>
  </section>;
}
