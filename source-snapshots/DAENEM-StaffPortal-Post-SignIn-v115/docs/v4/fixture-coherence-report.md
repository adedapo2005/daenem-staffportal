# Fixture coherence

PASS (bounded): receipt acceptance has no stock effect; posting atomically increments PO accepted quantity and matching stock once. Transfer dispatch decrements source; receipt increments destination. Wrong item, missing links, excess quantity, stale revision, repeat posting and backwards transfer transitions reject. See regression-checks.json.

PARTIAL: complete company-wide ledgers, bread custody events, finance/receivable/lease chains and recruitment identities are not reconciled end-to-end.
