# Caixa — a caixa da loja no telemóvel

App para pequenos negócios em Angola: registar vendas, receber por vários meios (incluindo PayPay), controlar o stock e o que os clientes devem. Funciona **sem internet** e os dados ficam **só no telemóvel**.

> Esta app **não emite facturas**. Os talões dizem sempre «Documento não fiscal — não serve de factura».

## Abrir no telemóvel

1. No Chrome do Android, abra: **https://evanderevaristo137-commits.github.io/Caixa/** (com «C» maiúsculo)
2. Toque em **Instalar app** (no ecrã «Mais», ou nos três pontos ⋮ do Chrome → «Instalar app» / «Adicionar ao ecrã inicial»).
3. A partir daí abre pelo ícone «Caixa», mesmo sem internet.
4. Na primeira vez, a app mostra os **Termos de uso** e a **Política de privacidade**: toque em «Aceitar e começar» para usar com os dados da sua loja, ou em «Ver só a demonstração».

Também funciona num **tablet** ou num **computador** (no Chrome): em «Vender» aparecem mais produtos por linha, o «Hoje» divide-se em duas colunas (o que tratar e a caixa à esquerda, as vendas do dia à direita) e as janelas abrem no meio do ecrã.

## Mostrar a um comerciante (modo demonstração)

- Separador **Mais** → **Entrar no modo demonstração**. Aparece a «Mercearia da Dona Teresa» com 30 produtos, 5 clientes com compras a crédito e duas semanas de vendas. Todos os clientes da demonstração usam o número de testes 955 502 264, para os lembretes e talões enviados por WhatsApp chegarem a esse telefone.
- Uma faixa amarela no topo lembra que são dados de exemplo.
- Em cada novo dia os dados de exemplo renovam-se sozinhos, para o ecrã «Hoje» ter sempre vendas do dia.
- **Repor dados da demonstração** volta tudo ao início a qualquer momento.
- **Sair da demonstração** volta aos dados reais da loja, que nunca são tocados.

## Como usar

- **Vender:** o **carrinho** está sempre no canto de cima, com o número de artigos (e na barra escura em baixo, com o total). Toque nos produtos (os mais vendidos aparecem primeiro; também pode pesquisar ou ler o código de barras com o botão da câmara) → **Cobrar** → escolha como pagou → **Confirmar venda**. Em numerário, toque na nota que recebeu e a app mostra o troco. No fim pode enviar o talão por WhatsApp ou **imprimi-lo** (numa impressora de talões ligada ao telemóvel pela app dela, ou «Guardar como PDF»); o talão de uma venda antiga imprime-se no detalhe da venda.
  - Para vender muitas unidades, abra o carrinho e toque no número para o escrever.
  - **Vendas em espera:** com muita gente na loja, abra o carrinho e toque em **Pôr em espera** para atender outro cliente. As vendas em espera aparecem por cima dos produtos; um toque retoma uma (a venda que estava aberta fica em espera no lugar dela). Até 5 de cada vez, guardadas no telemóvel.
  - **Produtos ao quilo** (arroz, feijão, açúcar a granel…): ao tocar no produto, escolha o peso (250 g, 500 g, 1 kg, 2 kg ou escreva, por exemplo 0,75) ou o **valor** que o cliente pede («500 Kz de feijão»): a app diz quanto pesar. No carrinho, «Mudar peso» corrige.
  - Se ler um código que a app não conhece, pode criar o produto na hora: o código já fica preenchido.
