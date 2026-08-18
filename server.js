const express = require('express');
const path = require('path');
const { WebSocketServer } = require('ws');
const pagbank = require('./pagbank');

const app = express();
const PORT = process.env.PORT || 3000;

// Guarda o corpo bruto de toda requisição JSON — necessário para o webhook
// do PagBank, cuja assinatura é calculada sobre os bytes exatos recebidos
// (reformatar o JSON quebraria a comparação SHA-256).
app.use(express.json({
  limit: '256kb',
  verify: (req, res, buf) => { req.rawBody = buf.toString('utf-8'); }
}));
app.use(express.static(__dirname, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      // Never let phones cache a stale version of the game — this is what
      // caused some players to see an old build without a feature that was
      // already deployed.
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

// ================= Aluguel de sala (pagamento PagBank) =================
function publicBaseUrl(req) {
  return process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
}

app.get('/api/planos', (req, res) => {
  res.json(pagbank.PLANS);
});

app.get('/api/room-status/:code', (req, res) => {
  res.json(pagbank.roomStatus(req.params.code));
});

app.post('/api/checkout', async (req, res) => {
  const { roomCode, plan } = req.body || {};
  try {
    const result = await pagbank.createCheckout({ roomCode, plan, publicBaseUrl: publicBaseUrl(req) });
    res.json(result);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// TEMPORÁRIO — só para diagnosticar o problema de autenticação com o
// PagBank. Mostra (mascarado) qual token o servidor está realmente usando e
// a resposta crua do PagBank para uma chamada de teste real. Remover depois
// que o pagamento estiver funcionando — não deixar endpoints de diagnóstico
// expostos publicamente em produção por mais tempo do que o necessário.
app.get('/api/pagbank-debug', async (req, res) => {
  const token = process.env.PAGBANK_TOKEN || '';
  const masked = token ? `${token.slice(0, 8)}...${token.slice(-6)} (comprimento: ${token.length})` : '(vazio — variável não configurada)';

  let pagbankResult;
  try {
    const baseUrl = process.env.PAGBANK_ENV === 'production' ? 'https://api.pagseguro.com' : 'https://sandbox.api.pagseguro.com';
    const testRes = await fetch(`${baseUrl}/checkouts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        reference_id: 'diagnostico-' + Date.now(),
        items: [{ name: 'Diagnóstico', quantity: 1, unit_amount: 1000 }],
      }),
    });
    const bodyText = await testRes.text();
    let parsedBody;
    try { parsedBody = JSON.parse(bodyText); } catch (e) { parsedBody = bodyText; }
    pagbankResult = { httpStatus: testRes.status, body: parsedBody };
  } catch (e) {
    pagbankResult = { error: 'Falha de rede ao chamar o PagBank: ' + e.message };
  }

  res.json({
    ambiente: process.env.PAGBANK_ENV || '(não configurado, usando sandbox por padrão)',
    tokenMascarado: masked,
    publicBaseUrl: publicBaseUrl(req),
    respostaDoPagBank: pagbankResult,
  });
});

app.post('/api/pagbank/webhook', (req, res) => {
  const signature = req.get('x-authenticity-token');
  if (!pagbank.isAuthentic(req.rawBody, signature)) {
    // Não é uma notificação genuína do PagBank — descarta sem processar.
    return res.status(401).json({ error: 'assinatura inválida' });
  }
  const result = pagbank.handlePaymentNotification(req.body);
  res.status(200).json(result);
});

// Simple in-memory room store. Good enough for a live demo — resets if the
// server restarts or redeploys, which on Render's free tier can also happen
// after long periods of inactivity.
const store = new Map();

app.get('/kv/:key', (req, res) => {
  const val = store.get(req.params.key);
  res.json(val === undefined ? null : val);
});

app.put('/kv/:key', (req, res) => {
  store.set(req.params.key, req.body);
  res.json({ ok: true });
});

app.get('/health', (req, res) => res.send('ok'));

const server = app.listen(PORT, () => {
  console.log('Pênalti Decisivo server listening on port ' + PORT);
});

// --- WebRTC signaling relay ---
// Only tiny JSON messages (offers/answers/ICE candidates) pass through here.
// The actual video/audio stream goes directly between the two players'
// devices (peer-to-peer), never through this server.
const wss = new WebSocketServer({ server, path: '/signal' });
const rooms = new Map(); // roomCode -> Map(playerId -> ws)

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://localhost');
  const room = url.searchParams.get('room');
  const id = url.searchParams.get('id');
  if (!room || !id) { ws.close(); return; }

  if (!rooms.has(room)) rooms.set(room, new Map());
  rooms.get(room).set(id, ws);
  ws._room = room;
  ws._id = id;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch (e) { return; }
    const peers = rooms.get(room);
    if (!peers || !msg || !msg.to) return;
    const target = peers.get(msg.to);
    if (target && target.readyState === target.OPEN) {
      target.send(JSON.stringify({ from: id, data: msg.data }));
    }
  });

  ws.on('close', () => {
    const peers = rooms.get(room);
    if (peers) {
      peers.delete(id);
      if (peers.size === 0) rooms.delete(room);
    }
  });
});
