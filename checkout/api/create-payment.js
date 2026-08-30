import crypto from 'node:crypto';

const CAKTO_API = 'https://api.cakto.com.br';
const OFFER_ID = 'bs8zjtu';

let cachedToken = null;
let cachedTokenExpiresAt = 0;

async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && now < cachedTokenExpiresAt - 5000) return cachedToken;

  const res = await fetch(`${CAKTO_API}/public_api/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.CAKTO_CLIENT_ID,
      client_secret: process.env.CAKTO_CLIENT_SECRET,
    }),
  });
  if (!res.ok) throw new Error('cakto_auth_failed');

  const data = await res.json();
  cachedToken = data.access_token;
  cachedTokenExpiresAt = now + data.expires_in * 1000;
  return cachedToken;
}

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function isValidCpf(cpf) {
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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const { name, email, phone, docNumber, fingerprint } = req.body || {};

  if (!name || !email || !phone || !docNumber || !fingerprint) {
    res.status(400).json({ error: 'missing_fields' });
    return;
  }

  const cleanPhone = onlyDigits(phone);
  const cleanDoc = onlyDigits(docNumber);

  if (cleanPhone.length < 10 || cleanPhone.length > 11) {
    res.status(400).json({ error: 'invalid_phone' });
    return;
  }
  if (!isValidCpf(cleanDoc)) {
    res.status(400).json({ error: 'invalid_document' });
    return;
  }

  try {
    const token = await getAccessToken();
    const idempotencyKey = crypto.randomUUID();

    const body = {
      paymentMethod: 'pix',
      customer: {
        name,
        email,
        phone: cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`,
        fingerprint,
        docType: 'cpf',
        docNumber: cleanDoc,
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

    if (!paymentRes.ok) {
      res.status(paymentRes.status >= 400 && paymentRes.status < 500 ? 400 : 502).json({
        error: 'cakto_error',
        detail: data,
      });
      return;
    }

    res.status(201).json(data);
  } catch (err) {
    res.status(502).json({ error: 'internal_error' });
  }
}
