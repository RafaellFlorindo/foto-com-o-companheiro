import { whatsappUrl } from '../config/site';

const formView = document.getElementById('form-view') as HTMLFormElement;
const result = document.getElementById('result') as HTMLDivElement;
const errorBox = document.getElementById('error-box') as HTMLDivElement;
const payBtn = document.getElementById('pay-btn') as HTMLButtonElement;
const photoInput = document.getElementById('photo') as HTMLInputElement;
const uploadBox = document.getElementById('upload-box') as HTMLLabelElement;
const uploadPreview = document.getElementById('upload-preview') as HTMLImageElement;

let selectedPhotoUrl: string | null = null;

photoInput.addEventListener('change', () => {
  const file = photoInput.files?.[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    showError('Envie um arquivo de imagem (JPG ou PNG).');
    photoInput.value = '';
    return;
  }
  if (file.size > 15 * 1024 * 1024) {
    showError('A foto precisa ter até 15MB.');
    photoInput.value = '';
    return;
  }
  hideError();
  if (selectedPhotoUrl) URL.revokeObjectURL(selectedPhotoUrl);
  selectedPhotoUrl = URL.createObjectURL(file);
  uploadPreview.src = selectedPhotoUrl;
  uploadBox.classList.add('has-file');
});

function getFingerprint(): string {
  let fp = localStorage.getItem('fcc_fp');
  if (!fp) {
    fp = 'fp_' + crypto.randomUUID();
    localStorage.setItem('fcc_fp', fp);
  }
  return fp;
}

function showError(msg: string) {
  errorBox.textContent = msg;
  errorBox.style.display = 'block';
}

function hideError() {
  errorBox.style.display = 'none';
}

function renderPix(data: any) {
  const pix = data.pix || {};
  result.innerHTML = `
    <h2>Escaneie o QR Code</h2>
    <p class="hint">Abra o app do seu banco e pague com Pix</p>
    <div class="qr-box"><img src="${pix.qrCodeBase64 || ''}" alt="QR Code Pix"></div>
    <label>Ou copie o código</label>
    <div class="copy-field">
      <input type="text" readonly value="${pix.qrCode || ''}" id="pix-code">
      <button type="button" id="copy-btn">Copiar</button>
    </div>
    <div class="whats-hint">
      ${selectedPhotoUrl ? `<img class="thumb" src="${selectedPhotoUrl}" alt="Sua foto">` : ''}
      <span>Depois de pagar, chame a gente no <a href="${whatsappUrl('Oi! Acabei de pagar minha foto personalizada (pedido ' + (data.refId || data.id) + '). Vou te enviar minha foto agora!')}" target="_blank" rel="noopener noreferrer">WhatsApp</a> e envie esta mesma foto que você escolheu aqui.</span>
    </div>
  `;
  document.getElementById('copy-btn')?.addEventListener('click', () => {
    navigator.clipboard.writeText(pix.qrCode || '');
    const btn = document.getElementById('copy-btn') as HTMLButtonElement;
    btn.textContent = 'Copiado!';
    setTimeout(() => { btn.textContent = 'Copiar'; }, 2000);
  });
}

formView.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideError();

  const name = (document.getElementById('name') as HTMLInputElement).value.trim();
  const email = (document.getElementById('email') as HTMLInputElement).value.trim();
  const phone = (document.getElementById('phone') as HTMLInputElement).value.trim();
  const doc = (document.getElementById('doc') as HTMLInputElement).value.trim();

  if (!name || !email || !phone || !doc) {
    showError('Preencha todos os campos para continuar.');
    return;
  }
  if (!photoInput.files?.[0]) {
    showError('Envie sua foto para continuar.');
    return;
  }

  payBtn.disabled = true;
  payBtn.innerHTML = '<span class="spinner"></span> Processando...';

  try {
    const res = await fetch('/api/create-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name, email, phone, docNumber: doc,
        fingerprint: getFingerprint(),
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      const msg = data.error === 'invalid_document' ? 'CPF inválido. Confira e tente de novo.'
        : data.error === 'invalid_phone' ? 'Número de celular inválido.'
        : 'Não foi possível gerar o pagamento. Confira os dados e tente novamente.';
      showError(msg);
      payBtn.disabled = false;
      payBtn.innerHTML = 'Pagar com Pix';
      return;
    }

    formView.classList.add('hide');
    result.classList.add('show');
    renderPix(data);
  } catch (err) {
    showError('Erro de conexão. Tente novamente em instantes.');
    payBtn.disabled = false;
    payBtn.innerHTML = 'Pagar com Pix';
  }
});
