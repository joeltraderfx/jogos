const express = require('express');
const path = require('path');
const { WebSocketServer } = require('ws');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '256kb' }));
app.use(express.static(__dirname));

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
