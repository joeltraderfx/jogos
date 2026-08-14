const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '256kb' }));
app.use(express.static(path.join(__dirname, 'public')));

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

app.listen(PORT, () => {
  console.log('Pênalti Decisivo server listening on port ' + PORT);
});
