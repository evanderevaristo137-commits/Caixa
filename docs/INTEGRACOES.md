# Caixa — Ligação à facturação certificada e aos pagamentos

Documento para entregar a parceiros: um **software de facturação certificado pela AGT** e um **prestador de pagamentos licenciado pelo BNA**. Explica o que a Caixa envia, o que espera receber e o que precisamos de saber de cada parceiro.

> **A Caixa não emite facturas.** Regista vendas e prepara os dados. A factura (ou factura-recibo) e a nota de crédito são emitidas pelo software certificado do parceiro.

Todos os exemplos usam **dados fictícios**.

---

## 1. Como a Caixa funciona hoje (fase 1)

- App no telemóvel (Android, Chrome), **funciona sem internet**; os dados ficam só no telemóvel.
- Cada registo tem um identificador único (UUID), data de criação e de alteração, e o identificador do telemóvel (`deviceId`). Todas as alterações ficam num registo de auditoria.
- Dinheiro sempre em **cêntimos de kwanza** (números inteiros, sem vírgula flutuante): 12.500 Kz = `1250000`.
- Preços de venda ao público **com IVA incluído**.
- Na fase 2 haverá um servidor; a ligação aos parceiros será feita **a partir do servidor** (nunca com credenciais guardadas no telemóvel).

## 2. Facturação certificada (parceiro AGT)

### Fluxo

1. A loja regista a venda (mesmo sem rede).
2. A Caixa prepara um **pedido de factura** (`InvoiceRequest`).
3. Quando houver ligação, o pedido segue para o parceiro, que emite o documento e devolve o número.
4. O número fica guardado na venda (`invoice.documentNumber`).
5. Se a venda for **anulada**, a Caixa prepara um **pedido de nota de crédito** (`CreditNoteRequest`) que aponta para o documento original. Nada é apagado.

### Regras que pedimos ao parceiro

- **Nunca emitir duas vezes o mesmo documento:** cada pedido tem um `requestId` único (`sale:<id>` para a venda, `void:<id>` para a anulação). Se o mesmo `requestId` chegar duas vezes (por exemplo, após uma falha de rede), devolver o documento já emitido.
- **Emissão diferida:** as vendas podem ter sido feitas sem rede; a data da venda está em `issueDate`.
- O tipo de documento é **sugerido** (`FR` quando foi pago na hora, `FT` quando é a crédito). Quem decide é o parceiro.

### Exemplo de pedido de factura

```json
{
  "schema": "caixa.invoice-request/1",
  "kind": "invoice",
  "requestId": "sale:3f2b8c1e-0000-4000-8000-000000000001",
  "suggestedDocumentType": "FR",
  "issueDate": "2026-11-06T10:00:00.000Z",
  "currency": "AOA",
  "pricesIncludeTax": true,
  "seller": { "name": "Loja Exemplo", "nif": "5000000000", "address": "Rua Exemplo, Luanda", "vatRegime": "general" },
  "buyer": { "name": "Consumidor final" },
  "lines": [
    {
      "lineNumber": 1,
      "productCode": "2000000000017",
      "description": "Arroz 1 kg",
      "quantity": 2,
      "unit": "un",
      "unitPriceCents": 120000,
      "lineTotalCents": 240000,
      "taxRateBp": 1400
    }
  ],
  "totalCents": 240000,
  "payment": { "method": "multicaixa_express", "reference": "MCX-000001" },
  "source": { "app": "caixa", "saleId": "3f2b8c1e-0000-4000-8000-000000000001", "saleNumber": 7, "deviceId": "…" }
}
```

