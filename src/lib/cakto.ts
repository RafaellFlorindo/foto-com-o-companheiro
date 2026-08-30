const CAKTO_API = 'https://api.cakto.com.br';
const OFFER_ID = 'bs8zjtu';

let cachedToken: string | null = null;
let cachedTokenExpiresAt = 0;

export async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && now < cachedTokenExpiresAt - 5000) return cachedToken;

  const res = await fetch(`${CAKTO_API}/public_api/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.CAKTO_CLIENT_ID ?? '',
      client_secret: process.env.CAKTO_CLIENT_SECRET ?? '',
    }),
  });
  if (!res.ok) throw new Error('cakto_auth_failed');

  const data = await res.json();
  cachedToken = data.access_token;
  cachedTokenExpiresAt = now + data.expires_in * 1000;
  return cachedToken as string;
}

export function onlyDigits(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '');
}

export function isValidCpf(cpf: string): boolean {
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const digits = cpf.split('').map(Number);
  for (const pos of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < pos; i++) sum += digits[i] * (pos + 1 - i);
    const check = ((sum * 10) % 11) % 10;
    if (check !== digits[pos]) return false;
  }
  return true;
}

interface CreatePaymentInput {
  name: string;
  email: string;
  phone: string;
  fingerprint: string;
  docNumber: string;
}

export async function createCaktoPixPayment(input: CreatePaymentInput) {
  const token = await getAccessToken();
  const idempotencyKey = crypto.randomUUID();

  const body = {
    paymentMethod: 'pix',
    customer: {
      name: input.name,
      email: input.email,
      phone: input.phone.startsWith('55') ? input.phone : `55${input.phone}`,
      fingerprint: input.fingerprint,
      docType: 'cpf',
      docNumber: input.docNumber,
    },
    items: [{ offerId: OFFER_ID }],
  };

  const paymentRes = await fetch(`${CAKTO_API}/public_api/payments/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(body),
  });

  const data = await paymentRes.json().catch(() => null);

  return { ok: paymentRes.ok, status: paymentRes.status, data };
}
