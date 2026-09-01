PRAGMA foreign_keys = ON;

-- Granular operational permissions prevent broad company access from granting unrelated authority.
INSERT OR IGNORE INTO permissions(id,code,module,action,description,sensitive) VALUES
 ('perm-autos-stock','autos.stock','autos','stock','View or maintain vehicle stock records',0),
 ('perm-autos-costs','autos.costs','autos','costs','Record and approve vehicle landed-cost items',1),
 ('perm-autos-sales-pipeline','autos.sales_pipeline','autos','sales_pipeline','Manage vehicle leads, test drives, offers and sales pipeline',0),
 ('perm-autos-workshop','autos.workshop','autos','workshop','Work with workshop jobs, diagnosis, tasks and completion',0),
 ('perm-autos-movement','autos.movement','autos','movement','Record vehicle movements, key release and returns',0),
 ('perm-autos-gatepass','autos.gatepass','autos','gatepass','Approve vehicle exit and gate passes',1),
 ('perm-logistics-shipments','logistics.shipments','logistics','shipments','Create and maintain shipment orders',0),
 ('perm-logistics-dispatch','logistics.dispatch','logistics','dispatch','Assign vehicles, drivers and shipments to trips',1),
 ('perm-logistics-trip','logistics.trip_execution','logistics','trip_execution','Execute assigned trips and trip closeout',0),
 ('perm-logistics-pod','logistics.pod','logistics','pod','Capture proof of delivery',0),
 ('perm-logistics-expense','logistics.trip_expense','logistics','trip_expense','Record trip fuel and operational expenses',1),
 ('perm-logistics-fleet','logistics.fleet','logistics','fleet','Manage fleet vehicles, documents and maintenance',1),
 ('perm-properties-portfolio','properties.portfolio','properties','portfolio','Manage properties, units and listings',0),
 ('perm-properties-crm','properties.crm','properties','crm','Manage property enquiries, leads and follow-up',0),
 ('perm-properties-inspection','properties.inspections','properties','inspections','Schedule and record property inspections',0),
 ('perm-properties-lease','properties.leases','properties','leases','Create and manage lease/tenancy records',1),
 ('perm-properties-rent','properties.rent','properties','rent','View and record rent/service-charge receivables and payments',1),
 ('perm-properties-maintenance','properties.maintenance','properties','maintenance','Manage tenant/property maintenance requests',0);

-- Owner receives Manage access to every new permission automatically.
INSERT OR REPLACE INTO role_permissions(id,role_id,permission_id,access_level)
SELECT 'special-owner-' || p.id,'role-owner',p.id,'manage'
FROM permissions p
WHERE p.id IN (
 'perm-autos-stock','perm-autos-costs','perm-autos-sales-pipeline','perm-autos-workshop','perm-autos-movement','perm-autos-gatepass',
 'perm-logistics-shipments','perm-logistics-dispatch','perm-logistics-trip','perm-logistics-pod','perm-logistics-expense','perm-logistics-fleet',
 'perm-properties-portfolio','perm-properties-crm','perm-properties-inspection','perm-properties-lease','perm-properties-rent','perm-properties-maintenance'
);