- **Produtos vendidos ao quilo:** `quantity` em kg com até 3 casas decimais (por exemplo `0.75`), `unit: "kg"` e `unitPriceCents` é o preço **por kg**. O total da linha (`lineTotalCents`) vem arredondado ao kwanza inteiro, ou é exactamente o valor que o cliente pediu («500 Kz de feijão»); é esse o valor cobrado.
- `taxRateBp`: taxa de IVA em pontos base (`1400` = 14%). Se faltar, a loja ainda não a indicou; o parceiro ou o contabilista confirma.
- `taxExemption`: motivo de isenção, quando a taxa é 0.
- `buyer`: «Consumidor final», ou nome e NIF do cliente quando a loja os tem. **Nunca enviamos telefones de clientes.**
- `payment.method`: `cash` (numerário), `kwik`, `multicaixa_express`, `unitel_money`, `afrimoney`, `paypay`, `transfer` (transferência bancária), `tpa` (cartão no TPA), `credit` (a crédito, com `dueDate`). Na transferência e no TPA, `reference` é a referência da transferência ou o número do talão do TPA, escritos pela loja (não passam pelo prestador de pagamentos).

### Exemplo de pedido de nota de crédito (venda anulada)

```json
{
  "schema": "caixa.invoice-request/1",
  "kind": "credit_note",
  "requestId": "void:3f2b8c1e-0000-4000-8000-000000000001",
  "issueDate": "2026-11-06T11:00:00.000Z",
  "reason": "Devolução",
  "original": { "requestId": "sale:3f2b8c1e-0000-4000-8000-000000000001", "documentNumber": "FR A/12" },
  "…": "mesmos campos seller, buyer, lines, totalCents e currency da venda"
}
```

### O que esperamos receber

```json
{ "status": "issued", "documentNumber": "FR A/12", "documentUrl": "https://… (PDF, opcional)" }
```

ou, em caso de recusa, `{ "status": "rejected", "reason": "…" }`.

### Perguntas para o parceiro de facturação

- Número de certificação AGT do software e tipos de documento suportados (FR, FT, NC…).
- Têm API? Formato (REST/JSON?), autenticação, ambiente de testes (sandbox) e limites.
- Aceitam emissão diferida (vendas feitas sem rede, enviadas mais tarde)? Até quantos dias?
- Garantem não duplicar documentos com o mesmo `requestId`?
- Como tratam o IVA a partir de preços com IVA incluído (arredondamentos)? Regime simplificado?
- Entregam o PDF do documento e o envio por WhatsApp/e-mail ao cliente?
- Geram o SAF-T (AO) da loja? Como a loja o obtém?
- Preço por documento ou mensalidade; contrato e suporte.

## 3. Pagamentos (prestador licenciado pelo BNA)

### Fluxo

1. A loja escolhe o meio (QR KWiK, Multicaixa Express, Unitel Money, Afrimoney ou PayPay).
2. A Caixa pede o pagamento (`createPayment`) com uma **chave anti-duplicação** (`idempotencyKey`).
3. Se o cliente tiver de aprovar no telemóvel, o estado fica `pending`; a Caixa consulta (`getPaymentStatus`) até `confirmed`, `failed` ou `expired`.
4. A venda só é registada como paga com `confirmed`. Devoluções com `refundPayment`.

### Exemplo de pedido de pagamento

```json
{
  "idempotencyKey": "a1b2c3d4-…:paypay:240000",
  "amountCents": 240000,
  "currency": "AOA",
  "method": "paypay",
  "reference": "3f2b8c1e-0000-4000-8000-000000000001",
  "payerPhone": "opcional, só se o meio o exigir"
}
```

- `reference` é o **identificador da venda na Caixa** (o mesmo `saleId` do pedido de factura): serve para ligar o pagamento, a venda e a factura. Nasce com o carrinho, antes de se pedir o pagamento, e a Caixa nunca regista duas vendas com o mesmo identificador.
- `idempotencyKey` muda a cada nova tentativa depois de uma falha; a `reference` mantém-se enquanto for a mesma venda.

Resposta esperada: `{ "status": "pending" | "confirmed" | "failed" | "expired" | "refunded", "providerRef": "…", "reason": "…" }`.

### Regras que pedimos ao prestador

