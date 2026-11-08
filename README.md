# Caixa — a caixa da loja no telemóvel

App para pequenos negócios em Angola: registar vendas, receber por vários meios (incluindo PayPay), controlar o stock e o que os clientes devem. Funciona **sem internet** e os dados ficam **só no telemóvel**.

> Esta app **não emite facturas**. Os talões dizem sempre «Documento não fiscal — não serve de factura».

## Abrir no telemóvel

1. No Chrome do Android, abra: **https://evanderevaristo137-commits.github.io/Caixa/** (com «C» maiúsculo)
2. Toque em **Instalar app** (no ecrã «Mais», ou nos três pontos ⋮ do Chrome → «Instalar app» / «Adicionar ao ecrã inicial»).
3. A partir daí abre pelo ícone «Caixa», mesmo sem internet.

## Mostrar a um comerciante (modo demonstração)

- Separador **Mais** → **Entrar no modo demonstração**. Aparece a «Mercearia da Dona Teresa» com 30 produtos, 5 clientes com compras a crédito e duas semanas de vendas. Todos os clientes da demonstração usam o número de testes 955 502 264, para os lembretes e talões enviados por WhatsApp chegarem a esse telefone.
- Uma faixa amarela no topo lembra que são dados de exemplo.
- Em cada novo dia os dados de exemplo renovam-se sozinhos, para o ecrã «Hoje» ter sempre vendas do dia.
- **Repor dados da demonstração** volta tudo ao início a qualquer momento.
- **Sair da demonstração** volta aos dados reais da loja, que nunca são tocados.

## Como usar

- **Vender:** o **carrinho** está sempre no canto de cima, com o número de artigos (e na barra escura em baixo, com o total). Toque nos produtos (os mais vendidos aparecem primeiro; também pode pesquisar ou ler o código de barras com o botão da câmara) → **Cobrar** → escolha como pagou → **Confirmar venda**. Em numerário, toque na nota que recebeu e a app mostra o troco. No fim pode enviar o talão por WhatsApp.
  - Para vender muitas unidades, abra o carrinho e toque no número para o escrever.
  - **Produtos ao quilo** (arroz, feijão, açúcar a granel…): ao tocar no produto, escolha o peso (250 g, 500 g, 1 kg, 2 kg ou escreva, por exemplo 0,75) ou o **valor** que o cliente pede («500 Kz de feijão»): a app diz quanto pesar. No carrinho, «Mudar peso» corrige.
  - Se ler um código que a app não conhece, pode criar o produto na hora: o código já fica preenchido.
- **Clientes:** quem deve, quanto e até quando deve pagar (em atraso, vence hoje, vence em breve). Em cada venda a crédito escolhe-se o prazo: 7, 15 ou 30 dias, fim do mês ou outra data. O botão verde «Lembrar» abre o WhatsApp com a mensagem certa para cada caso. **Limite de crédito:** em «Mais» escolhe-se quanto cada cliente pode dever (e cada cliente pode ter um limite próprio na sua ficha); se uma venda passar o limite, a app avisa e só continua com «Confirmar acima do limite» (com o código do dono, se existir). Toque no cliente para registar um pagamento (parcial ou total) ou para **Lembrar por WhatsApp** (a app mostra quando foi o último lembrete). O talão de uma venda a crédito mostra o total em dívida do cliente. **Enviar extracto por WhatsApp** manda ao cliente as compras e os pagamentos que explicam a dívida, com o saldo depois de cada um e a data do próximo pagamento.
- **Hoje:** total vendido, número de vendas, comparação com ontem até à mesma hora, **lucro estimado** (com a margem e os produtos que mais deram lucro), **dinheiro que devia estar na caixa** (com o fundo de caixa e as saídas), divisão por meio de pagamento, stock baixo (com **Enviar lista de compras** por WhatsApp), total a receber de clientes, total **a pagar a fornecedores** e a lista das vendas do dia. Use as setas ‹ › para ver dias anteriores e **Enviar resumo do dia** para mandar os números ao dono por WhatsApp.
  - **Registar saída:** despesas (transporte, renda, luz e gerador, salários…) ou a **retirada do dono**, a dizer se o dinheiro saiu da caixa. Com despesas, o «Hoje» mostra o **resultado do dia** (lucro − despesas). Um engano anula-se com motivo.
  - **Fechar o dia:** conte o dinheiro da caixa e escreva o valor; a app diz se **bate certo**, se **sobra** ou se **falta**, e guarda o fecho no registo de alterações.
  - Toque numa venda para reenviar o talão ou para a **anular** (engano, desistência, devolução). A venda anulada fica no histórico, mas deixa de contar e o stock volta ao lugar.
