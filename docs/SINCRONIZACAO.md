# Sincronização: preparada, ainda sem servidor

Estado a 13/11/2026 (Fase 5, passo 5). Hoje os dados de cada loja ficam **só no telemóvel**. O que está preparado não envia nada a ninguém e não custa nada. Serve para, na Fase 2 (piloto), ligar a app a um servidor sem refazer a base de dados.

## Para que vai servir

- Vários telemóveis na mesma loja, com os mesmos produtos, clientes e vendas.
- Uma cópia automática na nuvem: um telemóvel perdido ou roubado já não leva a loja consigo.
- O painel do fundador com os números do piloto (lojas activas, vendas, retenção).

## O que já está pronto

1. **Cada registo tem identificação única** (um código aleatório, UUID) e as datas de criação e de alteração. As vendas e os pagamentos guardam também o telemóvel onde foram feitos.
2. **A lista do que se partilha e do que nunca sai do telemóvel**, tabela a tabela (`src/data/sync/tables.ts`). Um teste garante que nenhuma tabela nova fica esquecida.
3. **A fila de alterações** (`src/data/sync/outbox.ts`). Quando ligada, cada registo mudado fica apontado, seja qual for o ecrã que o mudou. Quando o servidor confirma que recebeu, sai da fila. Se mudou outra vez entretanto, fica, para seguir no envio seguinte. **Está desligada:** sem servidor não escreve nada e não ocupa espaço. Nunca liga na demonstração.
4. **As regras para juntar** os dados de dois telemóveis (`src/domain/sync-merge.ts`). Estão descritas em baixo.
5. **Receber as alterações dos outros telemóveis** (`src/data/sync/batch.ts`):
   - junta cada registo com a cópia do telemóvel;
   - volta a calcular o stock e as dívidas dos clientes a partir dos factos;
   - escreve no registo de alterações as versões que foram substituídas.
     O que chega do servidor não volta a entrar na fila.
6. **Um teste com dois «telemóveis»:**
   - cada um vende e muda produtos sem rede;
   - depois trocam as alterações e têm de acabar com a mesma loja: as mesmas vendas, os mesmos preços, o mesmo stock e as mesmas dívidas;
   - no fim, uma anulação feita num tem de chegar ao outro.

## Regras para juntar (em português simples)

- **Factos** (vendas, pagamentos de clientes, movimentos de stock, devoluções, compras, pagamentos a fornecedores, saídas, fechos do dia, pagamentos ao INSS, lotes e registo de alterações):
  - nunca se perdem nem se apagam;
  - os únicos passos que dão depois de criados, anular e confirmar, só andam para a frente: uma venda anulada num telemóvel fica anulada em todos;
  - se dois telemóveis anularem a mesma venda, conta a primeira anulação, com o seu motivo.
- **Registos que se editam** (produtos, clientes, fornecedores, definições e funcionários):
  - fica a versão mais recente;
  - a outra fica escrita no registo de alterações, por exemplo «Mudado noutro telemóvel da loja — Óleo: nome «Óleo de cozinha» → «Óleo vegetal»»;
  - arquivar também só anda para a frente: um produto arquivado num telemóvel não volta por ter sido editado noutro.
- **O stock de cada produto e a dívida de cada cliente** calculam-se em cada telemóvel a partir dos factos. Nunca se copiam.
  - Para isto, vender (ou fazer uma entrada de stock) já não conta como «alteração» do produto.
  - Pela mesma razão, lembrar um cliente por WhatsApp já não conta como alteração do cliente.
- **Nunca saem do telemóvel:**
  - os códigos: o código do dono, os códigos dos funcionários e a chave das cópias;
  - a cópia guardada antes de recuperar;
  - os contadores e avisos do telemóvel;
  - o carrinho, as vendas em espera e a contagem de stock em curso;
  - o registo de erros e as contas guardadas dos clientes (calculam-se de novo).

## Como vai funcionar, na Fase 2

1. A loja cria a conta. O telemóvel liga a fila (`startTracking`) e envia tudo o que tem (`snapshotBatch`). Isto só acontece da primeira vez.
2. Depois, sempre que houver rede:
   - o telemóvel envia o que está na fila (`pendingChanges` e `buildBatch`);
   - o servidor guarda e responde;
   - o telemóvel tira da fila o que foi recebido (`acknowledge`).
3. O telemóvel recebe do servidor o que os outros telemóveis da loja mudaram, e aplica-o (`applyBatch`).
4. Sem rede, nada pára: vende-se como sempre e a fila espera.

## Limites conhecidos (a resolver na Fase 2)

- **O mesmo produto mudado em dois telemóveis antes de sincronizarem:** fica a versão mais recente inteira, não campo a campo. Fica escrito no registo de alterações. Se acontecer muito no piloto, passa-se a guardar a data de cada campo.
- **Números das vendas:**
  - cada telemóvel numera as suas, por isso dois telemóveis podem ter uma «venda n.º 12»;
  - a verificação dos dados já aceita isto; no piloto, o número pode levar a letra do telemóvel (por exemplo «A-12»);
  - o mesmo vale para as compras e as devoluções.
- **Códigos de barras da loja:** com vários telemóveis, o servidor tem de os dar, ou cada telemóvel recebe o seu intervalo.
- **Recuperar uma cópia de segurança** num telemóvel que sincroniza envia tudo de novo, mas não apaga do servidor o que a cópia não tinha. A regra para este caso decide-se com o servidor.
- **O relógio:** as datas vêm do telemóvel, e um relógio errado pode fazer uma versão antiga parecer a mais recente. A app já avisa quando o relógio anda para trás; o servidor pode corrigir com a sua hora.
- **Segurança e privacidade:**
  - com servidor, cada loja só pode ver os seus dados, e a ligação é cifrada;
  - os nomes e telefones dos clientes passam a ir para o servidor, por isso os Termos e a Política de privacidade têm de o dizer (rever com o advogado, Lei n.º 22/11).

## O que falta decidir (fundador)

**13/11/2026:** o fundador decidiu pagar o servidor quando a Fase 6 acabar. No fim da Fase 6 fica pronta uma lista do que comprar, com os preços confirmados nesse dia.

- **O servidor.** A proposta é o Supabase. Tem um plano gratuito com limites, e os planos pagos têm custo mensal: confirmar os preços e os limites actuais antes de escolher.
- **Onde ficam os dados** (país do servidor) e o que a Lei n.º 22/11 exige.
- **Como a loja entra na conta:** número de telemóvel com código por SMS (as SMS têm custo) ou e-mail.
- **O endereço próprio da app** (ponto C7 da auditoria). Deve ficar escolhido antes das lojas reais e antes do servidor.
