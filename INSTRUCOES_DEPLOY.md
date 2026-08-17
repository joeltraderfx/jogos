# Sistema de reunião multilingue — implantação segura

O arquivo `index_revisado.html` implementa a entrada automática na sala, a solicitação automática de câmera e microfone, a tradução contínua com janela de fala de cinco segundos, as mensagens com tradução, a visualização da tradução sobre a lousa e o compartilhamento de tela, e a criptografia AES-GCM das mensagens sensíveis quando a chave da sala já estiver pronta.

## DeepL

O navegador chama apenas o endpoint relativo `/api/deepl/translate`. A chave do DeepL não deve ser colocada no HTML, em JavaScript público ou em variáveis expostas ao cliente. Use o exemplo `deepl-proxy.example.js` em um servidor HTTPS e defina `DEEPL_AUTH_KEY` somente como variável de ambiente do servidor.

O proxy deve receber `{ text, sourceLang, targetLang }` e devolver `{ translatedText }`. Restrinja CORS ao domínio real da aplicação, aplique limite de requisições por IP e registre somente metadados mínimos, nunca o conteúdo de reuniões.

## Limitações importantes

A câmera, o microfone e o compartilhamento de tela não podem ser autorizados silenciosamente por uma página web. O navegador pode exibir o pedido de permissão na primeira utilização; depois da autorização, a sala tenta iniciar esses recursos automaticamente.

Um HTML entregue ao navegador sempre pode ser inspecionado por alguém tecnicamente experiente. As medidas incluídas — CSP, ausência de chave DeepL no cliente, criptografia de mensagens e bloqueios de cópia acidentais — aumentam a proteção, mas não tornam o código-fonte impossível de copiar. Para proteger lógica proprietária, mantenha-a no servidor e publique somente o cliente indispensável.

A criação e o ingresso em salas continuam independentes por código PeerJS. Para produção, recomenda-se substituir o identificador previsível por um servidor de sinalização próprio, autenticação de participantes, expiração de salas e TURN privado para conexões em redes restritivas.
