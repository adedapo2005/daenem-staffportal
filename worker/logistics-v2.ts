import { hasPermission, type AccessLevel, type AuthEnv, type SessionContext } from './auth';
import { routeLogistics } from './logistics';

interface Env extends AuthEnv {}
const COMPANY='company-logistics';
const json=(body:Record<string,unknown>|unknown[],status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const ranks:Record<AccessLevel,number>={none:0,view:1,create:2,edit:3,approve:4,manage:5};
function allowed(c:SessionContext,code:string,level:AccessLevel='view'){return c.companies.some(company=>company.id===COMPANY)&&hasPermission(c,code,level,COMPANY)}
function elevated(c:SessionContext,level:AccessLevel):SessionContext{const permissions={...c.permissions};const companyPermissions={...c.companyPermissions,[COMPANY]:{...(c.companyPermissions[COMPANY]||{})}};if(ranks[permissions['logistics.access']||'none']<ranks[level])permissions['logistics.access']=level;if(ranks[companyPermissions[COMPANY]['logistics.access']||'none']<ranks[level])companyPermissions[COMPANY]['logistics.access']=level;return{...c,permissions,companyPermissions}}
function denied(label:string){return json({error:`${label} permission is required.`},403)}
function nigeriaDate(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Lagos',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}

async function scopedDashboard(env:Env,context:SessionContext){
 const metrics:Record<string,number>={};
 const dispatchView=allowed(context,'logistics.dispatch','view');
 const driverScoped=context.roles.some(role=>role.code==='driver')&&!dispatchView;
 if(allowed(context,'logistics.fleet','view')){
  const [fleet,docs]=await Promise.all([
   env.DB.prepare(`SELECT COUNT(*) AS total,SUM(CASE WHEN status='available' THEN 1 ELSE 0 END) AS available,SUM(CASE WHEN status IN ('maintenance','out_of_service') THEN 1 ELSE 0 END) AS unavailable FROM logistics_vehicles WHERE company_id=? AND status!='retired'`).bind(COMPANY).first<Record<string,number>>(),
   env.DB.prepare(`SELECT COUNT(*) AS expiring FROM logistics_vehicle_documents d JOIN logistics_vehicles v ON v.id=d.vehicle_id WHERE v.company_id=? AND d.status!='superseded' AND d.expires_at IS NOT NULL AND date(d.expires_at)<=date('now','+30 days')`).bind(COMPANY).first<{expiring:number}>(),
  ]);
  Object.assign(metrics,{fleet:Number(fleet?.total||0),vehiclesAvailable:Number(fleet?.available||0),vehiclesUnavailable:Number(fleet?.unavailable||0),expiringDocuments:Number(docs?.expiring||0)});
 }
 if(allowed(context,'logistics.shipments','view')){
  const row=await env.DB.prepare(`SELECT COUNT(*) AS active,SUM(CASE WHEN s.status IN ('picked_up','in_transit','out_for_delivery') THEN 1 ELSE 0 END) AS moving,SUM(CASE WHEN s.status='delivered' AND date(s.updated_at)=? THEN 1 ELSE 0 END) AS deliveredToday FROM logistics_shipments s WHERE s.company_id=? AND s.status NOT IN ('cancelled','returned') AND (?=0 OR EXISTS(SELECT 1 FROM logistics_trip_shipments ts JOIN logistics_trips t ON t.id=ts.trip_id WHERE ts.shipment_id=s.id AND t.company_id=s.company_id AND t.driver_employee_id=?))`).bind(nigeriaDate(),COMPANY,driverScoped?1:0,context.employee.id).first<Record<string,number>>();
  Object.assign(metrics,{activeShipments:Number(row?.active||0),shipmentsMoving:Number(row?.moving||0),deliveredToday:Number(row?.deliveredToday||0)});
 }
 if(allowed(context,'logistics.trip_execution','view')||dispatchView){
  const row=await env.DB.prepare(`SELECT COUNT(*) AS activeTrips FROM logistics_trips WHERE company_id=? AND status NOT IN ('cancelled') AND (?=1 OR driver_employee_id=?)`).bind(COMPANY,dispatchView?1:0,context.employee.id).first<Record<string,number>>();
  Object.assign(metrics,{activeTrips:Number(row?.activeTrips||0)});
 }
 if(dispatchView){
  const row=await env.DB.prepare(`SELECT COALESCE(SUM(CASE WHEN substr(COALESCE(departed_at,planned_departure_at),1,7)=substr(?,1,7) THEN revenue_kobo ELSE 0 END),0) AS revenueKobo,COALESCE(SUM(CASE WHEN substr(COALESCE(departed_at,planned_departure_at),1,7)=substr(?,1,7) THEN gross_profit_kobo ELSE 0 END),0) AS grossProfitKobo FROM logistics_trips WHERE company_id=? AND status NOT IN ('cancelled')`).bind(nigeriaDate(),nigeriaDate(),COMPANY).first<Record<string,number>>();
  Object.assign(metrics,{monthlyRevenueKobo:Number(row?.revenueKobo||0),monthlyGrossProfitKobo:Number(row?.grossProfitKobo||0)});
 }
 return json({metrics});
}

async function scopedShipments(env:Env,context:SessionContext){
 const dispatchView=allowed(context,'logistics.dispatch','view');
 const driverScoped=context.roles.some(role=>role.code==='driver')&&!dispatchView;
 const financialColumns=dispatchView?',s.quoted_kobo AS quotedKobo,s.invoiced_kobo AS invoicedKobo,s.amount_paid_kobo AS amountPaidKobo':'';
 const rows=await env.DB.prepare(`
  SELECT s.id,s.shipment_no AS shipmentNo,s.reference,s.cargo_description AS cargoDescription,s.weight_kg AS weightKg,s.pieces,
         s.pickup_name AS pickupName,s.pickup_address AS pickupAddress,s.delivery_name AS deliveryName,s.delivery_address AS deliveryAddress,
         s.pickup_window_start AS pickupWindowStart,s.delivery_window_end AS deliveryWindowEnd${financialColumns},s.status,s.priority,
         s.proof_of_delivery_required AS proofOfDeliveryRequired,s.created_at AS createdAt,c.name AS customerName
  FROM logistics_shipments s
  LEFT JOIN customers c ON c.id=s.customer_id AND c.company_id=s.company_id
  WHERE s.company_id=? AND (?=0 OR EXISTS(
   SELECT 1 FROM logistics_trip_shipments ts JOIN logistics_trips t ON t.id=ts.trip_id
   WHERE ts.shipment_id=s.id AND t.company_id=s.company_id AND t.driver_employee_id=?
  ))
  ORDER BY CASE s.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 ELSE 2 END,s.updated_at DESC LIMIT 300
 `).bind(COMPANY,driverScoped?1:0,context.employee.id).all<Record<string,unknown>>();
 return json({shipments:rows.results||[]});
}

async function enhancedTrips(env:Env,context:SessionContext){
 const dispatchView=allowed(context,'logistics.dispatch','view');
 if(!allowed(context,'logistics.trip_execution','view')&&!dispatchView)return denied('Trip');
 const financialColumns=dispatchView?',t.revenue_kobo AS revenueKobo,t.total_expense_kobo AS totalExpenseKobo,t.gross_profit_kobo AS grossProfitKobo':'';
 const rows=await env.DB.prepare(`
  SELECT t.id,t.trip_no AS tripNo,t.vehicle_id AS vehicleId,v.fleet_no AS fleetNo,v.registration_no AS registrationNo,
         t.driver_employee_id AS driverEmployeeId,d.display_name AS driverName,t.route_name AS routeName,t.origin,t.destination,
         t.planned_distance_km AS plannedDistanceKm,t.actual_distance_km AS actualDistanceKm,t.start_odometer_km AS startOdometerKm,
         t.end_odometer_km AS endOdometerKm,t.planned_departure_at AS plannedDepartureAt,t.departed_at AS departedAt,t.returned_at AS returnedAt,
         t.status${financialColumns},COUNT(ts.id) AS shipmentCount,GROUP_CONCAT(ts.shipment_id) AS shipmentIds
  FROM logistics_trips t
  JOIN logistics_vehicles v ON v.id=t.vehicle_id AND v.company_id=t.company_id
  JOIN employees d ON d.id=t.driver_employee_id
  LEFT JOIN logistics_trip_shipments ts ON ts.trip_id=t.id
  WHERE t.company_id=? AND (?=1 OR t.driver_employee_id=?)
  GROUP BY t.id
  ORDER BY t.updated_at DESC LIMIT 200
 `).bind(COMPANY,dispatchView?1:0,context.employee.id).all<Record<string,unknown>>();
 return json({trips:(rows.results||[]).map(row=>({...row,shipmentIds:row.shipmentIds?String(row.shipmentIds).split(','):[]}))});
}

async function scopedPod(request:Request,env:Env,context:SessionContext){
 if(!allowed(context,'logistics.pod','create'))return denied('Proof of delivery');
 const clone=request.clone();
 let body:{shipmentId?:string;tripId?:string};
 try{body=await clone.json()}catch{return json({error:'Invalid proof of delivery.'},400)}
 const broadPod=allowed(context,'logistics.dispatch','edit')||allowed(context,'logistics.pod','manage');
 if(!body.tripId||!body.shipmentId)return json({error:'Shipment not found.'},404);
 const assigned=await env.DB.prepare(`SELECT 1 AS ok FROM logistics_trip_shipments ts JOIN logistics_trips t ON t.id=ts.trip_id WHERE ts.trip_id=? AND ts.shipment_id=? AND t.company_id=? AND (?=1 OR t.driver_employee_id=?) LIMIT 1`).bind(body.tripId,body.shipmentId,COMPANY,broadPod?1:0,context.employee.id).first<{ok:number}>();
 if(!assigned)return json({error:'Shipment not found.'},404);
 return routeLogistics(request,env,elevated(context,'create'));
}

export async function routeLogisticsV2(request:Request,env:Env,context:SessionContext):Promise<Response|null>{
 const url=new URL(request.url),p=url.pathname,m=request.method;
 if(p==='/api/logistics/dashboard'&&m==='GET'){
  if(!allowed(context,'logistics.shipments','view')&&!allowed(context,'logistics.trip_execution','view')&&!allowed(context,'logistics.dispatch','view')&&!allowed(context,'logistics.fleet','view'))return denied('Logistics');
  return scopedDashboard(env,context);
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
  return scopedShipments(env,context);
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
