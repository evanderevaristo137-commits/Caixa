# Projecto: «A caixa no telemóvel» (nome provisório)

## Quem sou e como falar comigo

Sou o fundador. Não sou programador e trabalho muitas vezes a partir do telemóvel. Fala comigo em português, de forma simples e sem jargão. Explica cada decisão importante numa frase.

## O produto

Uma app que faz de caixa registadora para pequenos negócios em Angola (mini-mercados, farmácias, lojas de peças auto): registar vendas, receber por vários meios, controlar o stock e o fiado. Mais tarde: facturação electrónica certificada (através de um parceiro já certificado pela AGT), pagamentos integrados e crédito para stock com um banco parceiro.

Utilizadora típica: a Dona Teresa, dona de um mini-mercado no Cazenga. Tem um telemóvel Android barato (2 a 3 GB de RAM), a rede e a luz falham, os dados móveis são caros e não tem paciência para apps complicadas.

## Objectivo desta sessão: Fase 1

Construir uma app web progressiva (PWA) que funcione offline no telemóvel e tenha um modo de demonstração. Vou usá-la para mostrar a ideia nas visitas a comerciantes, e deve servir de base ao piloto. Publica-a no GitHub Pages para eu a abrir no telemóvel.

## Funcionalidades da Fase 1

1. **Vender:** lista de produtos com pesquisa e leitura do código de barras pela câmara; carrinho; total; escolha do meio de pagamento (QR KWiK, Multicaixa Express, Unitel Money, Afrimoney, numerário ou fiado); confirmação. No fiado, escolher ou criar o cliente. Talão partilhável por WhatsApp, sempre com o aviso «Documento não fiscal — não serve de factura».
2. **Fiado:** clientes com saldo, dias em atraso e histórico; registar pagamentos parciais ou totais; botão «Lembrar por WhatsApp» que abre o wa.me com uma mensagem educada já escrita.
3. **Hoje:** total vendido, número de vendas, comparação com ontem, divisão por meio de pagamento, produtos com stock baixo e total em fiado.
4. **Produtos e stock:** criar e editar produtos (nome, preço, código de barras, stock, stock mínimo), entradas de stock e acertos com motivo.
5. **Modo demonstração:** dados de exemplo da «Mercearia da Dona Teresa» (uns 30 produtos comuns em Angola, 5 clientes no fiado e duas semanas de vendas), com um botão para repor os dados. Nunca misturar com dados reais.
6. **Definições:** nome da loja, telefone, NIF (opcional), exportar os dados (CSV e JSON) e importar uma cópia de segurança.

## Requisitos técnicos

- Stack sugerida: React + TypeScript + Vite, PWA com vite-plugin-pwa, IndexedDB com Dexie, Tailwind, testes com Vitest e publicação no GitHub Pages por GitHub Actions. Se tiveres uma razão forte para outra escolha, explica-ma antes de mudar.
- Offline primeiro: tudo funciona sem internet e, nesta fase, os dados ficam só no telemóvel.
- Dinheiro sempre em números inteiros (cêntimos de kwanza), nunca em vírgula flutuante. No ecrã: «12.500 Kz».
- Preparado para as fases seguintes: acesso aos dados através de repositórios; interfaces `InvoiceProvider` e `PaymentProvider` só com implementações de teste; IDs únicos (UUID) e datas de criação e alteração em todos os registos, para sincronizar mais tarde; registo das alterações para auditoria.
- Leve e rápido em Android 8+ com Chrome: carregamento inicial pequeno e poucas dependências.
- Interface em português de Angola, com a ortografia usada no país (facturação, acção, actualizar). Botões grandes, poucos passos, bom contraste e uso com uma só mão.
- Dados pessoais (nomes e telefones de clientes): guardar só o necessário e nunca enviar para serviços externos.
- Código e nomes técnicos em inglês; textos da app em português.

## O que NÃO fazer agora

