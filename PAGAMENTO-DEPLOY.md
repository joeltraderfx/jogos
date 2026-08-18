# Aluguel de sala com pagamento PagBank — implantação no Render

## O que foi adicionado

- `pagbank.js` — cria o Checkout no PagBank, valida a assinatura do webhook (SHA-256) e libera a sala pelo número de dias do plano contratado.
- `server.js` — três rotas novas: `/api/planos`, `/api/checkout`, `/api/room-status/:code` e `/api/pagbank/webhook`.
- `planos.html` — página onde você escolhe o código da sala (4 dígitos) e o plano, e é redirecionado para o checkout do PagBank.
- `pagamento-retorno.html` — página que o PagBank mostra depois do pagamento; fica checando se a sala já foi liberada.
- `index.html` / `index.protegido.html` — agora bloqueiam a entrada (tanto "Criar Sala" quanto "Entrar na Sala") se a sala não estiver dentro do período pago.

**Modelo**: 1 código de sala = 1 aluguel. Quando o pagamento é aprovado, aquele código fica ativo pelo número de dias do plano. Pagar de novo antes de vencer soma os dias (não perde o tempo restante).

## Passo 1 — Gerar o token PagBank (sandbox primeiro)

1. Acesse o [Portal do Desenvolvedor PagBank](https://portaldev.pagbank.com.br/)
2. Aba **Tokens** → copie o token do ambiente **Sandbox**
3. Guarde esse valor — você vai colar direto no Render, nunca no código

Quando estiver tudo funcionando, gere o token de **produção** em [Vendas → Integrações → Gerar Token](https://acesso.pagseguro.uol.com.br/) e troque a variável `PAGBANK_ENV` para `production`.

## Passo 2 — Publicar no Render

1. Acesse [render.com](https://render.com) e crie uma conta grátis (pode usar login do GitHub)
2. **New** → **Web Service**
3. Conecte o repositório `joeltraderfx/jogos`
4. Configuração:
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Free
5. Em **Environment**, adicione as variáveis:

| Nome | Valor |
|---|---|
| `PAGBANK_TOKEN` | o token copiado no Passo 1 |
| `PAGBANK_ENV` | `sandbox` (troque para `production` depois dos testes) |
| `PUBLIC_BASE_URL` | a URL que o Render vai te dar, ex: `https://jogos-xxxx.onrender.com` (você só sabe isso depois do primeiro deploy — pode voltar aqui e completar) |

6. Clique em **Create Web Service** e aguarde o build.
7. Depois do primeiro deploy, copie a URL pública que o Render mostrou, volte em **Environment** e preencha `PUBLIC_BASE_URL` com ela (sem barra no final). Isso é necessário porque essa URL é usada para montar o link de retorno e o endereço do webhook que o PagBank vai chamar.
8. Clique em **Manual Deploy → Deploy latest commit** para aplicar a variável.

## Passo 3 — Testar no sandbox

1. Acesse `https://SEU-APP.onrender.com/planos.html`
2. Escolha um código de sala (ex: `1234`) e um plano
3. Use um [cartão de teste do PagBank](https://developer.pagbank.com.br/docs/cartoes-de-teste) para simular o pagamento
4. Você deve ser redirecionado para `pagamento-retorno.html`, que confirma automaticamente em alguns segundos
5. Vá em `https://SEU-APP.onrender.com/index.html`, digite o mesmo código e clique em **Criar Sala** — deve entrar normalmente

Se a confirmação nunca chegar, veja os **Logs** do serviço no painel do Render — o webhook (`/api/pagbank/webhook`) registra tentativas ali.

## Passo 4 — Ir para produção

1. Gere o token de **produção** no painel PagBank (Passo 1, segunda parte)
2. No Render, troque `PAGBANK_TOKEN` pelo token de produção e `PAGBANK_ENV` para `production`
3. Redeploy

## Limitações importantes

- **Armazenamento**: o Render free tier tem disco efêmero — os arquivos `data/rooms.json` e `data/orders.json` (onde ficam as salas pagas) podem ser apagados em um redeploy ou após muito tempo inativo. Para uso comercial sério, o próximo passo é trocar esses arquivos por um banco de dados de verdade (o Render tem PostgreSQL grátis por 90 dias, depois é pago). Enquanto o volume for baixo, o arquivo já resolve.
- **Plano free "dorme"**: o Render free tier coloca o serviço para dormir após ~15 minutos sem tráfego, e a primeira requisição depois disso demora ~30-50s para acordar. Isso pode atrasar a confirmação de um pagamento se o cliente já tiver fechado a aba. Para evitar isso em produção, o plano pago do Render (a partir de ~US$7/mês) mantém o serviço sempre ativo.
- **Webhook duplicado**: o PagBank pode reenviar a mesma notificação mais de uma vez — o código já trata isso (só processa se o pedido ainda não tiver sido marcado como pago), então não corre o risco de somar dias em dobro por reenvio.