- **A mesma `idempotencyKey` nunca cobra duas vezes** (a rede em Angola falha: a Caixa pode repetir o pedido).
- Notificação do resultado ao nosso servidor (webhook assinado) na fase 3, além da consulta de estado.
- Referência do prestador (`providerRef`) para conciliar com o extracto.

### Fase 1 (hoje)

Os pagamentos electrónicos **não passam pela app**: a loja confirma que recebeu no telemóvel e pode escrever a **referência do pagamento** que aparece no telemóvel do cliente (campo `transactionRef`). Isto permite conciliar mais tarde com o banco.

### Perguntas para o prestador de pagamentos

- Que meios cobrem (QR KWiK dinâmico, Multicaixa Express por pedido ao telemóvel, Unitel Money, Afrimoney, PayPay)?
- API e ambiente de testes; autenticação; limites; tempo até à confirmação.
- Garantem a idempotência? Têm webhooks assinados?
- Devoluções (totais e parciais): como e em quanto tempo?
- Comissões, prazos de liquidação na conta da loja e requisitos para a loja aderir.

### Crédito para stock (fase 4): retenção e mínimo de pagamentos digitais

O crédito para stock paga-se com uma **retenção** de uma parte de cada pagamento digital recebido pela loja. Para a loja não fugir à retenção cobrando em numerário, o contrato exige uma parte mínima de **recebimentos digitais** e a Caixa dá o alarme quando eles caem de repente. Regras actuais (a acertar com o banco e o prestador; código em `src/domain/digital-watch.ts`):

- **Recebimentos** = vendas pagas na hora (numerário ou digital) + pagamentos de clientes a crédito. Digitais = QR KWiK, Multicaixa Express, Unitel Money, Afrimoney, PayPay.
- Medição: últimos **7 dias completos**, contra a média semanal das **4 semanas anteriores**.
- **Alarme** quando: a parte digital fica abaixo do mínimo do contrato; ou os recebimentos digitais caem **40% ou mais** com o total a cair **menos de 25%**; ou a parte digital desce **15 pontos** ou mais.
- Na fase 4 pedimos ao prestador os **totais diários de pagamentos digitais por loja** (sem dados dos clientes), para confirmar no servidor o que a app regista.

Perguntas ao prestador e ao banco: a retenção pode ser feita pelo prestador na liquidação? Em que prazo chegam os totais diários? Que falhas de rede ou do prestador ficam registadas (para não penalizar a loja por quedas que não são culpa dela)?

## 4. Validação e registo na Caixa

- **Auditoria:** cada alteração guarda quem/o quê/quando e o antes/depois (registo «Registo de alterações» na app).
- **Vendas anuladas** ficam no histórico com motivo; o stock volta por movimentos próprios.
- **Código do dono** (opcional) para anular vendas, mudar preços, acertar stock e recuperar cópias.
- **Verificar os dados:** stock = soma dos movimentos; total de cada venda = soma das linhas.
- **Prazos de pagamento** nas vendas a crédito (`dueDate`).

## 5. Dados pessoais

- Guardamos só o necessário: nome do cliente, telefone (só para WhatsApp) e NIF opcional.
- Para a facturação enviamos **nome e NIF** do comprador quando existem; **nunca o telefone**.
- Os dados ficam no telemóvel da loja até à fase 2. Seguimos a lei angolana de protecção de dados pessoais (Lei n.º 22/11) e pedimos o mesmo aos parceiros.

## 6. Onde está no código

- Pedido de factura e nota de crédito: `src/integrations/invoice-request.ts`
- Interface de facturação: `src/providers/invoice.ts` (`InvoiceProvider`, só versões de teste)
- Interface de pagamentos: `src/providers/payment.ts` (`PaymentProvider`, só versões de teste)
- Exportação para o parceiro (ficheiro JSON com todas as vendas e anulações): app → **Mais → Dados para facturação → Dados de vendas para o parceiro**
