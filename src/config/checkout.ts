import { PRICE_VALUE, WHATSAPP_NUMBER } from './site';

/**
 * Valor mostrado nas telas. Quem decide o valor cobrado de verdade é a
 * oferta configurada na Cakto (src/lib/cakto.ts) — o navegador nunca
 * manda preço.
 */
export const TOTAL = PRICE_VALUE;

export function emReais(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Parâmetros de campanha que seguem da landing até a cobrança. */
const PARAMETROS_DE_CAMPANHA = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'sck',
] as const;

export function camposDeCampanha(busca: string): Record<string, string> {
  const entrada = new URLSearchParams(busca);
  const saida: Record<string, string> = {};
  for (const chave of PARAMETROS_DE_CAMPANHA) {
    const valor = entrada.get(chave);
    if (valor) saida[chave] = valor;
  }
  return saida;
}

/** Filtra os parâmetros de campanha que chegam do navegador, no servidor. */
export function campanhaSegura(bruto: unknown): Record<string, string> {
  const entrada = (bruto ?? {}) as Record<string, unknown>;
  const saida: Record<string, string> = {};
  for (const chave of PARAMETROS_DE_CAMPANHA) {
    const valor = entrada[chave];
    if (typeof valor === 'string' && valor.length > 0 && valor.length < 200) {
      saida[chave] = valor;
    }
  }
  return saida;
}

export function whatsappConfigurado(): boolean {
  return /^\d{12,13}$/.test(WHATSAPP_NUMBER);
}

/**
 * Link do WhatsApp da tela de aprovado, com a mensagem já escrita e o
 * número do pedido, para o atendimento achar a compra na hora.
 */
export function linkWhatsappPedido(pedido?: string | null): string {
  const referencia = pedido ? ` Meu pedido é o ${pedido}.` : '';
  const texto = `Oi! Acabei de pagar minha Foto com o Companheiro pelo Pix.${referencia} Vou te enviar minha foto agora.`;
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(texto)}`;
}
