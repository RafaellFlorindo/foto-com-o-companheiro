import QRCode from 'qrcode';
import { camposDeCampanha, linkWhatsappPedido, whatsappConfigurado } from '../config/checkout';
import { PRICE_VALUE } from '../config/site';

type Etapa = 'resumo' | 'dados' | 'gerando' | 'pix' | 'confirmando' | 'aprovado';

interface Cobranca {
  id: string;
  refId: string | null;
  qrCode: string | null;
  qrCodeBase64: string | null;
}

const telas = new Map<string, HTMLElement>();
for (const el of document.querySelectorAll<HTMLElement>('[data-step]')) {
  telas.set(el.dataset.step as string, el);
}

let etapaAtual: Etapa | null = null;

/**
 * Uma chave por tentativa: dois toques no botão não geram duas cobranças.
 * Ela é trocada quando a pessoa volta do Pix para editar os dados — senão a
 * Cakto devolveria a cobrança antiga e a correção seria ignorada.
 */
let chaveDeIdempotencia = crypto.randomUUID();

function mostrar(etapa: Etapa): void {
  if (etapaAtual === etapa) return;
  etapaAtual = etapa;
  for (const [nome, el] of telas) el.hidden = nome !== etapa;
  window.scrollTo(0, 0);
}

/* ------------------------------------------------------------------ *
 * Meta Pixel — os eventos falham calados se o pixel não tiver carregado.
 * ------------------------------------------------------------------ */

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

function rastrear(evento: string, dados?: Record<string, unknown>): void {
  try {
    window.fbq?.('track', evento, { currency: 'BRL', value: PRICE_VALUE, ...dados });
  } catch {
    /* rastreamento nunca pode quebrar o checkout */
  }
}

/* ------------------------------------------------------------------ *
 * Tela 1 → 2 e botões de voltar
 * ------------------------------------------------------------------ */

for (const botao of document.querySelectorAll<HTMLElement>('[data-ir]')) {
  botao.addEventListener('click', () => {
    const destino = botao.dataset.ir as Etapa;
    if (destino === 'dados') {
      if (etapaAtual === 'pix') chaveDeIdempotencia = crypto.randomUUID();
      else rastrear('InitiateCheckout');
    }
    mostrar(destino);
  });
}

/* ------------------------------------------------------------------ *
 * Foto: fica só no navegador, nunca sobe pro servidor.
 * ------------------------------------------------------------------ */

const photoInput = document.getElementById('photo') as HTMLInputElement;
const uploadBox = document.getElementById('upload-box') as HTMLLabelElement;
const uploadPreview = document.getElementById('upload-preview') as HTMLImageElement;

let urlDaFoto: string | null = null;

photoInput.addEventListener('change', () => {
  const file = photoInput.files?.[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    marcarErro('photo', 'Envie um arquivo de imagem (JPG ou PNG).');
    photoInput.value = '';
    return;
  }
  if (file.size > 15 * 1024 * 1024) {
    marcarErro('photo', 'A foto precisa ter até 15MB.');
    photoInput.value = '';
    return;
  }

  limparErro('photo');
  if (urlDaFoto) URL.revokeObjectURL(urlDaFoto);
  urlDaFoto = URL.createObjectURL(file);
  uploadPreview.src = urlDaFoto;
  uploadBox.classList.add('has-file');
});

/* ------------------------------------------------------------------ *
 * Formulário
 * ------------------------------------------------------------------ */

const form = document.getElementById('form-view') as HTMLFormElement;
const payBtn = document.getElementById('pay-btn') as HTMLButtonElement;
const errorBox = document.getElementById('error-box') as HTMLDivElement;
const phoneInput = document.getElementById('phone') as HTMLInputElement;

const DICAS_ORIGINAIS = new Map<string, string>();
for (const campo of ['name', 'email', 'phone', 'photo']) {
  const dica = document.getElementById(`${campo}-dica`);
  if (dica) DICAS_ORIGINAIS.set(campo, dica.textContent ?? '');
}

function marcarErro(campo: string, mensagem: string): void {
  const dica = document.getElementById(`${campo}-dica`);
  const entrada = document.getElementById(campo);
  if (dica) dica.textContent = mensagem;
  entrada?.closest('.campo')?.classList.add('errado');
  entrada?.setAttribute('aria-invalid', 'true');
}

function limparErro(campo: string): void {
  const dica = document.getElementById(`${campo}-dica`);
  const entrada = document.getElementById(campo);
  if (dica) dica.textContent = DICAS_ORIGINAIS.get(campo) ?? '';
  entrada?.closest('.campo')?.classList.remove('errado');
  entrada?.removeAttribute('aria-invalid');
}

function limparTodosOsErros(): void {
  for (const campo of DICAS_ORIGINAIS.keys()) limparErro(campo);
  errorBox.style.display = 'none';
  errorBox.textContent = '';
}

function mostrarErroGeral(mensagem: string): void {
  errorBox.textContent = mensagem;
  errorBox.style.display = 'block';
}

phoneInput.addEventListener('input', () => {
  phoneInput.value = phoneInput.value
    .replace(/\D/g, '')
    .slice(0, 11)
    .replace(/(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d)/, '$1-$2');
});

function fingerprint(): string {
  let fp = localStorage.getItem('fcc_fp');
  if (!fp) {
    fp = `fp_${crypto.randomUUID()}`;
    localStorage.setItem('fcc_fp', fp);
  }
  return fp;
}

