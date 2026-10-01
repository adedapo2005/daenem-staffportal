export type PaymentEvidenceFacts = {
  sourceType: string;
  fileSha256: string | null;
  direction: string;
  amountMinor: number;
  expectedAmountMinor: number;
  currency: string;
  companyMatches: boolean;
  reconciliationStatus: string;
  candidateReference: string | null;
  expectedCandidateReference: string;
};

export function strongPaymentEvidence(sourceType: string, fileSha256: string | null) {
  if (sourceType === 'provider_api' || sourceType === 'provider_webhook') return true;
  if ((sourceType === 'csv' || sourceType === 'excel') && Boolean(fileSha256)) return true;
  return false;
}

export function paymentEvidenceAcceptable(facts: PaymentEvidenceFacts) {
  if (!facts.companyMatches || !strongPaymentEvidence(facts.sourceType, facts.fileSha256)) return false;
  if (facts.direction !== 'debit' || facts.currency !== 'NGN') return false;
  if (!Number.isSafeInteger(facts.amountMinor) || facts.amountMinor < 0 || facts.amountMinor !== facts.expectedAmountMinor) return false;
  if (['duplicate', 'reversed', 'refunded', 'overpayment'].includes(facts.reconciliationStatus)) return false;
  if (facts.reconciliationStatus === 'exact' && facts.candidateReference !== facts.expectedCandidateReference) return false;
  return ['unmatched', 'partial', 'exact'].includes(facts.reconciliationStatus);
}

export function derivePaymentClosure(counts: { total: number; paid: number; held: number; failed: number }) {
  const total = Math.max(0, Math.trunc(counts.total));
  const paid = Math.max(0, Math.trunc(counts.paid));
  const unresolved = Math.max(0, Math.trunc(counts.held)) + Math.max(0, Math.trunc(counts.failed));
  if (total > 0 && paid === total && unresolved === 0) return { batchStatus: 'paid' as const, runMayClose: true };
  if (paid > 0) return { batchStatus: 'partially_paid' as const, runMayClose: false };
  return { batchStatus: 'submitted' as const, runMayClose: false };
}

export function manualRunPaidAllowed() {
  return false;
}