- **Clientes:** quem deve, quanto e até quando deve pagar (em atraso, vence hoje, vence em breve). Em cada venda a crédito escolhe-se o prazo: 7, 15 ou 30 dias, fim do mês ou outra data. O botão verde «Lembrar» abre o WhatsApp com a mensagem certa para cada caso. **Limite de crédito:** em «Mais» → «Dinheiro e clientes» escolhe-se quanto cada cliente pode dever (e cada cliente pode ter um limite próprio na sua ficha); se uma venda passar o limite, a app avisa e só continua com «Confirmar acima do limite» (com o código do dono, se existir). Toque no cliente para registar um pagamento (parcial ou total) ou para **Lembrar por WhatsApp** (a app mostra quando foi o último lembrete). O talão de uma venda a crédito mostra o total em dívida do cliente. **Relatório de devedores** (no topo da lista) mostra quanto está em dívida pelo atraso (a vencer, 1 a 7 dias, 8 a 30 dias, mais de 30 dias) e cada cliente, os mais atrasados primeiro. Com algumas compras a crédito, a app diz se o cliente **paga a tempo**, **às vezes atrasa** ou **costuma atrasar** (na ficha e na lista). **Enviar extracto por WhatsApp** manda ao cliente as compras e os pagamentos que explicam a dívida, com o saldo depois de cada um e a data do próximo pagamento.
- **Hoje:** no topo, os **números do dia**, cada um no seu quadrado: **Vendas de hoje** (com o número de vendas e a comparação com ontem até à mesma hora; as vendas anuladas e as devoluções aparecem logo ali), **Dinheiro recebido** (sem as vendas a crédito nem os pagamentos por confirmar, com as dívidas que os clientes pagaram), **Despesas de hoje**, **Lucro bruto estimado**, **Saldo de caixa** (o dinheiro que devia estar na caixa), **Contas a receber** (o que os clientes devem), **Contas a pagar** (o que a loja deve aos fornecedores) e **Produtos com stock baixo**. Cada quadrado abre o seu detalhe: as vendas e o recebido abrem o dia (a divisão por meio de pagamento e a comparação com ontem); o lucro abre a margem, os produtos que mais deram lucro e o resultado do dia; o stock baixo abre a Análise do stock (com **Enviar lista de compras** por WhatsApp); as contas a receber abrem Clientes e as contas a pagar os Fornecedores. Por baixo, **Para tratar hoje** junta numa lista o que pede atenção (clientes a lembrar, pagamentos por confirmar, fornecedores a pagar, validades, o alarme dos pagamentos digitais, o INSS e a cópia de segurança); só aparece quando há alguma coisa para fazer. Depois vêm **Relatórios** (semana e mês, contas da loja e procurar vendas), a caixa (registar saídas e fechar o dia) e a lista das vendas do dia. Use as setas ‹ › para ver dias anteriores e **Enviar resumo do dia** para mandar os números ao dono por WhatsApp.
  - **Pagamentos digitais (crédito para stock):** quando a loja tem um contrato de crédito para stock (fase 4), o «Hoje» mostra que parte do dinheiro recebido nos últimos 7 dias entrou por pagamentos digitais, contra o mínimo do contrato. Aparece um **alarme** se ficar abaixo do mínimo, ou se os recebimentos digitais caírem de repente sem as vendas caírem (sinal de que se está a cobrar em numerário para fugir à retenção). O mínimo define-se em «Mais» → «Dinheiro e clientes» (com o código do dono).
  - **Semana, mês e ficha da loja** (em **Relatórios**): os últimos 7 dias, 30 dias ou 12 meses, comparados com o período anterior: vendido, número de vendas e venda média, lucro, despesas, gráfico das vendas por dia (ou por mês, com tabela), formas de pagamento e os produtos que mais venderam e mais lucro deram. A **Ficha da loja** junta até 12 meses numa página, para mostrar a um banco ou parceiro, só se a loja quiser: imprime-se (ou guarda-se em PDF) ou envia-se por WhatsApp. Na demonstração aparece sempre «dados fictícios».
  - **Registar saída:** despesas (transporte, renda, luz e gerador, salários…) ou a **retirada do dono**, a dizer se o dinheiro saiu da caixa. Com despesas, o quadrado do lucro mostra o **resultado do dia** (lucro − despesas). Um engano anula-se com motivo.
  - **Fechar o dia:** conte o dinheiro da caixa e escreva o valor; a app diz se **bate certo**, se **sobra** ou se **falta**, e guarda o fecho no registo de alterações.
  - Toque numa venda para reenviar o talão ou para a **anular** (engano, desistência, devolução). A venda anulada fica no histórico, mas deixa de contar e o stock volta ao lugar.