- Nada que pareça uma factura fiscal: só software certificado pela AGT pode emitir facturas, e isso virá através de um parceiro.
- Pagamentos reais, dados de cartões ou credenciais bancárias.
- Contas de utilizador, servidor e crédito (ficam para as fases seguintes).
- Serviços pagos sem me perguntar.

## Como quero que trabalhes

1. Guarda este documento como `CLAUDE.md` na raiz do repositório e mantém-no actualizado.
2. Antes de programar, mostra-me um plano curto (passos e decisões principais) e espera pela minha aprovação.
3. Trabalha em passos pequenos, com commits claros e testes para os cálculos (totais, stock e saldos do fiado).
4. No fim de cada passo, diz-me em 3 a 5 linhas o que mudou e como testar no telemóvel.
5. Pergunta-me só o que for decisão de negócio; o que for técnico, decide tu com bom senso e explica.

## Pronto quando

- Abro o link no telemóvel, instalo no ecrã inicial e uso sem internet.
- Faço uma venda de 3 produtos em menos de 30 segundos.
- O fiado mostra quem deve, quanto e há quantos dias, e o lembrete abre o WhatsApp com a mensagem.
- O ecrã Hoje bate certo com as vendas registadas.
- Os testes passam e o README explica, em português simples, como abrir e usar a app.

## Fases seguintes (só contexto, não fazer agora)

- **Fase 2, piloto com 30 lojas:** contas por loja, sincronização com um servidor (proposta: Supabase), um painel web para mim com as métricas do piloto (lojas activas por dia, vendas registadas, retenção) e versão Android na Play Store.
- **Fase 3:** ligação a um software de facturação já certificado pela AGT e a um prestador de pagamentos licenciado pelo BNA (QR KWiK, Multicaixa Express, Unitel Money).
- **Fase 4:** usar o histórico de vendas para crédito de stock com um banco parceiro, com reembolso automático a partir das vendas.

---

## Decisões tomadas (actualizar sempre que mudar)

