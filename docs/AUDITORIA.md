# Auditoria da Caixa

Fase 1 do plano de evolução. Feita a 12 de Novembro de 2026 sobre a versão publicada (`6d03ee6`). Nesta fase **não se alterou código**: só se analisou e mediu.

## Resumo

- **A base é boa e não é preciso reconstruir nada.** As regras estão separadas dos ecrãs, todas as escritas passam por um só sítio (`Store`), há 271 testes de cálculos e 40 testes da app inteira, e a publicação só acontece se todos passarem.
- **O maior risco é perder os dados.** Tudo vive só no telemóvel, a cópia de segurança é manual, vai em texto simples e cresce cerca de 9 MB por mês numa loja movimentada.
- **Há 7 correcções a fazer antes de lojas reais** (integridade e segurança). Nenhuma estraga o que existe.
- **Cerca de metade do que o plano pede já existe**, sobretudo em clientes, fornecedores, lucro e avisos. Faltam: histórico de vendas com filtros, devoluções, funcionários, validades, demonstração de resultados, conferência de pagamentos e sincronização.
- **Três decisões são do fundador:** servidor, endereço próprio da app e funcionários no mesmo telemóvel (ver «Decisões»).

## Corrigido já nesta fase

A própria auditoria apanhou um problema na verificação automática: **4 testes dependiam da hora do dia.** Entre a meia-noite e a primeira venda da demonstração, o dia ainda não tem vendas e esses testes falhavam, o que bloqueava qualquer publicação feita de madrugada. A app estava certa; os testes é que não. Agora os testes correm sempre com o relógio do telemóvel simulado nas 15:00 de Luanda, e há um teste próprio para «dez minutos depois da meia-noite». Só mudaram ficheiros de teste.

## O que foi analisado, e como

| Área                | Como                                                                                                              |
| ------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Estrutura           | Inventário de ficheiros, linhas, dependências e maiores ficheiros                                                 |
| Funcionalidades     | Comparação, ponto por ponto, do plano com o código                                                                |
| Base de dados       | Esquema (versão 6, 14 tabelas), migrações, escritas fora do `Store`                                               |
| Armazenamento local | Chaves guardadas fora da base de dados; espaço ocupado por venda (medido)                                         |
| Segurança           | Código do dono, criação de vendas, cópias de segurança, HTML, segredos, dependências (`npm audit`), origem da app |
| Desempenho          | Medições com 300 produtos e 14.480 vendas, processador 6 vezes mais lento                                         |
| Acessibilidade      | Nomes dos botões, etiquetas dos campos, tamanho dos alvos de toque e contraste do texto em 7 ecrãs                |
| Testes              | Testes existentes e o que cobrem; verificação automática antes de publicar                                        |

Não foi possível correr o Lighthouse (o ambiente não deixa descarregar ferramentas de fora); a acessibilidade foi verificada com um guião próprio.

## O que está sólido (manter)

- **Arquitectura:** `src/domain` (regras puras, com testes), `src/data` (base de dados e `Store`), `src/screens`, `src/i18n` (todos os textos). Só 4 dependências na app: React, React DOM, Dexie e dexie-react-hooks.
- **Integridade:** dinheiro em inteiros (cêntimos); todas as escritas de negócio passam pelo `Store`, dentro de uma transacção e com registo; os movimentos de stock nunca se editam; «Verificar os dados» recalcula tudo a partir dos factos.
- **Offline:** funciona sem internet; a demonstração vive numa base de dados separada; as actualizações nunca recarregam a app a meio de uma venda.
- **Testes:** 271 testes de cálculos e dados, 40 testes num Android simulado; passam todos nesta versão. A publicação pára se algum falhar.
- **Acessibilidade:** nenhum botão sem nome, nenhum campo sem etiqueta, nenhum alvo de toque abaixo de 44 px, e **zero falhas de contraste em 904 textos** de 7 ecrãs.
- **Desempenho:** com 14.480 vendas e o processador 6 vezes mais lento, a app abre em cerca de 0,4 s e confirma uma venda em cerca de 0,16 s.
- **Sem segredos no código, sem HTML perigoso, zero vulnerabilidades nas dependências da app.**
- **Nada pago:** a app não tem planos, subscrições nem bloqueios. Não há nada a retirar para os 3 meses gratuitos.

## Problemas encontrados

