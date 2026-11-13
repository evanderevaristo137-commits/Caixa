# O que comprar para o servidor

Lista para o fundador, preparada no fim da Fase 6 (13/11/2026). Os preços foram vistos nesse dia: **confirme no site de cada serviço no dia da compra**, porque mudam.

## Resumo

| O quê                                                         | Para quê                                                                                                           | Custo (13/11/2026)                                                                                                                         | Quando                                             |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| **Endereço próprio da app** (domínio, por exemplo `caixa.ao`) | A app instalada fica presa ao endereço onde foi instalada. Tem de ser o definitivo antes das lojas reais.          | `.ao`: entre cerca de 20.000 e 40.000 Kz por ano, conforme o registador (pedem NIF ou BI). `.com`: cerca de 10 a 15 USD por ano.           | **Primeiro**, antes de tudo.                       |
| **Supabase, plano Pro**                                       | A base de dados na nuvem: contas por loja, cópia automática, vários telemóveis na mesma loja e o painel do piloto. | 25 USD por mês (inclui 10 USD de servidor, o suficiente para o piloto). Paga-se com cartão internacional (Visa ou Mastercard), em dólares. | Antes da primeira loja real a usar contas.         |
| **Envio de e-mails** (para entrar na conta)                   | O código de entrada chega por e-mail.                                                                              | Grátis nos planos pequenos (por exemplo Brevo ou Resend).                                                                                  | Junto com o Supabase.                              |
| SMS (entrar com o número de telefone)                         | Mais simples para quem não usa e-mail.                                                                             | Pago por mensagem.                                                                                                                         | **Não agora**: só com a sua aprovação, mais tarde. |

A app continua publicada **de graça** no GitHub Pages, também com o endereço próprio e com ligação segura (HTTPS).

## O que não comprar

- **Hospedagem de sites comum** (cPanel, WordPress): a app já está publicada de graça e não precisa dela. O que falta é a base de dados com contas.
- **Servidor virtual (VPS):** é mais barato, mas obriga a manter e a proteger a máquina todos os dias. Com dados de lojas reais, é um risco que não compensa no piloto.

## Porque o Supabase

- **Base de dados gerida** (Postgres), com contas e com regras para que cada loja veja só os seus dados. Não há máquina para manter.
- **Plano gratuito:** serve para eu ligar a app e testar. Tem 500 MB, e o projecto pára sozinho depois de uma semana sem uso. Não serve para lojas reais.
- **Plano Pro (25 USD por mês):**
  - inclui 100.000 utilizadores por mês, 8 GB de base de dados e 250 GB de tráfego;
  - nunca pára por falta de uso;
  - tem cópias diárias;
  - o limite de gastos vem ligado: ao chegar ao limite, pára em vez de cobrar mais.
- **Chega para o piloto:** 30 lojas com 80 vendas por dia somam cerca de 4 MB por dia, cerca de 1,5 GB por ano. Cabe nos 8 GB, mesmo com folga.

## Onde ficam os dados (a região)

- O Supabase **não tem região em África**. As mais perto são na Europa (Frankfurt, Paris, Londres, Irlanda, Zurique, Estocolmo) e em São Paulo.
- **Proposta: Europa, numa região da União Europeia** (por exemplo Frankfurt), por causa das regras de protecção de dados da União Europeia (RGPD). A sincronização corre em segundo plano: a distância não se nota ao vender.
- **Lei n.º 22/11 (protecção de dados, Angola):**
  - enviar dados para um país com protecção adequada exige **notificar** a Agência de Protecção de Dados (APD);
  - para um país sem protecção adequada é preciso **autorização prévia** da APD.
  - Há uma proposta de lei nova (versão de 2025) que pode mudar isto.
  - **Confirmar com o advogado antes de pôr dados reais na nuvem.**
  - A Política de privacidade tem de passar a dizer que os nomes e telefones dos clientes vão para o servidor.

## Ordem sugerida

1. **Escolher e comprar o endereço.**
   - Eu ligo-o ao GitHub Pages (grátis, com HTTPS).
   - As lojas de teste reinstalam a app no endereço novo. Os dados de teste ficam no endereço antigo, e as lojas reais ainda não começaram.
2. **Rever com o advogado:** a Política de privacidade e a notificação (ou autorização) da APD.
3. **Criar a conta no Supabase:**
   - **em nome do fundador ou da empresa**, com a sua própria palavra-passe;
   - se eu precisar de acesso, o fundador convida-me para a organização (nunca partilhar a palavra-passe);
   - escolher a região;
   - começar no plano gratuito para a ligação e os testes, e passar ao Pro antes da primeira loja real.
4. **Eu ligo a app** (Fase 2 do produto). A app já está preparada (ver `docs/SINCRONIZACAO.md`):
   - contas por loja;
   - sincronização;
   - cópia automática;
   - o painel do piloto.

## Fontes (consultadas a 13/11/2026)

- Preços do Supabase: [makerkit.dev](https://makerkit.dev/blog/saas/supabase-pricing), [nocode.mba](https://www.nocode.mba/articles/supabase-pricing), [jetadmin.io](https://www.jetadmin.io/blog/supabase-pricing-2026-guide-to-plans-limits-and-real-world-costs/); página oficial a confirmar: supabase.com/pricing.
- Pausa dos projectos gratuitos: [Supabase, perguntas frequentes](https://supabase.com/kb/faqs/platform/free-project-pausing).
- Regiões: [Supabase, regiões disponíveis](https://supabase.com/docs/guides/platform/regions).
- E-mails das contas: [Supabase, lista para produção](https://supabase.com/docs/guides/deployment/going-into-prod).
- Endereço próprio com HTTPS no GitHub Pages: [GitHub Docs](https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https).
- Domínios `.ao`: [DNS.AO](https://dns.ao/ao/noticias/comunicado-venda-de-novos-dominios/), [registar.ao](https://www.registar.ao/dominios/ao?language=english), [novaweb.ao](https://novaweb.ao/dominios), [angoweb.ao](https://angoweb.ao/cart.php?gid=registerdomain).
- Lei n.º 22/11: [lex.ao](https://lex.ao/docs/assembleia-nacional/2011/lei-n-o-22-11-de-17-de-junho/); proposta de 2025: [angolex.com](https://angolex.com/paginas/projecto-lei/proposta-de-lei-de-proteccao-de-dados-pessoais-versao-2025a.html).
