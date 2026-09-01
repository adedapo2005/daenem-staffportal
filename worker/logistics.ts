import { hasPermission, type AuthEnv, type SessionContext } from './auth';

interface LogisticsEnv extends AuthEnv {}
type Level = 'view' | 'create' | 'edit' | 'approve' | 'manage';
const COMPANY = 'company-logistics';
const json = (body: Record<string, unknown> | unknown[], status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const uid = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
const kobo = (naira: unknown) => Math.round(Math.max(0, Number(naira || 0)) * 100);
const hasCompany = (context: SessionContext) => context.companies.some((company) => company.id === COMPANY);
const can = (context: SessionContext, level: Level = 'view') => hasCompany(context) && hasPermission(context, 'logistics.access', level, COMPANY);
const canTrack = (context: SessionContext, level: Level = 'view') => hasCompany(context) && hasPermission(context, 'tracking.access', level, COMPANY);

function nigeriaDate() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

async function nextNo(env: LogisticsEnv, prefix: string, table: 'logistics_shipments' | 'logistics_trips', column: 'shipment_no' | 'trip_no') {
  const day = nigeriaDate().replaceAll('-', '');
  const pattern = `${prefix}-${day}-%`;
  const row = await env.DB.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE ${column} LIKE ?`).bind(pattern).first<{ count: number }>();
  return `${prefix}-${day}-${String(Number(row?.count || 0) + 1).padStart(4, '0')}`;
}

async function recalcTrip(env: LogisticsEnv, tripId: string) {
  const trip = await env.DB.prepare(`SELECT revenue_kobo AS revenueKobo FROM logistics_trips WHERE id=? AND company_id=?`).bind(tripId, COMPANY).first<{ revenueKobo: number }>();
  if (!trip) return;
  const expenses = await env.DB.prepare(`SELECT COALESCE(SUM(amount_kobo),0) AS amount FROM logistics_trip_expenses WHERE trip_id=?`).bind(tripId).first<{ amount: number }>();
  const fuel = await env.DB.prepare(`SELECT COALESCE(SUM(amount_kobo),0) AS amount FROM logistics_fuel_logs WHERE trip_id=?`).bind(tripId).first<{ amount: number }>();
  const total = Number(expenses?.amount || 0) + Number(fuel?.amount || 0);
  await env.DB.prepare(`UPDATE logistics_trips SET total_expense_kobo=?,gross_profit_kobo=?-?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(total, Number(trip.revenueKobo || 0), total, tripId).run();
}

async function dashboard(env: LogisticsEnv, context: SessionContext) {
  if (!can(context)) return json({ error: 'Daenem Logistics access is not assigned.' }, 403);
  const fleet = await env.DB.prepare(`SELECT COUNT(*) AS total,SUM(CASE WHEN status='available' THEN 1 ELSE 0 END) AS available,SUM(CASE WHEN status IN ('maintenance','out_of_service') THEN 1 ELSE 0 END) AS unavailable FROM logistics_vehicles WHERE company_id=? AND status!='retired'`).bind(COMPANY).first<Record<string, number>>();
  const shipments = await env.DB.prepare(`SELECT COUNT(*) AS active,SUM(CASE WHEN status IN ('picked_up','in_transit','out_for_delivery') THEN 1 ELSE 0 END) AS moving,SUM(CASE WHEN status='delivered' AND date(updated_at)=? THEN 1 ELSE 0 END) AS deliveredToday FROM logistics_shipments WHERE company_id=? AND status NOT IN ('cancelled','returned')`).bind(nigeriaDate(), COMPANY).first<Record<string, number>>();
  const trips = await env.DB.prepare(`SELECT COUNT(*) AS activeTrips,COALESCE(SUM(CASE WHEN substr(COALESCE(departed_at,planned_departure_at),1,7)=substr(?,1,7) THEN revenue_kobo ELSE 0 END),0) AS revenueKobo,COALESCE(SUM(CASE WHEN substr(COALESCE(departed_at,planned_departure_at),1,7)=substr(?,1,7) THEN gross_profit_kobo ELSE 0 END),0) AS grossProfitKobo FROM logistics_trips WHERE company_id=? AND status NOT IN ('cancelled')`).bind(nigeriaDate(), nigeriaDate(), COMPANY).first<Record<string, number>>();
  const docs = await env.DB.prepare(`SELECT COUNT(*) AS expiring FROM logistics_vehicle_documents d JOIN logistics_vehicles v ON v.id=d.vehicle_id WHERE v.company_id=? AND d.status!='superseded' AND d.expires_at IS NOT NULL AND date(d.expires_at)<=date('now','+30 days')`).bind(COMPANY).first<{ expiring: number }>();
  return json({ metrics: { fleet: Number(fleet?.total || 0), vehiclesAvailable: Number(fleet?.available || 0), vehiclesUnavailable: Number(fleet?.unavailable || 0), activeShipments: Number(shipments?.active || 0), shipmentsMoving: Number(shipments?.moving || 0), deliveredToday: Number(shipments?.deliveredToday || 0), activeTrips: Number(trips?.activeTrips || 0), monthlyRevenueKobo: Number(trips?.revenueKobo || 0), monthlyGrossProfitKobo: Number(trips?.grossProfitKobo || 0), expiringDocuments: Number(docs?.expiring || 0) } });
}

async function fleet(env: LogisticsEnv, context: SessionContext) {
  if (!can(context)) return json({ error: 'Logistics access is required.' }, 403);
  const vehicles = await env.DB.prepare(`SELECT id,fleet_no AS fleetNo,registration_no AS registrationNo,make,model,year,vehicle_type AS vehicleType,capacity_kg AS capacityKg,odometer_km AS odometerKm,fuel_type AS fuelType,insurance_expires_at AS insuranceExpiresAt,roadworthiness_expires_at AS roadworthinessExpiresAt,status,gps_device_id AS gpsDeviceId FROM logistics_vehicles WHERE company_id=? ORDER BY status,fleet_no`).bind(COMPANY).all<Record<string, unknown>>();
  const drivers = await env.DB.prepare(`SELECT e.id AS employeeId,e.display_name AS displayName,e.phone,dp.driver_license_no AS driverLicenseNo,dp.license_expires_at AS licenseExpiresAt,dp.driving_status AS drivingStatus,dp.safety_score AS safetyScore FROM employee_company_memberships m JOIN employees e ON e.id=m.employee_id LEFT JOIN logistics_driver_profiles dp ON dp.employee_id=e.id WHERE m.company_id=? AND m.active=1 AND e.employment_status='active' AND EXISTS(SELECT 1 FROM employee_roles er JOIN roles r ON r.id=er.role_id WHERE er.employee_id=e.id AND r.code='driver') ORDER BY e.display_name`).bind(COMPANY).all<Record<string, unknown>>();
  return json({ vehicles: vehicles.results || [], drivers: drivers.results || [] });
}

async function createFleetVehicle(request: Request, env: LogisticsEnv, context: SessionContext) {
  if (!can(context, 'manage')) return json({ error: 'Manage Logistics permission is required.' }, 403);
  let body: { fleetNo?: string; registrationNo?: string; vin?: string; make?: string; model?: string; year?: number; vehicleType?: string; capacityKg?: number; odometerKm?: number; fuelType?: string; insuranceExpiresAt?: string; roadworthinessExpiresAt?: string; registrationExpiresAt?: string; gpsDeviceId?: string };
  try { body = await request.json(); } catch { return json({ error: 'Invalid fleet vehicle request.' }, 400); }
  if (!String(body.fleetNo || '').trim()) return json({ error: 'Fleet number is required.' }, 400);
  const id = uid('logistics-vehicle');
  try {
    await env.DB.prepare(`INSERT INTO logistics_vehicles(id,company_id,location_id,fleet_no,registration_no,vin,make,model,year,vehicle_type,capacity_kg,odometer_km,fuel_type,insurance_expires_at,roadworthiness_expires_at,registration_expires_at,gps_device_id) VALUES(?,?,'location-logistics-hq',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id, COMPANY, body.fleetNo, body.registrationNo || null, body.vin || null, body.make || null, body.model || null, body.year ?? null, body.vehicleType || 'van', body.capacityKg ?? null, body.odometerKm ?? 0, body.fuelType || null, body.insuranceExpiresAt || null, body.roadworthinessExpiresAt || null, body.registrationExpiresAt || null, body.gpsDeviceId || null).run();
  } catch { return json({ error: 'Fleet or registration number may already exist.' }, 409); }
  return json({ ok: true, vehicle: { id, fleetNo: body.fleetNo, status: 'available' } }, 201);
}

async function shipments(env: LogisticsEnv, context: SessionContext) {
  if (!can(context)) return json({ error: 'Logistics access is required.' }, 403);
  const rows = await env.DB.prepare(`SELECT s.id,s.shipment_no AS shipmentNo,s.reference,s.cargo_description AS cargoDescription,s.weight_kg AS weightKg,s.pieces,s.pickup_name AS pickupName,s.pickup_address AS pickupAddress,s.delivery_name AS deliveryName,s.delivery_address AS deliveryAddress,s.pickup_window_start AS pickupWindowStart,s.delivery_window_end AS deliveryWindowEnd,s.quoted_kobo AS quotedKobo,s.invoiced_kobo AS invoicedKobo,s.amount_paid_kobo AS amountPaidKobo,s.status,s.priority,s.proof_of_delivery_required AS proofOfDeliveryRequired,s.created_at AS createdAt,c.name AS customerName FROM logistics_shipments s LEFT JOIN customers c ON c.id=s.customer_id WHERE s.company_id=? ORDER BY CASE s.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 ELSE 2 END,s.updated_at DESC LIMIT 300`).bind(COMPANY).all<Record<string, unknown>>();
  return json({ shipments: rows.results || [] });
}

async function createShipment(request: Request, env: LogisticsEnv, context: SessionContext) {
  if (!can(context, 'create')) return json({ error: 'Create Logistics permission is required.' }, 403);
  let body: { customerId?: string; reference?: string; cargoDescription?: string; cargoType?: string; weightKg?: number; pieces?: number; declaredValueNaira?: number; pickupName?: string; pickupPhone?: string; pickupAddress?: string; deliveryName?: string; deliveryPhone?: string; deliveryAddress?: string; pickupWindowStart?: string; pickupWindowEnd?: string; deliveryWindowStart?: string; deliveryWindowEnd?: string; quotedNaira?: number; priority?: string; podRequired?: boolean };
  try { body = await request.json(); } catch { return json({ error: 'Invalid shipment request.' }, 400); }
  if (!String(body.cargoDescription || '').trim() || !String(body.pickupAddress || '').trim() || !String(body.deliveryAddress || '').trim()) return json({ error: 'Cargo description, pickup address and delivery address are required.' }, 400);
  const id = uid('shipment');
  const shipmentNo = await nextNo(env, 'SHIP', 'logistics_shipments', 'shipment_no');
  await env.DB.prepare(`INSERT INTO logistics_shipments(id,company_id,customer_id,shipment_no,reference,cargo_description,cargo_type,weight_kg,pieces,declared_value_kobo,pickup_name,pickup_phone,pickup_address,delivery_name,delivery_phone,delivery_address,pickup_window_start,pickup_window_end,delivery_window_start,delivery_window_end,quoted_kobo,status,priority,proof_of_delivery_required,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'requested',?,?,?)`).bind(id, COMPANY, body.customerId || null, shipmentNo, body.reference || null, body.cargoDescription, body.cargoType || null, body.weightKg ?? null, body.pieces ?? null, body.declaredValueNaira == null ? null : kobo(body.declaredValueNaira), body.pickupName || null, body.pickupPhone || null, body.pickupAddress, body.deliveryName || null, body.deliveryPhone || null, body.deliveryAddress, body.pickupWindowStart || null, body.pickupWindowEnd || null, body.deliveryWindowStart || null, body.deliveryWindowEnd || null, kobo(body.quotedNaira), body.priority || 'normal', body.podRequired === false ? 0 : 1, context.employee.id).run();
  return json({ ok: true, shipment: { id, shipmentNo, status: 'requested' } }, 201);
}

async function trips(env: LogisticsEnv, context: SessionContext) {
  if (!can(context)) return json({ error: 'Logistics access is required.' }, 403);
  const rows = await env.DB.prepare(`SELECT t.id,t.trip_no AS tripNo,t.vehicle_id AS vehicleId,v.fleet_no AS fleetNo,v.registration_no AS registrationNo,t.driver_employee_id AS driverEmployeeId,d.display_name AS driverName,t.route_name AS routeName,t.origin,t.destination,t.planned_distance_km AS plannedDistanceKm,t.actual_distance_km AS actualDistanceKm,t.start_odometer_km AS startOdometerKm,t.end_odometer_km AS endOdometerKm,t.planned_departure_at AS plannedDepartureAt,t.departed_at AS departedAt,t.returned_at AS returnedAt,t.status,t.revenue_kobo AS revenueKobo,t.total_expense_kobo AS totalExpenseKobo,t.gross_profit_kobo AS grossProfitKobo,(SELECT COUNT(*) FROM logistics_trip_shipments ts WHERE ts.trip_id=t.id) AS shipmentCount FROM logistics_trips t JOIN logistics_vehicles v ON v.id=t.vehicle_id JOIN employees d ON d.id=t.driver_employee_id WHERE t.company_id=? ORDER BY t.updated_at DESC LIMIT 200`).bind(COMPANY).all<Record<string, unknown>>();
  return json({ trips: rows.results || [] });
}

async function createTrip(request: Request, env: LogisticsEnv, context: SessionContext) {
  if (!can(context, 'edit')) return json({ error: 'Edit Logistics permission is required to dispatch trips.' }, 403);
  let body: { vehicleId?: string; driverEmployeeId?: string; routeName?: string; origin?: string; destination?: string; plannedDistanceKm?: number; startOdometerKm?: number; plannedDepartureAt?: string; plannedReturnAt?: string; fuelBudgetNaira?: number; expenseBudgetNaira?: number; revenueNaira?: number; shipmentIds?: string[]; notes?: string };
  try { body = await request.json(); } catch { return json({ error: 'Invalid trip request.' }, 400); }
  if (!body.vehicleId || !body.driverEmployeeId) return json({ error: 'Vehicle and driver are required.' }, 400);
  const vehicle = await env.DB.prepare(`SELECT id,status,odometer_km AS odometerKm FROM logistics_vehicles WHERE id=? AND company_id=?`).bind(body.vehicleId, COMPANY).first<{ id: string; status: string; odometerKm: number }>();
  if (!vehicle || !['available','assigned'].includes(vehicle.status)) return json({ error: 'Selected vehicle is not available.' }, 409);
  const driver = await env.DB.prepare(`SELECT e.id FROM employees e JOIN employee_company_memberships m ON m.employee_id=e.id WHERE e.id=? AND m.company_id=? AND m.active=1 AND e.employment_status='active'`).bind(body.driverEmployeeId, COMPANY).first();
  if (!driver) return json({ error: 'Selected driver is not an active Daenem Logistics employee.' }, 404);
  const id = uid('trip');
  const tripNo = await nextNo(env, 'TRIP', 'logistics_trips', 'trip_no');
  const statements: D1PreparedStatement[] = [
    env.DB.prepare(`INSERT INTO logistics_trips(id,company_id,trip_no,vehicle_id,driver_employee_id,dispatcher_employee_id,route_name,origin,destination,planned_distance_km,start_odometer_km,planned_departure_at,planned_return_at,status,fuel_budget_kobo,expense_budget_kobo,revenue_kobo,notes,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'assigned',?,?,?,?,?)`).bind(id, COMPANY, tripNo, body.vehicleId, body.driverEmployeeId, context.employee.id, body.routeName || null, body.origin || null, body.destination || null, body.plannedDistanceKm ?? null, body.startOdometerKm ?? vehicle.odometerKm, body.plannedDepartureAt || null, body.plannedReturnAt || null, kobo(body.fuelBudgetNaira), kobo(body.expenseBudgetNaira), kobo(body.revenueNaira), body.notes || null, context.employee.id),
    env.DB.prepare(`UPDATE logistics_vehicles SET status='assigned',updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(body.vehicleId),
  ];
  let sequence = 1;
  for (const shipmentId of [...new Set(body.shipmentIds || [])]) {
    const shipment = await env.DB.prepare(`SELECT id FROM logistics_shipments WHERE id=? AND company_id=? AND status IN ('requested','quoted','approved','scheduled')`).bind(shipmentId, COMPANY).first();
    if (!shipment) continue;
    statements.push(env.DB.prepare(`INSERT INTO logistics_trip_shipments(id,trip_id,shipment_id,stop_sequence,stop_type) VALUES(?,?,?,?,'delivery')`).bind(uid('trip-shipment'), id, shipmentId, sequence++));
    statements.push(env.DB.prepare(`UPDATE logistics_shipments SET status='scheduled',updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(shipmentId));
  }
  await env.DB.batch(statements);
  return json({ ok: true, trip: { id, tripNo, status: 'assigned' } }, 201);
}

async function updateTrip(request: Request, env: LogisticsEnv, context: SessionContext) {
  if (!can(context, 'create')) return json({ error: 'Logistics trip permission is required.' }, 403);
  let body: { tripId?: string; action?: string; endOdometerKm?: number; note?: string };
  try { body = await request.json(); } catch { return json({ error: 'Invalid trip update.' }, 400); }
  const trip = await env.DB.prepare(`SELECT id,vehicle_id AS vehicleId,driver_employee_id AS driverEmployeeId,start_odometer_km AS startOdometerKm,status FROM logistics_trips WHERE id=? AND company_id=?`).bind(body.tripId || '', COMPANY).first<{ id: string; vehicleId: string; driverEmployeeId: string; startOdometerKm?: number; status: string }>();
  if (!trip) return json({ error: 'Trip not found.' }, 404);
  const ownerLike = can(context, 'edit');
  if (!ownerLike && trip.driverEmployeeId !== context.employee.id) return json({ error: 'Only the assigned driver or dispatcher/fleet manager can update this trip.' }, 403);
  if (body.action === 'start') {
    if (!['assigned','planned'].includes(trip.status)) return json({ error: 'Trip is not ready to start.' }, 409);
    await env.DB.batch([
      env.DB.prepare(`UPDATE logistics_trips SET status='in_progress',departed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(trip.id),
      env.DB.prepare(`UPDATE logistics_vehicles SET status='in_trip',updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(trip.vehicleId),
      env.DB.prepare(`UPDATE logistics_shipments SET status='in_transit',updated_at=CURRENT_TIMESTAMP WHERE id IN (SELECT shipment_id FROM logistics_trip_shipments WHERE trip_id=?)`).bind(trip.id),
    ]);
    return json({ ok: true, status: 'in_progress' });
  }
  if (body.action === 'complete') {
    if (trip.status !== 'in_progress') return json({ error: 'Only an in-progress trip can be completed.' }, 409);
    if (body.endOdometerKm == null || Number(body.endOdometerKm) < Number(trip.startOdometerKm || 0)) return json({ error: 'Valid end odometer is required.' }, 400);
    const pendingPod = await env.DB.prepare(`SELECT COUNT(*) AS count FROM logistics_trip_shipments ts JOIN logistics_shipments s ON s.id=ts.shipment_id WHERE ts.trip_id=? AND s.proof_of_delivery_required=1 AND NOT EXISTS(SELECT 1 FROM logistics_pod p WHERE p.shipment_id=s.id)`).bind(trip.id).first<{ count: number }>();
    if (Number(pendingPod?.count || 0) > 0) return json({ error: `${pendingPod?.count} shipment(s) still require proof of delivery before trip closeout.` }, 409);
    const distance = Math.max(0, Number(body.endOdometerKm) - Number(trip.startOdometerKm || 0));
    await env.DB.batch([
      env.DB.prepare(`UPDATE logistics_trips SET status='completed',end_odometer_km=?,actual_distance_km=?,returned_at=CURRENT_TIMESTAMP,notes=COALESCE(?,notes),updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(body.endOdometerKm, distance, body.note || null, trip.id),
      env.DB.prepare(`UPDATE logistics_vehicles SET status='available',odometer_km=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(body.endOdometerKm, trip.vehicleId),
    ]);
    await recalcTrip(env, trip.id);
    return json({ ok: true, status: 'completed', actualDistanceKm: distance });
  }
  return json({ error: 'Supported trip actions are start and complete.' }, 400);
}

async function addExpense(request: Request, env: LogisticsEnv, context: SessionContext) {
  if (!can(context, 'create')) return json({ error: 'Logistics trip permission is required.' }, 403);
  let body: { tripId?: string; expenseType?: string; description?: string; amountNaira?: number; latitude?: number; longitude?: number; occurredAt?: string };
  try { body = await request.json(); } catch { return json({ error: 'Invalid trip expense.' }, 400); }
  const types = ['fuel','toll','parking','loading','offloading','repair','allowance','accommodation','fine','other'];
  if (!body.tripId || !types.includes(String(body.expenseType)) || !String(body.description || '').trim()) return json({ error: 'Trip, expense type and description are required.' }, 400);
  await env.DB.prepare(`INSERT INTO logistics_trip_expenses(id,trip_id,company_id,expense_type,description,amount_kobo,latitude,longitude,occurred_at,recorded_by) VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(uid('trip-expense'), body.tripId, COMPANY, body.expenseType, body.description, kobo(body.amountNaira), body.latitude ?? null, body.longitude ?? null, body.occurredAt || new Date().toISOString(), context.employee.id).run();
  await recalcTrip(env, body.tripId);
  return json({ ok: true });
}

async function fuel(request: Request, env: LogisticsEnv, context: SessionContext) {
  if (!can(context, 'create')) return json({ error: 'Logistics trip permission is required.' }, 403);
  let body: { vehicleId?: string; tripId?: string; odometerKm?: number; litres?: number; amountNaira?: number; stationName?: string; reference?: string; latitude?: number; longitude?: number; fueledAt?: string };
  try { body = await request.json(); } catch { return json({ error: 'Invalid fuel log.' }, 400); }
  if (!body.vehicleId || Number(body.litres) <= 0) return json({ error: 'Vehicle and positive fuel litres are required.' }, 400);
  await env.DB.prepare(`INSERT INTO logistics_fuel_logs(id,company_id,vehicle_id,trip_id,driver_employee_id,odometer_km,litres,amount_kobo,station_name,reference,latitude,longitude,fueled_at,recorded_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(uid('fuel-log'), COMPANY, body.vehicleId, body.tripId || null, context.employee.id, body.odometerKm ?? null, body.litres, kobo(body.amountNaira), body.stationName || null, body.reference || null, body.latitude ?? null, body.longitude ?? null, body.fueledAt || new Date().toISOString(), context.employee.id).run();
  if (body.tripId) await recalcTrip(env, body.tripId);
  return json({ ok: true });
}

async function pod(request: Request, env: LogisticsEnv, context: SessionContext) {
  if (!can(context, 'create')) return json({ error: 'Logistics delivery permission is required.' }, 403);
  let body: { shipmentId?: string; tripId?: string; recipientName?: string; recipientPhone?: string; latitude?: number; longitude?: number; note?: string; deliveredAt?: string };
  try { body = await request.json(); } catch { return json({ error: 'Invalid proof of delivery.' }, 400); }
  if (!body.shipmentId || !String(body.recipientName || '').trim()) return json({ error: 'Shipment and recipient name are required.' }, 400);
  const shipment = await env.DB.prepare(`SELECT id FROM logistics_shipments WHERE id=? AND company_id=? AND status NOT IN ('cancelled','returned')`).bind(body.shipmentId, COMPANY).first();
  if (!shipment) return json({ error: 'Shipment not found.' }, 404);
  const requireGps = canTrack(context) || context.roles.some((role) => role.code === 'driver');
  if (requireGps && (body.latitude == null || body.longitude == null)) return json({ error: 'GPS location is required for this proof of delivery.' }, 400);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO logistics_pod(id,shipment_id,trip_id,recipient_name,recipient_phone,latitude,longitude,note,delivered_by,delivered_at) VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(uid('pod'), body.shipmentId, body.tripId || null, body.recipientName, body.recipientPhone || null, body.latitude ?? null, body.longitude ?? null, body.note || null, context.employee.id, body.deliveredAt || new Date().toISOString()),
    env.DB.prepare(`UPDATE logistics_shipments SET status='delivered',updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(body.shipmentId),
    ...(body.tripId ? [env.DB.prepare(`UPDATE logistics_trip_shipments SET stop_status='completed',arrived_at=COALESCE(arrived_at,CURRENT_TIMESTAMP),departed_at=CURRENT_TIMESTAMP WHERE trip_id=? AND shipment_id=?`).bind(body.tripId, body.shipmentId)] : []),
  ]);
  return json({ ok: true, status: 'delivered' });
}

export async function routeLogistics(request: Request, env: LogisticsEnv, context: SessionContext): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname === '/api/logistics/dashboard' && request.method === 'GET') return dashboard(env, context);
  if (url.pathname === '/api/logistics/fleet' && request.method === 'GET') return fleet(env, context);
  if (url.pathname === '/api/logistics/fleet' && request.method === 'POST') return createFleetVehicle(request, env, context);
  if (url.pathname === '/api/logistics/shipments' && request.method === 'GET') return shipments(env, context);
  if (url.pathname === '/api/logistics/shipments' && request.method === 'POST') return createShipment(request, env, context);
  if (url.pathname === '/api/logistics/trips' && request.method === 'GET') return trips(env, context);
  if (url.pathname === '/api/logistics/trips' && request.method === 'POST') return createTrip(request, env, context);
  if (url.pathname === '/api/logistics/trips/update' && request.method === 'POST') return updateTrip(request, env, context);
  if (url.pathname === '/api/logistics/trips/expense' && request.method === 'POST') return addExpense(request, env, context);
  if (url.pathname === '/api/logistics/fuel' && request.method === 'POST') return fuel(request, env, context);
  if (url.pathname === '/api/logistics/pod' && request.method === 'POST') return pod(request, env, context);
  return null;
}
