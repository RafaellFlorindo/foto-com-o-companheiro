export const SITE_NAME = 'Foto com o Companheiro';

export const PRICE_LABEL = 'R$ 13,00';
export const PRICE_SHORT_LABEL = 'R$ 13';
export const PRICE_VALUE = 13;

export const WHATSAPP_NUMBER = '5531997900284';
export const WHATSAPP_MESSAGE =
  'Oi! Quero minha foto personalizada por R$ 13. Como faço para enviar minha foto?';

export function whatsappUrl(message: string = WHATSAPP_MESSAGE): string {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

export const CHECKOUT_PATH = '/checkout';

export const LOGO_SRC = '/0928cc08-c912-473a-aac0-883c45aa91c1.png';
export const FAVICON_SRC = LOGO_SRC;
