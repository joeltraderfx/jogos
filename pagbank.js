// Módulo de pagamento (aluguel de sala) via PagBank.
//
// Fluxo: o host escolhe um código de sala + plano em planos.html -> criamos
// um Checkout no PagBank e redirecionamos o navegador para lá -> o cliente
// paga -> o PagBank chama nosso webhook (payment_notification_urls) ->
// validamos a assinatura e, se o pagamento foi aprovado, liberamos a sala
// por N dias a partir de agora (ou a partir do vencimento atual, se a sala
// já estava ativa — assim renovar antes de vencer soma os dias em vez de
// jogar tempo fora).
//
// Documentação oficial usada como referência (checkout REST, não a antiga
// API v2 em XML, que está fora de uso): https://developer.pagbank.com.br/docs/checkout

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, 'data');
const ROOMS_FILE = path.join(DATA_DIR, 'rooms.json');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');

// Preços em centavos (a API do PagBank trabalha em centavos).
const PLANS = {
  diario:  { label: 'Diário',  price: 1990,  days: 1  },
  semanal: { label: 'Semanal', price: 9240,  days: 7  },
  mensal:  { label: 'Mensal',  price: 27900, days: 30 },
};

function loadJSON(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')); }
  catch (e) { return {}; }
}
function saveJSON(file, data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

let rentals = loadJSON(ROOMS_FILE);  // roomCode -> { plan, status, expiresAt }
let orders  = loadJSON(ORDERS_FILE); // reference_id -> { roomCode, plan, status, createdAt }

function saveRentals() { saveJSON(ROOMS_FILE, rentals); }
function saveOrders()  { saveJSON(ORDERS_FILE, orders); }

function pagbankBaseUrl() {
  return process.env.PAGBANK_ENV === 'production'
    ? 'https://api.pagseguro.com'
    : 'https://sandbox.api.pagseguro.com';
}

function roomStatus(roomCode) {
  const r = rentals[roomCode];
  if (!r) return { active: false };
  const active = r.status === 'active' && r.expiresAt > Date.now();
  return { active, plan: r.plan, expiresAt: r.expiresAt };
}

// Cria um Checkout no PagBank e devolve a URL de pagamento para redirecionar
// o cliente.
async function createCheckout({ roomCode, plan, publicBaseUrl }) {
  const planConfig = PLANS[plan];
  if (!planConfig) throw Object.assign(new Error('Plano inválido.'), { status: 400 });
  if (!/^\d{4}$/.test(roomCode)) throw Object.assign(new Error('Código de sala inválido.'), { status: 400 });

  const token = process.env.PAGBANK_TOKEN;
  if (!token) throw Object.assign(new Error('PAGBANK_TOKEN não configurado no servidor.'), { status: 500 });

  const referenceId = `${roomCode}-${plan}-${Date.now()}`;
  const returnUrl = `${publicBaseUrl}/pagamento-retorno.html?ref=${encodeURIComponent(referenceId)}&sala=${roomCode}`;

  const body = {
    reference_id: referenceId,
    customer_modifiable: true,
    items: [
      { name: `Aluguel sala ${roomCode} — Plano ${planConfig.label}`, quantity: 1, unit_amount: planConfig.price }
    ],
    redirect_url: returnUrl,
    return_url: returnUrl,
    payment_notification_urls: [`${publicBaseUrl}/api/pagbank/webhook`],
  };

  const res = await fetch(`${pagbankBaseUrl()}/checkouts`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok || !data) {
    const detail = data ? JSON.stringify(data) : `HTTP ${res.status}`;
    throw Object.assign(new Error('PagBank recusou a criação do checkout: ' + detail), { status: 502 });
  }

  const payLink = (data.links || []).find(l => l.rel === 'PAY');
  if (!payLink) throw Object.assign(new Error('PagBank não retornou link de pagamento.'), { status: 502 });

  orders[referenceId] = { roomCode, plan, status: 'pending', createdAt: Date.now() };
  saveOrders();

  return { paymentUrl: payLink.href, referenceId };
}

// Confere a assinatura SHA-256 enviada pelo PagBank no header
// x-authenticity-token, usando o corpo bruto (não re-serializado) da
// requisição, conforme:
// https://developer.pagbank.com.br/reference/confirmar-autenticidade-da-notificacao
function isAuthentic(rawBody, signatureHeader) {
  const token = process.env.PAGBANK_TOKEN;
  if (!token || !signatureHeader) return false;
  const expected = crypto.createHash('sha256').update(`${token}-${rawBody}`).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
  } catch (e) {
    return false; // comprimentos diferentes, por exemplo — trata como inválido
  }
}

// Processa a notificação de pagamento (payload é o objeto Order do PagBank,
// com charges[].status). Só libera a sala quando o status for PAID e o
// pedido ainda não tiver sido processado (evita duplicar dias em reenvios).
function handlePaymentNotification(payload) {
  const referenceId = payload && payload.reference_id;
  const order = referenceId && orders[referenceId];
  if (!order) return { ok: false, reason: 'reference_id desconhecido' };

  const charge = (payload.charges || [])[0];
  const status = charge && charge.status;

  if (status === 'PAID' && order.status !== 'paid') {
    const planConfig = PLANS[order.plan];
    const current = rentals[order.roomCode];
    const base = (current && current.status === 'active' && current.expiresAt > Date.now())
      ? current.expiresAt
      : Date.now();

    rentals[order.roomCode] = {
      plan: order.plan,
      status: 'active',
      expiresAt: base + planConfig.days * 24 * 60 * 60 * 1000,
    };
    order.status = 'paid';
    saveRentals();
    saveOrders();
    return { ok: true, roomCode: order.roomCode };
  }

  if (status && status !== 'PAID' && order.status === 'pending') {
    order.status = status.toLowerCase();
    saveOrders();
  }

  return { ok: true, ignored: true };
}

module.exports = { PLANS, roomStatus, createCheckout, isAuthentic, handlePaymentNotification };
