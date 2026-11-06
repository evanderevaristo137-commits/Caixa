# Caixa — a caixa da loja no telemóvel

App para pequenos negócios em Angola: registar vendas, receber por vários meios, controlar o stock e o fiado. Funciona **sem internet** e os dados ficam **só no telemóvel**.

> Esta app **não emite facturas**. Os talões dizem sempre «Documento não fiscal — não serve de factura».

## Abrir no telemóvel

1. No Chrome do Android, abra: **https://evanderevaristo137-commits.github.io/Caixa/** (com «C» maiúsculo)
2. Toque nos três pontos (⋮) → **Instalar app** (ou «Adicionar ao ecrã inicial»).
3. A partir daí abre pelo ícone «Caixa», mesmo sem internet.

## Mostrar a um comerciante (modo demonstração)

- Separador **Mais** → **Entrar no modo demonstração**. Aparece a «Mercearia da Dona Teresa» com 30 produtos, 5 clientes no fiado e duas semanas de vendas.
- Uma faixa amarela no topo lembra que são dados de exemplo.
- Em cada novo dia os dados de exemplo renovam-se sozinhos, para o ecrã «Hoje» ter sempre vendas do dia.
- **Repor dados da demonstração** volta tudo ao início a qualquer momento.
- **Sair da demonstração** volta aos dados reais da loja, que nunca são tocados.

## Como usar

- **Vender:** toque nos produtos (ou pesquise, ou leia o código de barras com o botão da câmara) → **Cobrar** → escolha como pagou → **Confirmar venda**. No fim pode enviar o talão por WhatsApp.
- **Fiado:** quem deve, quanto e há quantos dias. Toque no cliente para registar um pagamento (parcial ou total) ou para **Lembrar por WhatsApp**.
- **Hoje:** total vendido, número de vendas, comparação com ontem até à mesma hora, divisão por meio de pagamento, stock baixo e total em fiado.
- **Produtos:** criar e editar produtos, dar entrada de stock e fazer acertos (sempre com motivo).
- **Mais:** nome da loja, telefone, NIF, cópias de segurança (JSON) e exportação para Excel (CSV).

## Cópias de segurança

Os dados vivem só neste telemóvel. Se o telemóvel se perder ou a app for apagada, perdem-se. Em **Mais → Cópia de segurança (JSON)** guarde um ficheiro com frequência (por exemplo, envie-o para si próprio por WhatsApp ou e-mail). Para recuperar: **Importar cópia de segurança**.

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
