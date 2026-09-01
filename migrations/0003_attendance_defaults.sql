PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO company_locations (
  id, company_id, name, address_line, city, state, country_code, geofence_radius_m, timezone, active
) VALUES
  ('location-printing-hq', 'company-printing', 'Daenem Complex HQ', 'Jagun Bus Stop, Behind NIPCO Filling Station, Old Ife Road', 'Ibadan', 'Oyo', 'NG', 150, 'Africa/Lagos', 1),
  ('location-bakery-hq', 'company-bakery', 'Daenem Complex HQ', 'Jagun Bus Stop, Behind NIPCO Filling Station, Old Ife Road', 'Ibadan', 'Oyo', 'NG', 150, 'Africa/Lagos', 1),
  ('location-logistics-hq', 'company-logistics', 'Daenem Complex HQ', 'Jagun Bus Stop, Behind NIPCO Filling Station, Old Ife Road', 'Ibadan', 'Oyo', 'NG', 150, 'Africa/Lagos', 1),
  ('location-properties-hq', 'company-properties', 'Daenem Complex HQ', 'Jagun Bus Stop, Behind NIPCO Filling Station, Old Ife Road', 'Ibadan', 'Oyo', 'NG', 150, 'Africa/Lagos', 1),
  ('location-autos-hq', 'company-autos', 'Daenem Autos Iwo Road', 'Kamjat Junction, New Gbagi Express Road, Beside Ile Eja Cold Room, Before Wema Bank, Iwo Road', 'Ibadan', 'Oyo', 'NG', 150, 'Africa/Lagos', 1);

UPDATE employee_company_memberships SET location_id = 'location-printing-hq'
WHERE company_id = 'company-printing' AND location_id IS NULL;
UPDATE employee_company_memberships SET location_id = 'location-bakery-hq'
WHERE company_id = 'company-bakery' AND location_id IS NULL;
UPDATE employee_company_memberships SET location_id = 'location-autos-hq'
WHERE company_id = 'company-autos' AND location_id IS NULL;
UPDATE employee_company_memberships SET location_id = 'location-logistics-hq'
WHERE company_id = 'company-logistics' AND location_id IS NULL;
UPDATE employee_company_memberships SET location_id = 'location-properties-hq'
WHERE company_id = 'company-properties' AND location_id IS NULL;

INSERT OR IGNORE INTO attendance_policies (
  id, company_id, location_id, name, require_login_location, require_clock_geofence,
  require_clock_in_photo, require_clock_out_photo, allow_offline_attendance,
  allow_manager_override, geofence_radius_m, grace_minutes, active
) VALUES
  ('attendance-policy-printing-hq', 'company-printing', 'location-printing-hq', 'Printing HQ Attendance', 0, 1, 1, 0, 1, 1, 150, 0, 1),
  ('attendance-policy-bakery-hq', 'company-bakery', 'location-bakery-hq', 'Bakery HQ Attendance', 0, 1, 1, 0, 1, 1, 150, 0, 1),
  ('attendance-policy-autos-hq', 'company-autos', 'location-autos-hq', 'Autos HQ Attendance', 0, 1, 1, 0, 1, 1, 150, 0, 1),
  ('attendance-policy-logistics-hq', 'company-logistics', 'location-logistics-hq', 'Logistics HQ Attendance', 0, 1, 1, 0, 1, 1, 150, 0, 1),
  ('attendance-policy-properties-hq', 'company-properties', 'location-properties-hq', 'Properties HQ Attendance', 0, 1, 1, 0, 1, 1, 150, 0, 1);
