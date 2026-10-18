# Linked ERP fixture scenarios

The current fixture graph preserves shared IDs and relationships across Recruitment (vacancy → application → interview → hiring), Printing (order → job → material use → invoice), Bakery (batch → custody → sale/remittance → variance resolution), Logistics (trip → cost → POD), Properties (lead → property → lease), Procurement (requisition → purchase order → goods receipt), Inventory (receipt/transfer → location stock), Finance (invoice/payment → journal/reconciliation), Payroll (preparation → banking batch → employee outcomes), Attendance (clock events → day status), and Expenses (request → evidence → independent approval → finance posting).

V12 communications reference those records by ID and do not duplicate their truth. Payment verification and banking workflows match provider-side events to the same obligations before downstream action.
