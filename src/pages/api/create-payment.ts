import type { APIRoute } from 'astro';
import { createCaktoPixPayment, isValidCpf, onlyDigits } from '../../lib/cakto';

export const prerender = false;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const ALL: APIRoute = async ({ request }) => {
  if (request.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  const body = await request.json().catch(() => ({}));
  const { name, email, phone, docNumber, fingerprint } = body ?? {};

  if (!name || !email || !phone || !docNumber || !fingerprint) {
    return json({ error: 'missing_fields' }, 400);
  }

  const cleanPhone = onlyDigits(phone);
  const cleanDoc = onlyDigits(docNumber);

  if (cleanPhone.length < 10 || cleanPhone.length > 11) {
    return json({ error: 'invalid_phone' }, 400);
  }
  if (!isValidCpf(cleanDoc)) {
    return json({ error: 'invalid_document' }, 400);
  }

  try {
    const result = await createCaktoPixPayment({
      name,
      email,
      phone: cleanPhone,
      fingerprint,
      docNumber: cleanDoc,
    });

    if (!result.ok) {
      const status = result.status >= 400 && result.status < 500 ? 400 : 502;
      return json({ error: 'cakto_error', detail: result.data }, status);
    }

    return json(result.data, 201);
  } catch (err) {
    return json({ error: 'internal_error' }, 502);
  }
};
