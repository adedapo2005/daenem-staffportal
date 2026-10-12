export interface KudaStageEnv {
  APP_STAGE?: string;
  KUDA_STAGE_BUSINESS_EMAIL?: string;
  KUDA_STAGE_API_KEY?: string;
}

const KUDA_UAT_TOKEN_URL = 'https://kuda-openapi-uat.kudabank.com/v2.1/Account/GetToken';
const KUDA_UAT_API_URL = 'https://kuda-openapi-uat.kudabank.com/v2.1';
const isJwt = (value: string) => /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value);

/** Requests a Kuda UAT token. This helper has no production endpoint or token fallback. */
export async function getKudaStageAccessToken(
  env: KudaStageEnv,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  if (env.APP_STAGE !== 'stage' && env.APP_STAGE !== 'staging') {
    throw new Error('Kuda stage access is unavailable outside an explicit stage runtime.');
  }

  const email = env.KUDA_STAGE_BUSINESS_EMAIL?.trim();
  const apiKey = env.KUDA_STAGE_API_KEY;
  if (!email || !apiKey?.trim()) throw new Error('Kuda stage credentials are not configured.');

  let response: Response;
  try {
    response = await fetcher(KUDA_UAT_TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, apiKey }),
      redirect: 'error',
    });
  } catch {
    throw new Error('Kuda stage authentication is unavailable.');
  }

  if (!response.ok) throw new Error('Kuda stage authentication is unavailable.');
  const token = (await response.text()).trim();
  if (!isJwt(token)) throw new Error('Kuda stage returned an invalid authentication response.');
  return token;
}

/** Fetches UAT bank reference data only; callers must persist requestRef with their own audit record. */
export async function getKudaStageBankList(
  env: KudaStageEnv,
  fetcher: typeof fetch = fetch,
): Promise<{ requestRef: string; payload: unknown }> {
  const token = await getKudaStageAccessToken(env, fetcher);
  const requestRef = `BANK${Date.now().toString(36).toUpperCase()}${crypto.randomUUID().replaceAll('-', '').slice(0, 6).toUpperCase()}`;

  let response: Response;
  try {
    response = await fetcher(KUDA_UAT_API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ serviceType: 'BANK_LIST', requestRef, data: {} }),
      redirect: 'error',
    });
  } catch {
    throw new Error('Kuda stage bank reference data is unavailable.');
  }

  if (!response.ok) throw new Error('Kuda stage bank reference data is unavailable.');
  try {
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new Error('invalid response shape');
    }
    const envelope = payload as { status?: unknown; data?: unknown };
    if (envelope.status !== true || !Array.isArray(envelope.data)
      || envelope.data.some((bank) => !bank || typeof bank !== 'object' || Array.isArray(bank))) {
      throw new Error('invalid response shape');
    }
    return { requestRef, payload };
  } catch {
    throw new Error('Kuda stage bank reference data is unavailable.');
  }
}

/**
 * Performs a read-only UAT account-name enquiry. The returned provider payload is
 * evidence for a caller to validate; it does not itself authorize bank-account
 * promotion or any payment state transition.
 */
export async function queryKudaStageNameEnquiry(
  env: KudaStageEnv,
  input: { accountNumber: string; bankCode: string },
  fetcher: typeof fetch = fetch,
): Promise<{ requestRef: string; payload: unknown }> {
  const accountNumber = typeof input?.accountNumber === 'string' ? input.accountNumber.trim() : '';
  const bankCode = typeof input?.bankCode === 'string' ? input.bankCode.trim() : '';
  if (!accountNumber || !/^\d{1,32}$/.test(accountNumber) || !bankCode || !/^\d{1,32}$/.test(bankCode)) {
    throw new Error('Kuda stage account validation input is invalid.');
  }

  const token = await getKudaStageAccessToken(env, fetcher);
  const requestRef = `NAME${Date.now().toString(36).toUpperCase()}${crypto.randomUUID().replaceAll('-', '').slice(0, 6).toUpperCase()}`;
  let response: Response;
  try {
    response = await fetcher(KUDA_UAT_API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        serviceType: 'NAME_ENQUIRY',
        requestRef,
        data: { accountNumber, bankCode },
      }),
      redirect: 'error',
    });
  } catch {
    throw new Error('Kuda stage account validation is unavailable.');
  }

  if (!response.ok) throw new Error('Kuda stage account validation is unavailable.');
  try {
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) ||
        (payload as { status?: unknown }).status !== true ||
        !('data' in payload) || !(payload as { data?: unknown }).data ||
        typeof (payload as { data?: unknown }).data !== 'object' ||
        Array.isArray((payload as { data?: unknown }).data)) {
      throw new Error('invalid response shape');
    }
    return { requestRef, payload };
  } catch {
    throw new Error('Kuda stage account validation is unavailable.');
  }
}
