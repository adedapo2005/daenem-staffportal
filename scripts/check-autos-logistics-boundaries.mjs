import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const autos = read('worker/autos-v2.ts');
const autosV3 = read('worker/autos-v3.ts');
const logistics = read('worker/logistics.ts');
const logisticsV2 = read('worker/logistics-v2.ts');
const assertions = [];

function check(name, condition) {
  assertions.push({ name, ok: Boolean(condition) });
  if (!condition) process.exitCode = 1;
}

check('Autos dashboard is permission composed', autosV3.includes("return scopedDashboard(env,context)") && ["autos.stock","autos.sales_pipeline","autos.workshop"].every((code) => autosV3.includes(`access(context,'${code}','view')`)));
check('Autos dashboard does not delegate broad metrics', !/dashboard'[\s\S]{0,260}routeAutosV2/.test(autosV3));
check('Autos lead vehicle references stay in company', autos.includes("SELECT id FROM auto_vehicles WHERE id=? AND company_id=?") && autos.indexOf("SELECT id FROM auto_vehicles WHERE id=? AND company_id=?") < autos.indexOf("INSERT INTO auto_leads"));
check('Autos activity writes require a company lead', autos.includes("SELECT id FROM auto_leads WHERE id=? AND company_id=?") && autos.indexOf("if (!lead) return json({ error: 'Lead not found.' }, 404)") < autos.indexOf("INSERT INTO auto_lead_activities"));
check('Autos sale references and updates stay in company', autos.includes("SELECT id FROM customers WHERE id=? AND company_id=?") && autos.includes("UPDATE auto_leads SET status='won',updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?") && autos.includes("WHERE id=? AND company_id=? AND status='ready' AND NOT EXISTS (SELECT 1 FROM auto_sales s WHERE s.vehicle_id=auto_vehicles.id AND s.company_id=auto_vehicles.company_id AND s.sale_status!='cancelled')`).bind(salePrice"));
check('Autos movement vehicle and driver references stay in company', autos.includes("SELECT 1 AS ok FROM employee_company_memberships WHERE employee_id=? AND company_id=? AND active=1") && autos.indexOf("if (!vehicle) return json({ error: 'Vehicle not found.' }, 404)", autos.indexOf("async function recordMovement")) < autos.indexOf("INSERT INTO auto_vehicle_movements"));
check('Logistics dashboard is permission composed', logisticsV2.includes("return scopedDashboard(env,context)") && ["logistics.fleet","logistics.shipments","logistics.trip_execution","logistics.dispatch"].every((code) => logisticsV2.includes(`allowed(context,'${code}','view')`)));
check('Logistics dashboard does not delegate broad metrics', !/dashboard'[\s\S]{0,360}routeLogistics/.test(logisticsV2));
check('Logistics trip expenses require an assigned company trip', logistics.includes("SELECT id,driver_employee_id AS driverEmployeeId FROM logistics_trips WHERE id=? AND company_id=?") && logistics.includes("!dispatchEdit && trip.driverEmployeeId !== context.employee.id") && logistics.indexOf("if (!trip || (!dispatchEdit && trip.driverEmployeeId !== context.employee.id)) return json({ error: 'Trip not found.' }, 404)", logistics.indexOf("async function addExpense")) < logistics.indexOf("INSERT INTO logistics_trip_expenses"));
check('Logistics fuel vehicle stays in company', logistics.includes("SELECT id FROM logistics_vehicles WHERE id=? AND company_id=?"));
check('Logistics fuel trip is assigned and matches its company vehicle', logistics.includes("SELECT id,vehicle_id AS vehicleId,driver_employee_id AS driverEmployeeId FROM logistics_trips WHERE id=? AND company_id=?") && logistics.includes("if (!body.tripId && !dispatchEdit)") && logistics.includes("trip.vehicleId !== body.vehicleId"));
check('Logistics recalculation remains company scoped', logistics.includes("logistics_trip_expenses WHERE trip_id=? AND company_id=?") && logistics.includes("logistics_fuel_logs WHERE trip_id=? AND company_id=?") && logistics.includes("WHERE id=? AND company_id=?`).bind(total"));
check('Logistics proof of delivery requires the assigned trip relation', logisticsV2.includes("ts.trip_id=? AND ts.shipment_id=? AND t.company_id=? AND (?=1 OR t.driver_employee_id=?)") && logisticsV2.includes("if(!assigned)return json({error:'Shipment not found.'},404)"));
check('Autos joins and follow-up mutations repeat company scope', autos.includes('av.id=l.vehicle_id AND av.company_id=l.company_id') && autos.includes('av.id=w.vehicle_id AND av.company_id=w.company_id') && autos.includes("WHERE id=? AND company_id=? AND status='repair'"));
check('Logistics state mutations repeat company scope', logistics.includes("WHERE company_id=? AND id IN (SELECT shipment_id") && logistics.includes("WHERE id=? AND company_id=?") && logistics.includes("s.company_id=? AND s.proof_of_delivery_required=1"));
check('Logistics driver shipment reads are assignment scoped', logisticsV2.includes("return scopedShipments(env,context)") && logisticsV2.includes("t.driver_employee_id=?") && logisticsV2.includes("driverScoped?1:0"));
check('Logistics shipment finance requires target-company dispatch permission', logisticsV2.includes("const financialColumns=dispatchView?'") && logisticsV2.includes("deliveryWindowEnd${financialColumns},s.status"));
check('Logistics driver trip reads are assignment scoped', logisticsV2.includes("WHERE t.company_id=? AND (?=1 OR t.driver_employee_id=?)") && logisticsV2.includes("dispatchView?1:0,context.employee.id"));
check('Logistics driver trip finance is withheld', logisticsV2.includes("const financialColumns=dispatchView?") && logisticsV2.includes("t.status${financialColumns},COUNT"));
check('Logistics unassigned trip mutations use neutral denial', logistics.includes("if (!ownerLike && trip.driverEmployeeId !== context.employee.id) return json({ error: 'Trip not found.' }, 404)"));
check('All granular permission checks use company authority', autosV3.includes("hasPermission(context,code,minimum,COMPANY)") && logisticsV2.includes("hasPermission(c,code,level,COMPANY)"));

for (const result of assertions) console.log(`${result.ok ? '✓' : '✗'} ${result.name}`);
if (process.exitCode) console.error(`\n${assertions.filter((item) => !item.ok).length} Autos/Logistics boundary assertion(s) failed.`);
else console.log(`\n${assertions.length} Autos/Logistics boundary assertions passed.`);