- **Produtos:** criar e editar produtos (à unidade ou **ao quilo**, com preço por kg e stock em kg), dar entrada de stock e fazer acertos (sempre com motivo).
  - **Preço de custo (opcional):** o que paga ao fornecedor. A app mostra quanto ganha em cada unidade e, no «Hoje», o lucro estimado das vendas. Os artigos sem preço de custo ficam fora dessa conta (a app avisa quantos são).
  - **Código de barras:** se o produto tem código de fábrica, leia-o com a câmara. Se não tem, toque em **Gerar código**: a app cria um código da loja (começa por 20 e só funciona nesta loja).
  - **Compras:** no separador «Compras», registe a mercadoria que chegou (produtos, quantidades e custo). O stock sobe, o preço de custo passa a ser o da última compra (ou, se escolher em «Mais» → «A loja», o **custo médio** do que estava na prateleira e do que chegou) e pode pagar com dinheiro da caixa, de outra forma ou **a crédito**, com data para pagar. «Juntar os produtos com stock baixo» preenche a compra num toque.
  - **Fornecedores:** quanto a loja deve a cada um e até quando, registar pagamentos e **Encomendar por WhatsApp** (a mensagem leva os produtos com stock baixo que costuma comprar a esse fornecedor). A ficha do fornecedor mostra o **prazo médio** que ele dá para pagar, se a loja lhe paga a tempo e o último preço de cada produto (com a subida ou descida desde a compra anterior). Na ficha de cada produto, **Preços de compra** mostra o que pagou em cada compra e o fornecedor mais barato da última vez. No separador «Compras», **Relatório de compras** soma 30 dias, 90 dias ou 12 meses por fornecedor e por produto.
  - **Imprimir etiquetas:** escolha os produtos e o número de cópias e imprima (ou guarde em PDF para imprimir noutro lado). Um botão gera de uma vez os códigos que faltam.
  - **Análise do stock:** **Comprar** mostra o que está abaixo do mínimo ou acaba numa semana, pela velocidade de venda dos últimos 30 dias, com quantidades para duas semanas (e «Enviar lista de compras»); **Parados** mostra os produtos com stock que não venderam nos últimos 30 dias e quanto dinheiro está parado na prateleira (ao preço de custo); **Perdas** mostra o stock que saiu sem ser vendido (partido, fora de prazo, roubo, contagens, devoluções estragadas) em 30 dias, 90 dias ou 12 meses. Na ficha de cada produto aparece quanto vendeu nos últimos 30 dias e para quantos dias dá o stock.
  - **Validades (opcional, para medicamentos e alimentos):** na ficha do produto, marque **Controlar validades**. Ao dar entrada de stock (ou numa compra) a app pede a data de validade; para o stock que já estava na prateleira, use **Indicar a validade do stock sem data**. A ficha mostra as validades do que está em stock (a app assume que sai primeiro o mais antigo), o **Hoje** avisa (em «Para tratar hoje») os lotes vencidos ou a vencer nos próximos 30 dias e a **Análise do stock** tem o separador **Validades** (60 dias).
  - **Contar o stock:** conte o que está nas prateleiras (por categoria, pesquisando ou com o leitor de código de barras) e escreva ao lado de cada produto; se bate certo, toque em «=». Pode parar a meio: a contagem fica guardada. No fim, «Ver diferenças» mostra o que falta e o que sobra, também em kwanzas (ao preço de custo), e «Acertar o stock» corrige tudo de uma vez (pede o código do dono, se existir). As vendas feitas durante a contagem não estragam as contas.
  - **Categorias (opcional):** no produto, escreva a categoria ou toque numa das que a loja já usa (Bebidas, Mercearia…). Em **Vender** e em **Produtos**, os botões por cima da lista mostram só uma categoria (a pesquisa procura sempre em todas). Em **Semana e mês** aparecem as vendas e o lucro de cada categoria.
  - **Importar do Excel:** junte a lista inteira de uma vez, a partir de uma folha do Excel (.xlsx) ou de um ficheiro CSV. Basta a primeira linha com os nomes das colunas (pelo menos «Produto» e «Preço (Kz)»). Antes de gravar, a app mostra os produtos novos, os que mudam (por exemplo «preço 500 Kz → 600 Kz») e as linhas com erro, com o número da linha. Os produtos que já existem nunca mudam de stock na importação. Para mudar muitos preços: «Descarregar a lista actual», mudar no Excel e importar outra vez.
- **A minha reforma (INSS):** para o dono da loja, que trabalha por conta própria, também ter reforma. É opcional e está no «Hoje» e em «Mais» → «Dinheiro e clientes».
  - **Simulador:** escolha quantos salários mínimos declara e o ano em que nasceu. Com 1 salário mínimo paga 8.000 Kz por mês (cerca de 270 Kz por dia) e, com 15 anos de contribuições, recebe cerca de 42.900 Kz por mês a partir dos 60 anos. É sempre uma estimativa.
  - **Guardar para o INSS:** ponha um pouco de parte todos os dias. Não conta como despesa (não baixa o lucro), mas sai da conta do dinheiro da caixa. A app mostra quanto já guardou e quanto falta para o mês.
  - **Registar pagamento:** depois de pagar no INSS (até ao dia 10 do mês seguinte), registe o mês, o valor e o número do comprovativo. A app conta os meses pagos, os meses seguidos e quanto falta para os 15 anos, e lembra-o antes do prazo.
  - **Como me inscrevo:** onde ir e o que levar.
  - A Caixa não é o INSS e não recebe dinheiro: o pagamento faz-se sempre ao INSS. As regras e as dúvidas a confirmar estão em [docs/INSS.md](docs/INSS.md).