- **Produtos:** criar e editar produtos (à unidade ou **ao quilo**, com preço por kg e stock em kg), dar entrada de stock e fazer acertos (sempre com motivo).
  - **Preço de custo (opcional):** o que paga ao fornecedor. A app mostra quanto ganha em cada unidade e, no «Hoje», o lucro estimado das vendas. Os artigos sem preço de custo ficam fora dessa conta (a app avisa quantos são).
  - **Código de barras:** se o produto tem código de fábrica, leia-o com a câmara. Se não tem, toque em **Gerar código**: a app cria um código da loja (começa por 20 e só funciona nesta loja).
  - **Compras:** no separador «Compras», registe a mercadoria que chegou (produtos, quantidades e custo). O stock sobe, o preço de custo passa a ser o da última compra e pode pagar com dinheiro da caixa, de outra forma ou **a crédito**, com data para pagar. «Juntar os produtos com stock baixo» preenche a compra num toque.
  - **Fornecedores:** quanto a loja deve a cada um e até quando, registar pagamentos e **Encomendar por WhatsApp** (a mensagem leva os produtos com stock baixo que costuma comprar a esse fornecedor).
  - **Etiquetas com código de barras:** escolha os produtos e o número de cópias e imprima (ou guarde em PDF para imprimir noutro lado). Um botão gera de uma vez os códigos que faltam.
- **Mais:** nome da loja, telefone, NIF (aceita letras e números), prazo habitual para os clientes pagarem, **fundo de caixa** (o troco com que a caixa começa o dia), **avisos de pagamentos** (o telemóvel avisa a loja quando um pagamento vence daqui a 2 dias, no próprio dia e quando atrasa), cópias de segurança (JSON) e exportação para Excel (CSV).

## Controlo e segurança

- **Referência do pagamento:** nos pagamentos electrónicos (KWiK, Multicaixa Express, Unitel Money, Afrimoney, PayPay) pode escrever o código que aparece no telemóvel do cliente. Fica na venda, no talão e no Excel, para confirmar depois com o banco.
- **Código do dono (opcional):** em **Mais → Código do dono**. Com código, a app pede-o para anular vendas, mudar preços, acertar stock, arquivar produtos e recuperar cópias de segurança. Esqueceu o código? Envie uma cópia de segurança, apague os dados da app nas definições do Android e recupere a cópia: o código nunca vai na cópia.
- **Verificar os dados:** em **Mais**, confirma que o stock bate com as entradas e saídas e que o total de cada venda bate com os artigos; se o stock de algum produto não bater, um toque corrige-o.
- **Registo de alterações:** em **Mais**, a lista do que foi feito e quando (anulações, mudanças de preço, acertos de stock, pagamentos, cópias), em português simples.

## Preparado para a facturação certificada e para pagamentos

A app **não emite facturas**. Em **Mais → Dados para facturação (opcional)** pode juntar a morada, o regime de IVA e o IVA habitual da loja; nos produtos, a unidade e o IVA; nos clientes, o NIF. A app mostra o que ainda falta e exporta as vendas e anulações no formato que o parceiro de facturação certificado pela AGT vai receber. Tudo isto está explicado, para os parceiros, em [`docs/INTEGRACOES.md`](docs/INTEGRACOES.md).

## Cópias de segurança

Os dados vivem só neste telemóvel. Se o telemóvel se perder ou a app for apagada, perdem-se. Em **Mais → Enviar cópia de segurança** escolha WhatsApp, e-mail ou Drive para guardar a cópia fora do telemóvel. A app lembra no ecrã «Hoje» quando a última cópia tiver mais de 7 dias. Para recuperar: **Mais → Recuperar uma cópia de segurança** e escolha o ficheiro.

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
