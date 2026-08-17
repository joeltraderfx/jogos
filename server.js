const express = require('express');
const path = require('path');
const { WebSocketServer } = require('ws');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '256kb' }));

// Secure DeepL proxy. Keep DEEPL_AUTH_KEY only on the server.
app.post('/api/deepl/translate', async (req, res) => {
  const { text, sourceLang, targetLang } = req.body || {};
  if (typeof text !== 'string' || !text.trim() || text.length > 3000) {
    return res.status(400).json({ error: 'Texto inválido' });
  }
  const authKey = process.env.DEEPL_AUTH_KEY;
  if (!authKey) return res.status(503).json({ error: 'DeepL não configurado' });
  try {
    const response = await fetch('https://api-free.deepl.com/v2/translate', {
      method: 'POST',
      headers: { 'Authorization': `DeepL-Auth-Key ${authKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ text: text.trim(), source_lang: String(sourceLang || '').slice(0, 5).toUpperCase(), target_lang: String(targetLang || 'EN').slice(0, 5).toUpperCase() })
    });
    if (!response.ok) return res.status(502).json({ error: 'Falha no DeepL' });
    const data = await response.json();
    res.json({ translatedText: data.translations?.[0]?.text || '' });
  } catch (error) {
    res.status(502).json({ error: 'Serviço de tradução indisponível' });
  }
});

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