### Críticos: resolver antes de lojas reais (Fase 2)

| N.º | Problema                                                                                                                                                                                                                                                      | Porque importa                                                                                                   | Correcção                                                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | **A cópia de segurança não aguenta o crescimento.** Cada venda ocupa cerca de 4 KB e 61% é o registo de alterações, que guarda a venda inteira outra vez. Uma loja com 80 vendas por dia cria cerca de 9 MB por mês: cerca de 50 MB em 6 meses, num só texto. | Enviar 50 MB por WhatsApp é caro, e num telemóvel com 2 GB de memória a cópia pode falhar quando mais faz falta. | Comprimir a cópia (fica 4 vezes menor, medido), aligeirar o registo de alterações sem perder informação, e propor a cópia ao fechar o dia.                                   |
| C2  | **Recuperar uma cópia substitui tudo sem comparar.** Uma cópia antiga apaga, sem aviso próprio, dados mais recentes.                                                                                                                                          | Um toque errado perde semanas de vendas.                                                                         | Mostrar «a cópia tem N vendas até dia X; o telemóvel tem M até hoje», e guardar sozinha uma cópia do que lá estava antes de substituir.                                      |
| C3  | **As cópias vão em texto simples**, com nomes e telefones de clientes (e o número de segurança social do dono, se existir).                                                                                                                                   | A cópia é enviada por WhatsApp ou e-mail: quem a receber lê tudo.                                                | Palavra-passe opcional na cópia (cifra AES, já existe no navegador, sem bibliotecas).                                                                                        |
| C4  | **O `Store` aceita o preço que vem do ecrã.** Ao gravar a venda, o preço e o nome vêm do carrinho e não do produto.                                                                                                                                           | Um carrinho antigo pode vender a um preço errado; com vendedores, o preço não pode depender do ecrã.             | O preço passa a vir sempre do produto. Se mudou entretanto, a venda é recusada e o ecrã mostra o total novo antes de cobrar.                                                 |
| C5  | **A mesma venda pode ser gravada duas vezes** se o Android fechar a app logo depois de gravar: o carrinho continua guardado.                                                                                                                                  | Venda e stock em duplicado.                                                                                      | Cada carrinho leva um identificador de tentativa; o `Store` recusa repetir.                                                                                                  |
| C6  | **O código do dono só é pedido nos ecrãs**, não no `Store`; guarda-se com um resumo fraco e aceita tentativas sem limite.                                                                                                                                     | Não serve de base para permissões de funcionários.                                                               | Verificar no `Store`, resumo forte (PBKDF2) e espera crescente depois de tentativas erradas. Continua a ser dissuasão: sem servidor, quem tem o telemóvel pode apagar a app. |
| C7  | **Endereço da app.** No GitHub, a Caixa partilha o «cofre» do navegador com qualquer outra página publicada pela mesma conta. E se o endereço mudar mais tarde, as lojas já instaladas deixam de ver os seus dados.                                           | Isolamento dos dados, e uma migração dolorosa mais tarde.                                                        | Endereço próprio para a Caixa **antes** das primeiras lojas reais (decisão do fundador: tem um custo anual).                                                                 |

### Importantes (Fases 2 e 3)

| N.º | Problema                                                                                                                                  | Correcção                                                                                   |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| I1  | Não há regra técnica que impeça a app de enviar dados para fora (falta uma política de segurança de conteúdo).                            | Acrescentá-la: a promessa «os dados ficam no telemóvel» passa a ser imposta pelo navegador. |
| I2  | Se o relógio do telemóvel estiver errado ou for mudado, as vendas ficam no dia errado, sem aviso.                                         | Avisar quando o relógio anda para trás em relação ao último registo.                        |
| I3  | «Vendido» e «recebido» aparecem em sítios diferentes; uma venda a crédito conta no total do dia.                                          | Mostrar sempre os dois lado a lado (Fase 3, finanças).                                      |
| I4  | Listas grandes desenham tudo de uma vez (produtos); o ecrã «Mais» lê todas as vendas ao abrir; o histórico de um produto mostra só 50.    | Mostrar por partes («ver mais») e ler só o necessário.                                      |
| I5  | Se a app falhar numa loja, ninguém fica a saber.                                                                                          | Registo local dos erros, e a sua contagem no resumo do piloto (só números).                 |
| I6  | Ferramentas: 6 avisos em ferramentas de construção (não vão para a app), sem verificador de código (ESLint), `store.ts` com 1.178 linhas. | Actualizar, juntar o verificador e dividir o ficheiro por áreas, sem mudar o comportamento. |
| I7  | Textos legais e regras do INSS ainda são minutas.                                                                                         | Rever com advogado e com o INSS (perguntas em `docs/INSS.md`).                              |

