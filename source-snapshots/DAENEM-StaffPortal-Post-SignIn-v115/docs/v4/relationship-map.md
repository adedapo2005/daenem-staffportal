# Relationships

- **Payroll Control:** Employee -> period -> earnings/deductions -> readiness -> approval.
- **Job Applications:** Vacancy -> candidate -> interviews -> hire (partial fixture linkage).
- **Logistics Dispatch:** Driver + vehicle -> trip -> POD -> collection (partial linkage).
- **Homes & Properties:** Property -> unit -> lease -> collection (partial linkage).
- **Purchase Orders:** Source requisition; supplier; item; receipts.
- **Goods Receipts:** Purchase Order -> inventory item/location; atomically posted.
- **Stock Transfers:** Item + source location -> in transit -> destination location.
- **Bakery Accountability:** Batch -> custody -> dispositions -> remittance -> investigation.

Only receipt/PO/item/location and transfer balances have the new targeted transactional tests. Other chains remain partial.