let enviando = false;

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (enviando) return;

  limparTodosOsErros();

  if (!photoInput.files?.[0]) {
    marcarErro('photo', 'Escolha sua foto para continuar.');
    return;
  }

  enviando = true;
  payBtn.disabled = true;
  mostrar('gerando');

  const valor = (id: string) => (document.getElementById(id) as HTMLInputElement).value.trim();

  try {
    const res = await fetch('/api/create-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: valor('name'),
        email: valor('email'),
        phone: valor('phone'),
        fingerprint: fingerprint(),
        idempotencyKey: chaveDeIdempotencia,
        campanha: camposDeCampanha(window.location.search),
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (res.status === 422) {
      mostrar('dados');
      for (const [campo, mensagem] of Object.entries(data.erros ?? {})) {
        marcarErro(campo, String(mensagem));
      }
      return;
    }

    if (!res.ok) {
      mostrar('dados');
      mostrarErroGeral('Não foi possível gerar o Pix agora. Tente novamente em instantes.');
      return;
    }

    rastrear('AddPaymentInfo');
    await abrirPix({
      id: data.id,
      refId: data.refId ?? null,
      qrCode: data.qrCode ?? null,
      qrCodeBase64: data.qrCodeBase64 ?? null,
    });
  } catch {
    mostrar('dados');
    mostrarErroGeral('Erro de conexão. Tente novamente em instantes.');
  } finally {
    enviando = false;
    payBtn.disabled = false;
  }
});

/* ------------------------------------------------------------------ *
 * Tela do Pix
 * ------------------------------------------------------------------ */

const qrImg = document.getElementById('pix-qr') as HTMLImageElement;
const pixCode = document.getElementById('pix-code') as HTMLInputElement;
const copyBtn = document.getElementById('copy-btn') as HTMLButtonElement;
const jaPagueiBtn = document.getElementById('ja-paguei-btn') as HTMLButtonElement;
const avisoDemorou = document.getElementById('pix-demorou') as HTMLParagraphElement;

let cobranca: Cobranca | null = null;
let consultaId: ReturnType<typeof setInterval> | null = null;
let voltaDoConfirmando: ReturnType<typeof setTimeout> | null = null;

/** A Cabkto pode devolver só o copia-e-cola; nesse caso o QR é desenhado aqui. */
async function imagemDoQr(c: Cobranca): Promise<string | null> {
  if (c.qrCodeBase64) {
    return c.qrCodeBase64.startsWith('data:')
      ? c.qrCodeBase64
      : `data:image/png;base64,${c.qrCodeBase64}`;
  }
  if (!c.qrCode) return null;
  try {
    return await QRCode.toDataURL(c.qrCode, { width: 440, margin: 1, errorCorrectionLevel: 'M' });
  } catch {
    return null;
  }
}

async function abrirPix(c: Cobranca): Promise<void> {
  cobranca = c;
  avisoDemorou.hidden = true;

  const url = await imagemDoQr(c);
  if (url) {
    qrImg.src = url;
    qrImg.hidden = false;
  } else {
    qrImg.hidden = true;
  }

  pixCode.value = c.qrCode ?? '';
  mostrar('pix');
  iniciarConsulta(4000);
}

function iniciarConsulta(intervalo: number): void {
  pararConsulta();
  consultaId = setInterval(async () => {
    if (await estaPago()) aprovar();
  }, intervalo);
}

function pararConsulta(): void {
  if (consultaId) clearInterval(consultaId);
  consultaId = null;
}

async function estaPago(): Promise<boolean> {
  if (!cobranca) return false;
  try {
    const res = await fetch(`/api/create-payment?id=${encodeURIComponent(cobranca.id)}`);
    if (!res.ok) return false;
    const data = await res.json();
    if (data.refId && cobranca) cobranca.refId = data.refId;
    return Boolean(data.pago);
  } catch {
    // rede oscilou: a próxima consulta tenta de novo
    return false;
  }
}

copyBtn.addEventListener('click', async () => {
  if (!pixCode.value) return;
  try {
    await navigator.clipboard.writeText(pixCode.value);
    copyBtn.textContent = 'Copiado!';
  } catch {
    pixCode.select();
    copyBtn.textContent = 'Selecionado';
  }
  setTimeout(() => { copyBtn.textContent = 'Copiar'; }, 2500);
});

/**
 * A pessoa avisou que pagou. A gente não confia nisso: mostra a tela de
 * "confirmando" e consulta mais rápido. Se em 30s o banco não confirmar,
 * volta o QR com um aviso, para ela não ficar presa numa tela sem saída.
 */
jaPagueiBtn.addEventListener('click', async () => {
  mostrar('confirmando');
  avisoDemorou.hidden = true;
  iniciarConsulta(2000);

  if (voltaDoConfirmando) clearTimeout(voltaDoConfirmando);
  voltaDoConfirmando = setTimeout(() => {
    if (etapaAtual !== 'confirmando') return;
    avisoDemorou.hidden = false;
    mostrar('pix');
    iniciarConsulta(4000);
  }, 30000);

  if (await estaPago()) aprovar();
});

/* ------------------------------------------------------------------ *
 * Aprovado
 * ------------------------------------------------------------------ */

const whatsBtn = document.getElementById('whats-btn') as HTMLAnchorElement;

let jaAprovou = false;

function aprovar(): void {
  if (jaAprovou) return;
  jaAprovou = true;

  pararConsulta();
  if (voltaDoConfirmando) clearTimeout(voltaDoConfirmando);

  rastrear('Purchase', { eventID: cobranca?.id });
  mostrar('aprovado');

  if (!whatsappConfigurado()) {
    whatsBtn.hidden = true;
    return;
  }

  const link = linkWhatsappPedido(cobranca?.refId ?? cobranca?.id ?? null);
  whatsBtn.href = link;

  // O botão fica visível como saída manual: em alguns celulares o
  // redirecionamento automático não dispara.
  setTimeout(() => { window.location.href = link; }, 1500);
}

mostrar('resumo');
