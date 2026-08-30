import type { APIRoute } from 'astro';
import { campanhaSegura } from '../../config/checkout';
import {
  createCaktoPixPayment,
  estaPago,
  getCaktoOrder,
  onlyDigits,
} from '../../lib/cakto';

export const prerender = false;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

/**
 * Erros por campo, no formato que o formulário sabe destacar.
 * Não pedimos CPF: a cobrança Pix é criada sem ele.
 */
function validar(corpo: Record<string, unknown>) {
  const erros: Record<string, string> = {};

  const name = String(corpo.name ?? '').trim();
  if (name.length < 3 || !name.includes(' ')) {
    erros.name = 'Escreva seu nome e sobrenome.';
  }

  const email = String(corpo.email ?? '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    erros.email = 'Confira seu e-mail.';
  }

  const phone = onlyDigits(corpo.phone);
  if (phone.length < 10 || phone.length > 11) {
    erros.phone = 'Confira seu celular com DDD.';
  }

  return { erros, name, email, phone };
}

/** Consulta o pedido: a tela do Pix chama isso até o banco confirmar. */
export const GET: APIRoute = async ({ url }) => {
  const id = url.searchParams.get('id') ?? '';
  if (!/^[\w-]{1,64}$/.test(id)) {
    return json({ error: 'invalid_id' }, 400);
  }

  try {
    const pedido = await getCaktoOrder(id);
    if (!pedido) return json({ error: 'order_lookup_failed' }, 502);

    return json({
      id: pedido.id,
      refId: pedido.refId,
      status: pedido.status,
      pago: estaPago(pedido.status),
    }, 200);
  } catch {
    return json({ error: 'internal_error' }, 502);
  }
};

/** Cria a cobrança Pix e devolve o QR Code. */
export const POST: APIRoute = async ({ request }) => {
  const corpo = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const { erros, name, email, phone } = validar(corpo);
  if (Object.keys(erros).length) {
    return json({ error: 'invalid_fields', erros }, 422);
  }

  const fingerprint = String(corpo.fingerprint ?? '');
  if (!fingerprint) return json({ error: 'missing_fields' }, 400);

  // Chave vinda do navegador, fixa por tentativa: se a pessoa tocar duas vezes
  // no botão, a Cakto devolve o pedido já criado em vez de cobrar de novo.
  const chaveBruta = String(corpo.idempotencyKey ?? '');
  const idempotencyKey = /^[\w-]{8,64}$/.test(chaveBruta)
    ? chaveBruta
    : `fcc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

  try {
    const result = await createCaktoPixPayment({
      name,
      email,
      phone,
      fingerprint,
      idempotencyKey,
      campanha: campanhaSegura(corpo.campanha),
    });

    if (!result.ok) {
      console.error('falha ao criar cobranca', result.status, JSON.stringify(result.data).slice(0, 400));
      return json({ error: 'cakto_error' }, 502);
    }

    const d = result.data as Record<string, any>;
    return json({
      id: d.id,
      refId: d.refId ?? null,
      status: d.status ?? null,
      qrCode: d.pix?.qrCode ?? null,
      qrCodeBase64: d.pix?.qrCodeBase64 ?? null,
      expiraEm: d.pix?.expirationDate ?? null,
    }, 201);
  } catch (err) {
    console.error('erro no checkout:', (err as Error).message);
    return json({ error: 'internal_error' }, 502);
  }
};
