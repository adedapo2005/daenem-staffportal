# Logical relationships for mapping

These are product concepts, not discovered production tables. PRODUCTION CONTRACT TO BE MAPPED DURING INTEGRATION.

Identity connects to Employee, Assignment and Session. Every operational record belongs to an authorized company scope. File metadata and bytes inherit the owning record scope. Decisions and audit events reference the controlled record and the actor session.

Requisition may create a Purchase Order. An ordered Purchase Order may receive Goods Receipts. Accepted receipts must atomically update order quantities and append stock movements. The current lab edits these records separately; that transaction is not implemented.

Bakery batches feed custody, dispatch, returns and remittance. Resolution must preserve the original unexplained variance and its reason. The current form demonstrates arithmetic and closure guards; it is not a normalized immutable event ledger.