- **Mais:** quatro secções que abrem com um toque (ficam abertas enquanto a app estiver aberta), e o modo demonstração sempre à vista.
  - **A loja:** nome da loja, telefone, NIF (aceita letras e números), dados para facturação (opcional) e o preço de custo depois de uma compra.
  - **Dinheiro e clientes:** prazo habitual para os clientes pagarem, limite de crédito, **avisos** (um aviso por dia, mesmo com a app fechada: pagamentos de clientes e a fornecedores 2 dias antes, no próprio dia e quando atrasam, e o alarme dos pagamentos digitais do crédito para stock), **fundo de caixa** (o troco com que a caixa começa o dia), o mínimo de pagamentos digitais e **A minha reforma (INSS)**.
  - **Segurança e cópias:** código do dono, **funcionários**, cópias de segurança (comprimidas e, se quiser, com palavra-passe), exportação para Excel (CSV), verificar os dados e o registo de alterações.
  - **Piloto e ajuda:** «Enviar resumo do piloto por WhatsApp» manda a quem acompanha o piloto os números da loja (dias com vendas, vendas, o que se usa na app), nunca nomes nem telefones de clientes; e os termos de uso e a privacidade.

## Controlo e segurança

- **Referência do pagamento:** nos pagamentos electrónicos (KWiK, Multicaixa Express, Unitel Money, Afrimoney, PayPay) pode escrever o código que aparece no telemóvel do cliente. Fica na venda, no talão e no Excel, para confirmar depois com o banco.
- **Funcionários (opcional):** em **Mais → Segurança e cópias → Funcionários** (primeiro defina o código do dono). Junte cada pessoa com o nome, o que pode fazer e um código só dela:
  - **Vendedor:** vende, recebe o que os clientes pagam, regista saídas e fecha o dia. Vender a crédito só se marcar «Pode vender a crédito».
  - **Gerente:** também produtos, preços, stock, compras e os números da loja.
  - O que a pessoa não pode fazer pede o **código do dono** na hora. As definições da loja são só do dono.
  - Em cima aparece quem está a usar a app; para mudar, toque em **Trocar** e escreva o código. A app guarda quem fez cada venda: veja **Vendas por pessoa** tocando em «Vendas de hoje», e «por …» no registo de alterações.
  - Quem deixa de trabalhar na loja: toque no nome e em **Já não trabalha aqui** (as vendas antigas continuam a dizer quem as fez).
  - Os códigos ficam só neste telemóvel: depois de recuperar uma cópia noutro telemóvel, dê-lhes um código novo.
- **Código do dono (opcional):** em **Mais → Segurança e cópias → Código do dono**. Com código, a app pede-o para anular vendas, mudar preços, acertar stock, arquivar produtos, vender a crédito acima do limite e recuperar cópias de segurança. Depois de 3 códigos errados, a app faz esperar (30 segundos, e mais a cada novo erro). Esqueceu o código? Envie uma cópia de segurança, apague os dados da app nas definições do Android e recupere a cópia: o código nunca vai na cópia.
- **Verificar os dados:** em **Mais → Segurança e cópias**, confirma que o stock bate com as entradas e saídas e que o total de cada venda bate com os artigos; se o stock de algum produto não bater, um toque corrige-o.
- **Devoluções:** em **Hoje**, toque na venda e em **Devolver artigos**. Escolha quanto volta de cada artigo, se volta para a prateleira e como devolve o dinheiro (da caixa ou de outra forma; numa venda a crédito, abate na dívida do cliente). A app calcula o valor e pede o motivo.
- **Listas longas:** para a app continuar rápida em telemóveis baratos, as listas grandes (produtos, clientes, compras, vendas do dia, históricos) aparecem por partes: no fim da lista, toque em **Ver mais**. A pesquisa procura sempre em tudo.
- **Contas da loja:** em **Hoje → Relatórios**, escolha o período (hoje, ontem, 7 dias, este mês, mês passado ou outras datas) e veja o que vendeu ao lado do que recebeu, o dinheiro que entrou e saiu (com o saldo) e o **resultado estimado**: vendas menos o custo da mercadoria e as despesas. É uma estimativa feita com os preços de custo que pôs nos produtos: não é contabilidade nem serve para impostos.
- **Procurar vendas:** em **Hoje → Relatórios**, por produto, cliente ou número da venda, por período (hoje, ontem, 7 ou 30 dias), por forma de pagamento, só as anuladas ou só as que estão por confirmar.
- **Pagamentos por confirmar:** se o cliente pagou por Multicaixa Express, transferência ou outro meio electrónico e o dinheiro ainda não apareceu no seu telemóvel, marque **O dinheiro ainda não entrou** antes de confirmar a venda. Em **Hoje**, «Para tratar hoje» mostra os **pagamentos por confirmar**: toque na linha e, quando o dinheiro entrar, toque em **Já entrou**. Se nunca entrar, abra a venda e toque em **Não entrou**: escolha como o cliente paga agora (numerário, outro meio ou a crédito) e a app regista a venda de novo, com os mesmos artigos e preços.
- **Data do telemóvel:** se a data ou a hora do telemóvel ficarem para trás (mudadas à mão, bateria sem carga), aparece um aviso vermelho no topo: acerte-as nas definições do Android para as vendas ficarem no dia certo.
- **Registo de alterações:** em **Mais → Segurança e cópias**, a lista do que foi feito e quando (anulações, mudanças de preço, acertos de stock, pagamentos, cópias), em português simples.

