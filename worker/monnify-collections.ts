/**
 * Non-production Monnify collection verification. This adapter is deliberately
 * pinned to Monnify's sandbox and returns provider facts only; callers must
 * still bind them to the authoritative company, account, customer, and invoice
 * records and run the existing one-winner Finance allocation boundary.
 */
export type MonnifyPaymentStatus =
  | 'PAID'
  | 'PARTIALLY_PAID'
  | 'OVERPAID'
  | 'PENDING'
  | 'FAILED'
  | 'REVERSED'
  | 'EXPIRED';

export interface MonnifyCollectionEnv {
  MONNIFY_STAGE_API_KEY?: string;
  MONNIFY_STAGE_SECRET_KEY?: string;
}

export interface MonnifyCollectionExpectation {
  paymentReference: string;
  expectedAmountKobo: number;
  currencyCode: 'NGN';
}

export interface MonnifyCollectionFacts {
  provider: 'monnify';
  transactionReference: string;
  paymentReference: string;
  paymentStatus: MonnifyPaymentStatus;
  amountPaidKobo: number;
  currencyCode: string;
  paidOn: string | null;
  exactPaidMatch: boolean;
}

const SANDBOX = 'https://sandbox.monnify.com';
const REFERENCE = /^[A-Za-z0-9:_|.-]{1,160}$/;

function amountToKobo(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const raw = String(value);
  if (!/^\d{1,12}(?:\.\d{1,2})?$/.test(raw)) return null;
  const [whole, fraction = ''] = raw.split('.');
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(amount) ? amount : null;
}

function validDate(value: unknown): string | null {
  if (typeof value !== 'string' || !value || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

async function readJson(response: Response, failure: string): Promise<unknown> {
  try { return await response.json(); }
  catch { throw new Error(failure); }
}

async function request(fetcher: typeof fetch, url: string, init: RequestInit, failure: string): Promise<Response> {
  try { return await fetcher(url, init); }
  catch { throw new Error(failure); }
}

/** Calls only the official sandbox API. No credentials or provider response are logged or persisted. */
export async function verifyMonnifyCollection(
  env: MonnifyCollectionEnv,
  expected: MonnifyCollectionExpectation,
  fetcher: typeof fetch = fetch,
): Promise<MonnifyCollectionFacts> {
  const apiKey = env.MONNIFY_STAGE_API_KEY?.trim();
  const secretKey = env.MONNIFY_STAGE_SECRET_KEY?.trim();
  if (!apiKey || !secretKey) throw new Error('Monnify stage verification is not configured.');
  if (!REFERENCE.test(expected.paymentReference) || !Number.isSafeInteger(expected.expectedAmountKobo) || expected.expectedAmountKobo < 0 || expected.currencyCode !== 'NGN') {
    throw new Error('Monnify verification expectation is invalid.');
  }

  const tokenResponse = await request(fetcher, `${SANDBOX}/api/v1/auth/login`, {
    method: 'POST',
    headers: { authorization: `Basic ${btoa(`${apiKey}:${secretKey}`)}`, 'content-type': 'application/json' },
    body: '{}',
    redirect: 'error',
  }, 'Monnify stage authentication failed.');
  if (!tokenResponse.ok) throw new Error('Monnify stage authentication failed.');
  const tokenEnvelope = await readJson(tokenResponse, 'Monnify stage authentication failed.');
  if (!tokenEnvelope || typeof tokenEnvelope !== 'object') throw new Error('Monnify stage authentication failed.');
  const tokenBody = (tokenEnvelope as { responseSuccessful?: unknown; responseBody?: { accessToken?: unknown } }).responseBody;
  if ((tokenEnvelope as { requestSuccessful?: unknown }).requestSuccessful !== true || typeof tokenBody?.accessToken !== 'string' || !tokenBody.accessToken) {
    throw new Error('Monnify stage authentication failed.');
  }

  const query = new URLSearchParams({ paymentReference: expected.paymentReference });
  const verificationResponse = await request(fetcher, `${SANDBOX}/api/v2/merchant/transactions/query?${query}`, {
    method: 'GET',
    headers: { authorization: `Bearer ${tokenBody.accessToken}`, accept: 'application/json' },
    redirect: 'error',
  }, 'Monnify stage transaction verification failed.');
  if (!verificationResponse.ok) throw new Error('Monnify stage transaction verification failed.');
  const envelope = await readJson(verificationResponse, 'Monnify stage transaction verification failed.');
  if (!envelope || typeof envelope !== 'object') throw new Error('Monnify stage transaction verification failed.');
  const root = envelope as { requestSuccessful?: unknown; responseBody?: Record<string, unknown> };
  const body = root.responseBody;
  if (root.requestSuccessful !== true || !body || typeof body !== 'object') throw new Error('Monnify stage transaction verification failed.');

  const paymentReference = typeof body.paymentReference === 'string' ? body.paymentReference : '';
  const transactionReference = typeof body.transactionReference === 'string' ? body.transactionReference : '';
  const status = body.paymentStatus;
  const allowedStatuses: MonnifyPaymentStatus[] = ['PAID', 'PARTIALLY_PAID', 'OVERPAID', 'PENDING', 'FAILED', 'REVERSED', 'EXPIRED'];
  const amountPaidKobo = amountToKobo(body.amountPaid);
  const currencyCode = typeof body.currencyCode === 'string' ? body.currencyCode : '';
  if (!REFERENCE.test(paymentReference) || !REFERENCE.test(transactionReference) || !allowedStatuses.includes(status as MonnifyPaymentStatus) || amountPaidKobo === null || !/^[A-Z]{3}$/.test(currencyCode)) {
    throw new Error('Monnify stage transaction response is invalid.');
  }

  return {
    provider: 'monnify',
    transactionReference,
    paymentReference,
    paymentStatus: status as MonnifyPaymentStatus,
    amountPaidKobo,
    currencyCode,
    paidOn: validDate(body.paidOn),
    exactPaidMatch: status === 'PAID' && paymentReference === expected.paymentReference && amountPaidKobo === expected.expectedAmountKobo && currencyCode === expected.currencyCode,
  };
}