- **Repositório próprio e público** (`Caixa`), separado da Fluxa, para publicar grátis no GitHub Pages.
- **Venda à unidade ou ao quilo** (o fundador pediu para avançar): cada produto escolhe na criação (`soldBy: 'weight'`), e não muda depois. Nos produtos ao quilo o preço é por kg e o peso, o stock e o mínimo guardam-se em **gramas inteiras** (sem vírgula flutuante). O total de cada linha ao quilo arredonda ao **kwanza inteiro** (não há moedas de cêntimos). Ao tocar num produto ao quilo abre a janela de pesar: peso (250 g, 500 g, 1 kg, 2 kg ou escrito) ou **valor pedido pelo cliente** («500 Kz de feijão»: paga exactamente esse valor e a app diz quanto pesar). Uma linha por produto ao quilo; no carrinho, «Mudar peso». Talão, Excel e pedido de factura mostram kg.
- **Vender nunca é bloqueado por falta de stock:** o stock pode ficar negativo e aparece a vermelho (o stock registado pode estar errado; a venda real não pode ser perdida).
- **Cada venda a crédito tem prazo («Pagar até»):** 7, 15 ou 30 dias, fim do mês ou outra data (nunca no passado). O prazo habitual é 15 dias e muda-se em «Mais». Os pagamentos abatem primeiro as compras mais antigas. Estados de cada cliente: em atraso, vence hoje, vence em breve (até 2 dias) ou mais tarde. As vendas a crédito feitas antes desta regra recebem 15 dias a contar da compra (actualização automática da base de dados, versão 2).
- **Avisos de pagamentos:** dentro da app, um cartão no «Hoje» e um número vermelho em «Clientes» (em atraso + vence hoje). Com a app fechada, uma notificação do Android (Periodic Background Sync): só com a app instalada e os avisos activados, à hora que o Android escolher, no máximo uma vez por dia e só com dados da loja real (nunca da demonstração). O código fica em `public/sw-alerts.js` e lê apenas a lista preparada pela app (`meta.creditAlertItems`).
- **O cliente é avisado por WhatsApp com a mensagem já escrita conforme o prazo** («vence a…», «vence hoje», «venceu a…»); a pessoa só toca em enviar. Enviar automaticamente, sem ninguém tocar, exige servidor e um serviço pago de SMS/WhatsApp: fica para a Fase 2 e só com autorização do fundador.
- **Demonstração numa base de dados separada** (`caixa-demo`); a loja real usa `caixa-loja`. O gerador da demonstração recusa escrever em qualquer outra base.
- **Leitor de código de barras nativo do Chrome** (`BarcodeDetector`), sem bibliotecas; onde não existir, pesquisa manual.
- **Pagamentos electrónicos simulados** pelo `FakePaymentProvider` (referências `TESTE-…`). Nenhum dinheiro real se move.
- **CSV com `;` e vírgula decimal**, para abrir directamente no Excel em português.
- **«Hoje» compara com ontem até à mesma hora** (comparação justa); o total do dia inteiro de ontem aparece em baixo, como referência.
- **Demonstração renova-se sozinha em cada novo dia** (para o «Hoje» nunca aparecer vazio numa visita). Uma cópia de segurança da demonstração não pode ser importada para a loja real.
- **Botão «voltar» do Android fecha a janela aberta** (carrinho, cobrança, cliente…) em vez de sair da app.
- **O carrinho fica guardado no telemóvel** até a venda ser confirmada, para não se perder se o Android fechar a app.
- **Anular vendas é permitido a qualquer momento, com motivo obrigatório.** A venda fica no histórico marcada como anulada, deixa de contar (totais, fiado), o stock volta por movimentos do tipo `void`, e o «Hoje» mostra quantas vendas foram anuladas, para o dono ver.
- **Cópia de segurança em `.txt` (conteúdo JSON):** o Chrome do Android só partilha alguns tipos de ficheiro (aceita .txt e .csv, recusa .json). Lembrete no «Hoje» 3 dias depois da primeira venda e depois a cada 7 dias (nunca na demonstração).
- **No ecrã Vender, os mais vendidos dos últimos 30 dias vêm primeiro;** a ordem fixa-se ao abrir o ecrã para os produtos não mudarem de sítio a meio de uma venda. Ordem alfabética portuguesa (`localeCompare('pt')`).
- **Dinheiro na caixa = vendas em numerário + fiado pago em numerário** (sem fundo de caixa nesta fase).
- **Lista de compras sugerida:** para cada produto com stock baixo, sugere comprar o suficiente para chegar ao dobro do mínimo (pelo menos 1). A pessoa pode mudar as quantidades no WhatsApp antes de enviar.
- **Talão de venda a fiado mostra o total em dívida** do cliente depois dessa compra.
- **Sem carregamento de ecrãs «a pedido» (lazy loading):** todos os ecrãs vão no ficheiro principal. Com ecrãs a pedido, uma versão publicada com a app aberta apagava os ficheiros antigos e o ecrã seguinte ficava em branco.
- **Actualizações nunca recarregam a app sozinhas** (pode estar a meio de uma venda): aparece «Há uma versão nova da app — Actualizar». A app procura versões novas quando volta ao ecrã (no máximo uma vez por hora).
- **Nomes na app:** a secção chama-se «Clientes» e a forma de pagamento «Cliente (a crédito)» (pedido do fundador; «fiado» deixou de aparecer). No código continua `credit`.
- **Formas de pagamento:** numerário, QR KWiK, Multicaixa Express, Unitel Money, Afrimoney, PayPay e cliente (a crédito).
- **NIF aceita letras e números** (o NIF de pessoa singular segue o BI); guarda-se em maiúsculas, sem espaços. É só um dado: a app não valida nada para efeitos fiscais.
- **Número de testes do WhatsApp (955 502 264)** usado em todos os clientes da demonstração, a pedido do fundador. Atenção: o repositório e a app são públicos, por isso este número fica visível.
- **Referência do pagamento (opcional)** nos pagamentos electrónicos e nos pagamentos de clientes (`transactionRef`): o código que aparece no telemóvel do cliente, para conferir com o banco. Cada venda e pagamento guarda também o `deviceId` do telemóvel (para a sincronização da Fase 2).
- **Código do dono (opcional, desligado por defeito):** 4 a 6 números, guardado só como resumo (SHA-256 com sal) em `meta`. Pedido para anular vendas, mudar preços, acertar stock, arquivar produtos, corrigir stock e recuperar cópias. Nunca vai nas cópias de segurança e recuperar uma cópia mantém o código do telemóvel. É dissuasão, não um cofre: quem controla o telemóvel pode apagar a app.
- **Verificar os dados:** recalcula a partir dos factos (stock = soma dos movimentos; total = soma das linhas; vendas a crédito e pagamentos com cliente; números de venda únicos). O stock corrige-se com um toque (auditado); o resto só é mostrado.
- **Registo de alterações** em português simples a partir de `audit` (`src/domain/audit-describe.ts`); por defeito mostra só o importante (anulações, preços, acertos, pagamentos, cópias, código do dono).
- **Preparado para facturação certificada (fase 3):** dados opcionais e escondidos por defeito (loja: morada, regime de IVA, IVA habitual; produto: unidade, IVA em pontos base, motivo de isenção; cliente: NIF). Cada linha de venda guarda a «fotografia» desses dados no dia da venda. `src/integrations/invoice-request.ts` monta o pedido de factura (FR/FT só sugeridos; quem decide é o parceiro) e o pedido de nota de crédito para anulações, com `requestId` idempotente. Nunca enviamos telefones de clientes. Não pomos taxas de IVA predefinidas: a lei e o regime confirmam-se com o contabilista/parceiro.
- **Pagamentos (fase 3):** `PaymentProvider` com `createPayment` (chave anti-duplicação = tentativa + meio + valor; nova chave depois de uma falha), `getPaymentStatus` (pagamentos que o cliente aprova no telemóvel) e `refundPayment`. Só versão de teste.
- **Documento para parceiros:** `docs/INTEGRACOES.md` (formatos, exemplos com dados fictícios e perguntas a fazer ao parceiro de facturação e ao de pagamentos). Manter actualizado sempre que os formatos mudarem.
- **Limite de crédito (pedido do fundador):** limite habitual em «Mais» (sem limite, 10.000, 25.000, 50.000 Kz ou outro) e limite próprio por cliente, que prevalece. Na loja real começa **sem limite** (cada loja escolhe); na demonstração é 30.000 Kz. Na cobrança a crédito a app mostra quanto o cliente já deve, o limite e se tem atrasos. Passar o limite exige «Confirmar acima do limite» (e o código do dono, se existir); a venda fica marcada (`creditLimitOverride`) e aparece no registo de alterações. O `Store` recusa (`credit_limit`) sem essa confirmação.
- **Endereço público:** https://evanderevaristo137-commits.github.io/Caixa/ (o «C» maiúsculo conta: a app instalada só funciona nesse endereço exacto).

## Notas técnicas

- Comandos: `npm install`, `npm run dev`, `npm test` (cálculos e base de dados), `npm run e2e` (a app inteira num Android simulado: venda, fiado, Hoje, anulação, offline, botão voltar, loja/demonstração separadas), `npm run typecheck`, `npm run build`.
- O GitHub Actions corre formatação, `npm test` e `npm run e2e` antes de cada publicação; se algo falhar, a versão publicada não muda.
- Estrutura: `src/domain` (regras e cálculos puros, com testes), `src/data` (base de dados Dexie e repositórios em `store.ts`), `src/providers` (pagamentos e facturação, só versões de teste), `src/screens` (um ficheiro ou pasta por ecrã) e `src/ui` (componentes base e botão «voltar»), `src/i18n/pt-AO.ts` (todos os textos da app).
- Formatação: `npm run format` (Prettier).
- Dinheiro: inteiros em cêntimos (`priceCents`, `totalCents`); formatar só com `formatKz`.
- Todas as escritas passam por `Store`, dentro de uma transacção, e geram uma linha em `audit`.
- Publicação: GitHub Actions (`.github/workflows/deploy.yml`) testa, constrói e publica a cada push para `main`.