## O que o plano pede e o que já existe

| Área                 | Já existe                                                                                                                | Parcial                                                                                              | Falta                                                                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Vendas e caixa       | Anulação com motivo, vendas em espera, reabrir uma venda e reenviar o talão, fecho do dia                                | Histórico (só dia a dia), relatórios (7 dias, 30 dias, 12 meses), talão (só WhatsApp, sem impressão) | Filtros, devoluções totais e parciais, funcionário em cada venda, conferência de pagamentos (declarado e confirmado), transferência e TPA |
| Stock                | Movimentos por produto, stock mínimo com aviso, contagem, custo da última compra, importação do Excel                    | Sugestão de reposição (não usa a velocidade de venda)                                                | Validades e lotes, produtos parados, velocidade de venda, entradas/saídas/perdas, comprado contra vendido, custo médio                    |
| Clientes             | Compras, pagamentos parciais, limites, dívidas vencidas, extracto, lembretes                                             | Painel de contas correntes, relatório de devedores                                                   | Pontualidade de cada cliente                                                                                                              |
| Fornecedores         | Compras e pagamentos por fornecedor, o que se deve e até quando, encomenda por WhatsApp                                  | Relatório de compras                                                                                 | Histórico de preços, comparação entre fornecedores, prazo médio de pagamento                                                              |
| Finanças             | Margem, lucro por produto e por categoria, retiradas do dono, a receber e a pagar, comparação com o período anterior     | Fluxo de caixa (só o dia), análise de despesas, exportação (CSV; PDF só na Ficha da loja)            | Demonstração de resultados simplificada, períodos à escolha, Excel verdadeiro e PDF dos relatórios                                        |
| Funcionários         | —                                                                                                                        | Código do dono                                                                                       | Tudo: perfis, permissões, vendas e caixa por operador                                                                                     |
| Sincronização        | Cópia manual e restauro; identificadores únicos e datas em todos os registos                                             | —                                                                                                    | Cópia automática, vários telemóveis, conflitos, sessões (precisa de servidor)                                                             |
| Segurança            | Validação no `Store`, registo de alterações                                                                              | Código do dono                                                                                       | Cifra das cópias, permissões na lógica, contas e recuperação (precisa de servidor)                                                        |
| Inteligência         | Mais vendidos, mais lucro, stock baixo, clientes em atraso, alarme dos pagamentos digitais                               | Comparação entre períodos                                                                            | Produtos parados, tendências, subida de despesas, previsão de ruptura, recomendações em frases                                            |
| Design               | Botões grandes, contraste, uma só mão                                                                                    | Painel inicial (longo), «Mais» (uma lista comprida)                                                  | Painel com os 8 indicadores, secções em «Mais», confirmações próprias, ecrãs grandes                                                      |
| Angola               | Kz, DD/MM/AAAA, português com a ortografia usada em Angola, avisos «não fiscal», preparação para a AGT e para pagamentos | —                                                                                                    | Transferência bancária e TPA como meios de pagamento                                                                                      |
| Gratuito nos 3 meses | Não há nada pago                                                                                                         | —                                                                                                    | Forma de a loja dar a sua opinião dentro da app                                                                                           |

## Plano por fases

Cada passo é pequeno, com testes, e termina com um resumo e como testar no telemóvel. No fim de cada fase há um relatório (analisado, feito, ficheiros, testes, pendente, riscos).

**Fase 2: correcções críticas** (não muda o aspecto da app)

1. Preço e nome vêm sempre do produto; identificador de tentativa nas vendas (C4, C5).
2. Cópias de segurança: comprimidas, com palavra-passe opcional, comparação antes de recuperar e cópia automática do que lá estava; cópia proposta ao fechar o dia (C1, C2, C3).
3. Registo de alterações mais leve, com migração que não perde nada (C1).
4. Código do dono verificado no `Store`, resumo forte e limite de tentativas (C6).
5. Política de segurança de conteúdo, aviso de relógio errado, registo local de erros (I1, I2, I5).
6. Ferramentas: verificador de código, dependências, divisão do `store.ts` (I6).

