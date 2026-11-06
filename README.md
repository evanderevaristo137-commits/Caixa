# Caixa — a caixa da loja no telemóvel

App para pequenos negócios em Angola: registar vendas, receber por vários meios, controlar o stock e o fiado. Funciona **sem internet** e os dados ficam **só no telemóvel**.

> Esta app **não emite facturas**. Os talões dizem sempre «Documento não fiscal — não serve de factura».

## Abrir no telemóvel

1. No Chrome do Android, abra: **https://evanderevaristo137-commits.github.io/Caixa/** (com «C» maiúsculo)
2. Toque em **Instalar app** (no ecrã «Mais», ou nos três pontos ⋮ do Chrome → «Instalar app» / «Adicionar ao ecrã inicial»).
3. A partir daí abre pelo ícone «Caixa», mesmo sem internet.

## Mostrar a um comerciante (modo demonstração)

- Separador **Mais** → **Entrar no modo demonstração**. Aparece a «Mercearia da Dona Teresa» com 30 produtos, 5 clientes no fiado e duas semanas de vendas.
- Uma faixa amarela no topo lembra que são dados de exemplo.
- Em cada novo dia os dados de exemplo renovam-se sozinhos, para o ecrã «Hoje» ter sempre vendas do dia.
- **Repor dados da demonstração** volta tudo ao início a qualquer momento.
- **Sair da demonstração** volta aos dados reais da loja, que nunca são tocados.

## Como usar

- **Vender:** toque nos produtos (os mais vendidos aparecem primeiro; também pode pesquisar ou ler o código de barras com o botão da câmara) → **Cobrar** → escolha como pagou → **Confirmar venda**. Em numerário, toque na nota que recebeu e a app mostra o troco. No fim pode enviar o talão por WhatsApp.
  - Para vender muitas unidades, abra o carrinho e toque no número para o escrever.
  - Se ler um código que a app não conhece, pode criar o produto na hora: o código já fica preenchido.
- **Fiado:** quem deve, quanto e há quantos dias. Toque no cliente para registar um pagamento (parcial ou total) ou para **Lembrar por WhatsApp** (a app mostra quando foi o último lembrete). O talão de uma venda a fiado mostra o total em dívida do cliente.
- **Hoje:** total vendido, número de vendas, comparação com ontem até à mesma hora, **dinheiro que devia estar na caixa**, divisão por meio de pagamento, stock baixo (com **Enviar lista de compras** por WhatsApp), total em fiado e a lista das vendas do dia. Use as setas ‹ › para ver dias anteriores.
  - Toque numa venda para reenviar o talão ou para a **anular** (engano, desistência, devolução). A venda anulada fica no histórico, mas deixa de contar e o stock volta ao lugar.
- **Produtos:** criar e editar produtos, dar entrada de stock e fazer acertos (sempre com motivo).
- **Mais:** nome da loja, telefone, NIF, cópias de segurança (JSON) e exportação para Excel (CSV).

## Cópias de segurança

Os dados vivem só neste telemóvel. Se o telemóvel se perder ou a app for apagada, perdem-se. Em **Mais → Enviar cópia de segurança** escolha WhatsApp, e-mail ou Drive para guardar a cópia fora do telemóvel. A app lembra no ecrã «Hoje» quando a última cópia tiver mais de 7 dias. Para recuperar: **Mais → Recuperar uma cópia de segurança** e escolha o ficheiro.

## Pagamentos

Nesta fase os pagamentos electrónicos (QR KWiK, Multicaixa Express, Unitel Money, Afrimoney) são **apenas registados**: a pessoa confirma que recebeu o dinheiro no telemóvel dela. Nenhum dinheiro passa pela app.

---

## Para programadores

```bash
npm install
npm run dev        # abre em http://localhost:5173
npm test           # testes dos cálculos (totais, stock, fiado, demonstração, cópias)
npm run typecheck
npm run build
```

A cada push para `main`, o GitHub Actions corre os testes, constrói a app e publica-a no GitHub Pages. Mais detalhes e decisões em `CLAUDE.md`.
