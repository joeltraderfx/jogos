import express from 'express';

const app = express();
app.use(express.json({ limit: '16kb' }));

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
      headers: {
        'Authorization': `DeepL-Auth-Key ${authKey}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        text: text.trim(),
        source_lang: String(sourceLang || '').slice(0, 5).toUpperCase(),
        target_lang: String(targetLang || 'EN').slice(0, 5).toUpperCase()
      })
    });

    if (!response.ok) return res.status(502).json({ error: 'Falha no DeepL' });
    const data = await response.json();
    return res.json({ translatedText: data.translations?.[0]?.text || '' });
  } catch {
    return res.status(502).json({ error: 'Serviço de tradução indisponível' });
  }
});

app.listen(process.env.PORT || 3000, '0.0.0.0', () => {
  console.log('Proxy DeepL ativo');
});
