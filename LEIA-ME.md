# O que mudou

1. **Câmera, áudio e legendas ligam sozinhos.** Ao entrar na sala, o sistema já
   pede câmera/microfone e já ativa as legendas automáticas — sem precisar
   clicar em nada. O botão de câmera só reaparece se a permissão for negada
   (para tentar de novo), e o botão "Legendas" virou um pausar/retomar opcional.

2. **Buffer de 5 segundos de fala.** Em vez de traduzir frase a frase, o
   sistema junta o que foi reconhecido por 5 segundos antes de mandar para o
   tradutor. Frases ficam mais completas e a tradução sai bem melhor —
   principalmente enquanto alguém está compartilhando tela ou usando a lousa.

3. **Tradutor trocado: DeepL (com Google Translate como alternativa automática).**
   Isso é importante: **a DeepL não permite ser chamada direto do navegador**
   (ela bloqueia CORS por segurança). Um site 100% estático como esse nunca
   conseguiria falar com a DeepL sozinho — é uma limitação da própria DeepL,
   não do sistema. Por isso:
   - Sem configurar nada, o sistema já usa o **Google Translate** automaticamente
     (funciona direto do navegador, sem servidor, e é bem melhor que o tradutor
     anterior).
   - Se você quiser DeepL de verdade, incluí um proxy pronto
     (`cloudflare-worker-deepl.js`) — um servidor gratuito da Cloudflare que
     guarda sua chave DeepL em segredo e repassa as traduções. O passo a passo
     está comentado no topo do próprio arquivo (~5 minutos, sem cartão).
     Depois é só colar a URL do seu Worker na linha `DEEPL_PROXY_URL` do
     `index.html` e gerar a versão protegida de novo (`node obfuscate.js`).

4. **Sistema de sala independente para os clientes.** Já existia (PeerJS +
   código de 4 dígitos), mas agora tem um botão **🔗 Convite** na sala que
   copia um link pronto (`seusite.com/index.html?sala=1234`). O cliente só
   abre o link, o código já vem preenchido, digita o nome e entra — não
   precisa saber nada do funcionamento por trás.

5. **Chat com tradução.** Toda mensagem digitada agora é traduzida
   automaticamente antes de ser enviada (mesmo motor de tradução das
   legendas) e aparece com o texto original + tradução. Serve como plano B
   se a comunicação por vídeo cair.

6. **Proteção do código-fonte.** Bloqueei botão direito, atalhos de DevTools
   (F12, Ctrl+Shift+I/J/C, Ctrl+U) e coloquei um aviso quando o DevTools é
   aberto. Mais importante: criei uma **versão ofuscada** do JavaScript
   (`index.protegido.html`) — é essa que deve ser publicada/enviada para os
   clientes; guarde o `index.html` normal só para você editar depois.

   **Seja realista sobre isso:** nenhum site consegue esconder 100% seu
   código de quem está determinado — o navegador da pessoa *precisa* receber
   o HTML/CSS/JS para funcionar, então sempre existe alguma forma de acessá-lo
   (modo desenvolvedor remoto, extensões, etc). O que dá pra fazer de verdade
   é dificultar bastante a cópia casual, que é o que foi feito aqui. Proteção
   jurídica real (registro de programa de computador no INPI, termos de uso,
   marca d'água nos vídeos) complementa isso e é mais eficaz a longo prazo
   que qualquer trava técnica.

# Arquivos entregues

- `index.html` — código-fonte legível, para você continuar editando.
- `index.protegido.html` — versão ofuscada, é essa que vai para os clientes.
- `cloudflare-worker-deepl.js` — proxy opcional para usar a DeepL de verdade.
- `obfuscate.js` — script Node que gera o `index.protegido.html` a partir do
  `index.html` (rode `node obfuscate.js` sempre que editar o código-fonte).
