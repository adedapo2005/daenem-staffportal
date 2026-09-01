import { hasPermission, type AccessLevel, type AuthEnv, type SessionContext } from './auth';
import { routeLogistics } from './logistics';

interface Env extends AuthEnv {}
const COMPANY='company-logistics';
const json=(body:Record<string,unknown>|unknown[],status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const ranks:Record<AccessLevel,number>={none:0,view:1,create:2,edit:3,approve:4,manage:5};
function allowed(c:SessionContext,code:string,level:AccessLevel='view'){return c.companies.some(company=>company.id===COMPANY)&&hasPermission(c,code,level,COMPANY)}
function elevated(c:SessionContext,level:AccessLevel):SessionContext{const permissions={...c.permissions};const companyPermissions={...c.companyPermissions,[COMPANY]:{...(c.companyPermissions[COMPANY]||{})}};if(ranks[permissions['logistics.access']||'none']<ranks[level])permissions['logistics.access']=level;if(ranks[companyPermissions[COMPANY]['logistics.access']||'none']<ranks[level])companyPermissions[COMPANY]['logistics.access']=level;return{...c,permissions,companyPermissions}}
function denied(label:string){return json({error:`${label} permission is required.`},403)}

async function enhancedTrips(env:Env,context:SessionContext){
 if(!allowed(context,'logistics.trip_execution','view')&&!allowed(context,'logistics.dispatch','view'))return denied('Trip');
 const rows=await env.DB.prepare(`
  SELECT t.id,t.trip_no AS tripNo,t.vehicle_id AS vehicleId,v.fleet_no AS fleetNo,v.registration_no AS registrationNo,
         t.driver_employee_id AS driverEmployeeId,d.display_name AS driverName,t.route_name AS routeName,t.origin,t.destination,
         t.planned_distance_km AS plannedDistanceKm,t.actual_distance_km AS actualDistanceKm,t.start_odometer_km AS startOdometerKm,
         t.end_odometer_km AS endOdometerKm,t.planned_departure_at AS plannedDepartureAt,t.departed_at AS departedAt,t.returned_at AS returnedAt,
         t.status,t.revenue_kobo AS revenueKobo,t.total_expense_kobo AS totalExpenseKobo,t.gross_profit_kobo AS grossProfitKobo,
         COUNT(ts.id) AS shipmentCount,GROUP_CONCAT(ts.shipment_id) AS shipmentIds
  FROM logistics_trips t
  JOIN logistics_vehicles v ON v.id=t.vehicle_id
  JOIN employees d ON d.id=t.driver_employee_id
  LEFT JOIN logistics_trip_shipments ts ON ts.trip_id=t.id
  WHERE t.company_id=?
  GROUP BY t.id
  ORDER BY t.updated_at DESC LIMIT 200
 `).bind(COMPANY).all<Record<string,unknown>>();
 return json({trips:(rows.results||[]).map(row=>({...row,shipmentIds:row.shipmentIds?String(row.shipmentIds).split(','):[]}))});
}

async function scopedPod(request:Request,env:Env,context:SessionContext){
 if(!allowed(context,'logistics.pod','create'))return denied('Proof of delivery');
 const clone=request.clone();
 let body:{shipmentId?:string;tripId?:string};
 try{body=await clone.json()}catch{return json({error:'Invalid proof of delivery.'},400)}
 if(body.tripId&&body.shipmentId){
  const assigned=await env.DB.prepare(`SELECT 1 AS ok FROM logistics_trip_shipments ts JOIN logistics_trips t ON t.id=ts.trip_id WHERE ts.trip_id=? AND ts.shipment_id=? AND t.company_id=? LIMIT 1`).bind(body.tripId,body.shipmentId,COMPANY).first<{ok:number}>();
  if(!assigned)return json({error:'The selected shipment is not assigned to this trip.'},409);
 }
 return routeLogistics(request,env,elevated(context,'create'));
}

export async function routeLogisticsV2(request:Request,env:Env,context:SessionContext):Promise<Response|null>{
 const url=new URL(request.url),p=url.pathname,m=request.method;
 if(p==='/api/logistics/dashboard'&&m==='GET'){
  if(!allowed(context,'logistics.shipments','view')&&!allowed(context,'logistics.trip_execution','view')&&!allowed(context,'logistics.fleet','view'))return denied('Logistics');
  return routeLogistics(request,env,elevated(context,'view'));
 }
 if(p==='/api/logistics/fleet'&&m==='GET'){
  if(!allowed(context,'logistics.fleet','view'))return denied('Fleet');
  return routeLogistics(request,env,elevated(context,'view'));
 }
 if(p==='/api/logistics/fleet'&&m==='POST'){
  if(!allowed(context,'logistics.fleet','manage'))return denied('Manage fleet');
  return routeLogistics(request,env,elevated(context,'manage'));
 }
 if(p==='/api/logistics/shipments'&&m==='GET'){
  if(!allowed(context,'logistics.shipments','view'))return denied('Shipment');
  return routeLogistics(request,env,elevated(context,'view'));
 }
 if(p==='/api/logistics/shipments'&&m==='POST'){
  if(!allowed(context,'logistics.shipments','create'))return denied('Create shipment');
  return routeLogistics(request,env,elevated(context,'create'));
 }
 if(p==='/api/logistics/trips'&&m==='GET')return enhancedTrips(env,context);
 if(p==='/api/logistics/trips'&&m==='POST'){
  if(!allowed(context,'logistics.dispatch','edit'))return denied('Dispatch');
  return routeLogistics(request,env,elevated(context,'edit'));
 }
 if(p==='/api/logistics/trips/update'&&m==='POST'){
  if(!allowed(context,'logistics.trip_execution','create')&&!allowed(context,'logistics.dispatch','edit'))return denied('Trip execution');
  return routeLogistics(request,env,elevated(context,allowed(context,'logistics.dispatch','edit')?'edit':'create'));
 }
 if(p==='/api/logistics/trips/expense'&&m==='POST'){
  if(!allowed(context,'logistics.trip_expense','create'))return denied('Trip expense');
  return routeLogistics(request,env,elevated(context,'create'));
 }
 if(p==='/api/logistics/fuel'&&m==='POST'){
  if(!allowed(context,'logistics.trip_expense','create'))return denied('Fuel log');
  return routeLogistics(request,env,elevated(context,'create'));
 }
 if(p==='/api/logistics/pod'&&m==='POST')return scopedPod(request,env,context);
 return null;
}