-- Daenem Autos role defaults.
INSERT OR REPLACE INTO role_permissions(id,role_id,permission_id,access_level) VALUES
 ('auto-manager-stock-granular','role-autos-manager','perm-autos-stock','manage'),
 ('auto-manager-costs-granular','role-autos-manager','perm-autos-costs','approve'),
 ('auto-manager-sales-granular','role-autos-manager','perm-autos-sales-pipeline','manage'),
 ('auto-manager-workshop-granular','role-autos-manager','perm-autos-workshop','manage'),
 ('auto-manager-movement-granular','role-autos-manager','perm-autos-movement','manage'),
 ('auto-manager-gatepass-granular','role-autos-manager','perm-autos-gatepass','approve'),
 ('auto-porter-stock-granular','role-autos-porter','perm-autos-stock','view'),
 ('auto-porter-movement-granular','role-autos-porter','perm-autos-movement','create'),
 ('auto-washer-stock-granular','role-autos-washer','perm-autos-stock','view'),
 ('auto-washer-workshop-granular','role-autos-washer','perm-autos-workshop','create'),
 ('auto-mechanic-stock-granular','role-autos-mechanic','perm-autos-stock','view'),
 ('auto-mechanic-workshop-granular','role-autos-mechanic','perm-autos-workshop','edit'),
 ('auto-mechanic-costs-granular','role-autos-mechanic','perm-autos-costs','view'),
 ('auto-advisor-stock-granular','role-autos-advisor','perm-autos-stock','view'),
 ('auto-advisor-sales-granular','role-autos-advisor','perm-autos-sales-pipeline','edit'),
 ('auto-advisor-workshop-granular','role-autos-advisor','perm-autos-workshop','edit'),
 ('auto-admin-stock-granular','role-autos-admin','perm-autos-stock','manage'),
 ('auto-admin-sales-granular','role-autos-admin','perm-autos-sales-pipeline','manage'),
 ('auto-admin-workshop-granular','role-autos-admin','perm-autos-workshop','edit'),
 ('auto-admin-movement-granular','role-autos-admin','perm-autos-movement','edit');

-- Daenem Logistics role defaults.
INSERT OR REPLACE INTO role_permissions(id,role_id,permission_id,access_level) VALUES
 ('log-driver-shipments-granular','role-logistics-driver','perm-logistics-shipments','view'),
 ('log-driver-trip-granular','role-logistics-driver','perm-logistics-trip','create'),
 ('log-driver-pod-granular','role-logistics-driver','perm-logistics-pod','create'),
 ('log-driver-expense-granular','role-logistics-driver','perm-logistics-expense','create'),
 ('log-dispatch-shipments-granular','role-logistics-dispatcher','perm-logistics-shipments','edit'),
 ('log-dispatch-dispatch-granular','role-logistics-dispatcher','perm-logistics-dispatch','edit'),
 ('log-dispatch-trip-granular','role-logistics-dispatcher','perm-logistics-trip','edit'),
 ('log-dispatch-pod-granular','role-logistics-dispatcher','perm-logistics-pod','view'),
 ('log-dispatch-fleet-granular','role-logistics-dispatcher','perm-logistics-fleet','view'),
 ('log-fleet-shipments-granular','role-logistics-fleet','perm-logistics-shipments','manage'),
 ('log-fleet-dispatch-granular','role-logistics-fleet','perm-logistics-dispatch','manage'),
 ('log-fleet-trip-granular','role-logistics-fleet','perm-logistics-trip','manage'),
 ('log-fleet-pod-granular','role-logistics-fleet','perm-logistics-pod','manage'),
 ('log-fleet-expense-granular','role-logistics-fleet','perm-logistics-expense','approve'),
 ('log-fleet-fleet-granular','role-logistics-fleet','perm-logistics-fleet','manage');

-- Daenem Homes & Properties role defaults.
INSERT OR REPLACE INTO role_permissions(id,role_id,permission_id,access_level) VALUES
 ('prop-agent-portfolio-granular','role-properties-agent','perm-properties-portfolio','view'),
 ('prop-agent-crm-granular','role-properties-agent','perm-properties-crm','edit'),
 ('prop-agent-inspection-granular','role-properties-agent','perm-properties-inspection','create'),
 ('prop-agent-rent-granular','role-properties-agent','perm-properties-rent','view'),
 ('prop-facility-portfolio-granular','role-properties-facility','perm-properties-portfolio','view'),
 ('prop-facility-maintenance-granular','role-properties-facility','perm-properties-maintenance','manage'),
 ('prop-accountant-portfolio-granular','role-properties-accountant','perm-properties-portfolio','view'),
 ('prop-accountant-lease-granular','role-properties-accountant','perm-properties-lease','edit'),
 ('prop-accountant-rent-granular','role-properties-accountant','perm-properties-rent','manage'),
 ('prop-accountant-maintenance-granular','role-properties-accountant','perm-properties-maintenance','view');