**Fase 3: melhorias funcionais** (pela ordem do valor para a loja)

1. **Vendas:** histórico com filtros; devoluções totais e parciais; transferência e TPA; pagamentos «por confirmar» e conferência; talão para imprimir.
2. **Finanças:** «vendido» ao lado de «recebido»; fluxo de caixa; demonstração de resultados simplificada (vendas, custo da mercadoria, lucro bruto, despesas, resultado operacional estimado); períodos à escolha.
3. **Stock:** validades e lotes (opcional, por produto); produtos parados e velocidade de venda; reposição pela velocidade; entradas, saídas e perdas; custo médio como opção.
4. **Clientes:** painel de contas correntes, pontualidade, relatório de devedores.
5. **Fornecedores:** histórico e comparação de preços, prazos médios, relatório de compras.

**Fase 4: modernização visual.** Painel inicial com os 8 indicadores; «Mais» por secções; confirmações próprias em vez das do navegador; estados de carregamento e mensagens uniformes; ecrãs grandes.

**Fase 5: funcionalidades avançadas.** Funcionários e permissões (verificadas no `Store`), caixa por operador; avisos e recomendações com regras de dados mínimos; relatórios em PDF, Excel e CSV com o cabeçalho da loja; preparação da sincronização (fila de operações, conflitos) e, quando o servidor for decidido, a própria sincronização.

**Fase 6: testes e preparação.** Bateria final (offline, interrupções, duplicações, restauro, migrações com dados antigos, telemóvel real), endereço definitivo, textos legais revistos, opinião das lojas dentro da app.

Para não refazer trabalho, o campo «quem vendeu» entra nos dados logo na Fase 3; a gestão de funcionários vem na Fase 5.

## Decisões do fundador

1. **Servidor** (contas, sincronização, cópia automática na nuvem). Precisa de um serviço alojado, que tem custo e obrigações de protecção de dados (Lei n.º 22/11). Proposta: fazer já as Fases 2 a 4, que não dependem dele, e preparar a app para sincronizar; escolher o servidor antes da Fase 5.
2. **Endereço próprio da app**, antes das primeiras lojas reais (C7). Tem um custo anual.
3. **Funcionários com código próprio no mesmo telemóvel**, sem esperar pelo servidor. Antes tinha ficado para a fase das contas. Proposta: sim; funciona offline e a sincronização junta-se depois.

Decididas por defeito, salvo indicação em contrário: o custo continua a ser o da última compra, com o custo médio como opção; juntam-se «Transferência bancária» e «TPA» aos meios de pagamento; tudo o que é avançado (lotes, funcionários) vem desligado, para a app continuar simples.

## Riscos

- **Tamanho do plano.** São muitas funcionalidades. O risco é a app deixar de ser simples: por isso o avançado vem desligado e cada passo é testado com a pergunta «a Dona Teresa percebe isto?».
- **Perda de dados até haver servidor.** As correcções da Fase 2 reduzem o risco, não o eliminam.
- **Regras legais.** Facturação, protecção de dados e INSS precisam de validação por profissionais.
- **Segurança sem servidor.** Códigos e permissões no telemóvel dissuadem, mas não são autenticação a sério.

## Medições

| Medida                                                   | Valor                                                                            |
| -------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Código                                                   | 168 ficheiros em `src`: cerca de 15.300 linhas de app e 5.100 de testes          |
| Testes                                                   | 271 de cálculos e dados, 40 da app inteira; todos passam                         |
| Ficheiro principal da app                                | 655 KB (195 KB comprimido)                                                       |
| Espaço por venda de 3 linhas                             | cerca de 4,0 KB: venda 0,8, movimentos 0,7, registo de alterações 2,5            |
| Cópia com 14.480 vendas, sem o registo de alterações     | 17,6 MB; comprimida 4,0 MB; 1,2 s e 78 MB de memória no telemóvel lento simulado |
| Abrir a app, loja grande, processador 6 vezes mais lento | cerca de 0,4 s                                                                   |
| Contraste do texto                                       | 0 falhas em 904 textos de 7 ecrãs                                                |
| Vulnerabilidades                                         | 0 na app; 6 (2 baixas, 4 moderadas) em ferramentas de construção                 |
