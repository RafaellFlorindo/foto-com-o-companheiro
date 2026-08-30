/**
 * Conversa com a Cakto: cria a cobrança Pix e consulta o pedido.
 *
 * Roda só no servidor. As credenciais ficam em variáveis de ambiente e nunca
 * chegam ao navegador. O navegador manda apenas os dados de contato — qual
 * oferta e qual preço são cobrados é decidido aqui, para o valor não poder ser
 * adulterado pelo cliente.
 *
 * A cobrança Pix é criada sem CPF.
 */

const CAKTO_API = 'https://api.cakto.com.br';
const OFFER_ID = 'bs8zjtu';

/** Status que a Cakto usa para dizer que o dinheiro entrou. */
const STATUS_PAGOS = ['paid', 'approved', 'aprovado', 'pago', 'completed', 'complete'];

export function estaPago(status: unknown): boolean {
  return STATUS_PAGOS.includes(String(status ?? '').toLowerCase());
}

let cachedToken: string | null = null;
let cachedTokenExpiresAt = 0;

export async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && now < cachedTokenExpiresAt) return cachedToken;

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
  cachedToken = data.access_token as string;
  // renova um minuto antes de expirar
  cachedTokenExpiresAt = now + Math.max(0, (data.expires_in ?? 300) - 60) * 1000;
  return cachedToken;
}

export function onlyDigits(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '');
}

export interface PedidoResumo {
  id: string;
  refId: string | null;
  status: string;
  qrCode: string | null;
  qrCodeBase64: string | null;
}

interface CreatePaymentInput {
  name: string;
  email: string;
  /** Só dígitos, 10 ou 11 (DDD + número). */
  phone: string;
  fingerprint: string;
  /** Mesma chave = mesma cobrança, para dois toques no botão não cobrarem duas vezes. */
  idempotencyKey: string;
  campanha: Record<string, string>;
}

export async function createCaktoPixPayment(input: CreatePaymentInput) {
  const token = await getAccessToken();

  const body = {
    paymentMethod: 'pix',
    customer: {
      name: input.name,
      email: input.email,
      phone: input.phone.startsWith('55') ? input.phone : `55${input.phone}`,
      fingerprint: input.fingerprint,
    },
    items: [{ offerId: OFFER_ID }],
    ...input.campanha,
  };

  const res = await fetch(`${CAKTO_API}/public_api/payments/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Idempotency-Key': input.idempotencyKey,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data };
}

/** Situação atual de um pedido, para a tela do Pix saber quando o dinheiro entrou. */
export async function getCaktoOrder(id: string): Promise<PedidoResumo | null> {
  const token = await getAccessToken();
  const res = await fetch(`${CAKTO_API}/public_api/orders/${encodeURIComponent(id)}/`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;

  const d = await res.json().catch(() => null);
  if (!d) return null;

  return {
    id,
    refId: d.refId ?? null,
    status: d.status ?? 'waiting_payment',
    qrCode: d.pix?.qrCode ?? null,
    qrCodeBase64: d.pix?.qrCodeBase64 ?? null,
  };
}
