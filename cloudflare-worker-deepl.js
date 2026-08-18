/**
 * Proxy DeepL para a sala de reunião multilíngue.
 *
 * Por que isso existe: a API da DeepL não permite ser chamada direto do
 * navegador (ela não libera CORS para qualquer site), então um site estático
 * puro (como o index.html do sistema) NUNCA consegue chamar a DeepL sozinho.
 * Esse Worker roda no servidor da Cloudflare, guarda sua chave DeepL em
 * segredo, e repassa o pedido — o navegador fala com o Worker, o Worker fala
 * com a DeepL.
 *
 * COMO USAR (leva uns 5 minutos, sem cartão de crédito):
 *  1. Crie uma conta grátis em https://dash.cloudflare.com
 *  2. No menu, vá em "Workers & Pages" → "Create" → "Create Worker".
 *  3. Apague o código de exemplo e cole todo o conteúdo deste arquivo.
 *  4. Clique em "Deploy".
 *  5. Vá em Settings → Variables → "Add variable" → em "Encrypt" marque SIM,
 *     nome: DEEPL_API_KEY, valor: sua chave da DeepL
 *     (crie uma grátis em https://www.deepl.com/pro-api, plano "Free").
 *  6. Copie a URL do Worker (algo como
 *     https://sala-traducao.SEUNOME.workers.dev).
 *  7. No arquivo index.html do sistema, encontre a linha:
 *       const DEEPL_PROXY_URL = '';
 *     e cole sua URL ali dentro das aspas, por exemplo:
 *       const DEEPL_PROXY_URL = 'https://sala-traducao.seunome.workers.dev';
 *  8. Gere a versão protegida de novo (arquivo obfuscate.js) e distribua o
 *     index.protegido.html atualizado para seus clientes.
 *
 * Sem esse passo, o sistema já funciona sozinho usando o Google Translate
 * como alternativa gratuita (sem precisar de servidor nenhum) — a diferença
 * é que a qualidade da DeepL costuma ser melhor, principalmente em textos
 * técnicos digitados na lousa/tela compartilhada.
 */

const ALLOWED_ORIGINS = '*'; // troque por 'https://seudominio.com' depois de testar, para travar quem pode usar seu Worker

export default {
  async fetch(request, env) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': ALLOWED_ORIGINS,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== 'POST') {
      return new Response('Método não permitido', { status: 405, headers: corsHeaders });
    }

    if (!env.DEEPL_API_KEY) {
      return new Response(JSON.stringify({ error: 'DEEPL_API_KEY não configurada no Worker.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return new Response(JSON.stringify({ error: 'JSON inválido.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { text, source_lang, target_lang } = body || {};
    if (!text) {
      return new Response(JSON.stringify({ error: 'Campo "text" é obrigatório.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Chaves "Free" da DeepL usam o endpoint api-free.deepl.com; chaves "Pro"
    // usam api.deepl.com. Detecta automaticamente pelo sufixo ":fx" da chave.
    const isFreeKey = env.DEEPL_API_KEY.endsWith(':fx');
    const deeplUrl = isFreeKey
      ? 'https://api-free.deepl.com/v2/translate'
      : 'https://api.deepl.com/v2/translate';

    const params = new URLSearchParams();
    params.append('text', text);
    if (target_lang) params.append('target_lang', target_lang);
    if (source_lang) params.append('source_lang', source_lang);

    const deeplRes = await fetch(deeplUrl, {
      method: 'POST',
      headers: {
        'Authorization': `DeepL-Auth-Key ${env.DEEPL_API_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const deeplData = await deeplRes.text();
    return new Response(deeplData, {
      status: deeplRes.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  },
};
