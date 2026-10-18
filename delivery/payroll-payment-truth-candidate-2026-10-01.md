# Payroll Payment Truth Candidate

Base shared HEAD: `1108359bc4f0a5709c6e88f9123c126d168a1fec`.

Candidate branch: `feature/staffportal-workflow-closure-payroll-reconciliation-01`.

The next safe source-owner slice should prevent a Payroll run from moving to Paid unless at least one active payment batch exists, every active batch is already Paid, and every active batch item is already Paid. Failure must return a neutral reconciliation-required conflict with zero writes. Payment-draft creation should be blocked after the run is Paid, and a run should not have more than one active full-population payment batch because each current batch contains every payroll item.

This candidate does not create payment/provider truth, does not make provider calls, and does not move money. An authoritative reconciliation writer remains required to consume provider/bank/import evidence and set batch/item truth idempotently before the Paid gate can pass.