## Termos e condições

Em **Mais → Piloto e ajuda → Termos e condições** estão, para ler sem internet: Termos de uso, Política de privacidade, Condições do piloto e Condições do crédito para stock (retenção dos pagamentos digitais, mínimo digital e alarme). São **minutas** para rever com um advogado antes do piloto: os ficheiros estão em [`docs/legal`](docs/legal/README.md), com a lista do que falta preencher.

## Preparado para a facturação certificada e para pagamentos

A app **não emite facturas**. Em **Mais → A loja → Dados para facturação (opcional)** pode juntar a morada, o regime de IVA e o IVA habitual da loja; nos produtos, a unidade e o IVA; nos clientes, o NIF. A app mostra o que ainda falta e exporta as vendas e anulações no formato que o parceiro de facturação certificado pela AGT vai receber. Tudo isto está explicado, para os parceiros, em [`docs/INTEGRACOES.md`](docs/INTEGRACOES.md).

## Cópias de segurança

Os dados vivem só neste telemóvel. Se o telemóvel se perder ou a app for apagada, perdem-se. Em **Mais → Segurança e cópias → Enviar cópia de segurança** escolha WhatsApp, e-mail ou Drive para guardar a cópia fora do telemóvel. A app lembra no «Hoje» (em «Para tratar hoje») quando a última cópia tiver mais de 7 dias, e propõe a cópia quando se fecha o dia.

- **Mais pequena:** a cópia vai comprimida (cerca de 5 vezes mais pequena), por isso gasta menos dados a enviar.
- **Palavra-passe (opcional):** em **Mais → Segurança e cópias → Proteger as cópias com palavra-passe**. Quem receber o ficheiro não o consegue abrir sem ela. **Se a esquecer, as cópias não se abrem** (ninguém a consegue recuperar): escreva-a num papel e guarde-o em casa.
- **Recuperar:** **Mais → Segurança e cópias → Recuperar uma cópia de segurança** e escolha o ficheiro. Antes de substituir, a app mostra o que a cópia tem, o que o telemóvel tem e o que se perderia. Guarda também o que estava no telemóvel: se for engano, **Desfazer** (ou «Voltar a esses dados», em **Mais**) traz tudo de volta.
- As cópias antigas (anteriores a Novembro de 2026) continuam a recuperar-se. A cópia da demonstração nunca entra na loja, e a da loja nunca entra na demonstração.

## Pagamentos

Nesta fase os pagamentos electrónicos (QR KWiK, Multicaixa Express, Unitel Money, Afrimoney) são **apenas registados**: a pessoa confirma que recebeu o dinheiro no telemóvel dela. Nenhum dinheiro passa pela app.

---

## Para programadores

```bash
npm install
npm run dev        # abre em http://localhost:5173
npm test           # testes dos cálculos (totais, stock, clientes e prazos, demonstração, cópias)
npm run typecheck
npm run build
```

A cada push para `main`, o GitHub Actions corre os testes, constrói a app e publica-a no GitHub Pages. Mais detalhes e decisões em `CLAUDE.md`.
