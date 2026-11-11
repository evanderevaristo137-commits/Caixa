# A reforma do comerciante (INSS) na Caixa

Documento de trabalho. Regras consultadas em **Novembro de 2026**. Antes de usar com lojas reais, confirmar com o INSS o que está marcado «a confirmar» (as perguntas estão no fim).

## A ideia

Quem vende por conta própria não tem patrão que desconte para a reforma. Na velhice fica a depender dos filhos. A lei já permite (e manda) que estes trabalhadores se inscrevam no INSS e paguem todos os meses, mas quase ninguém o faz: é preciso saber que existe, lembrar-se todos os meses e ter o dinheiro junto no dia certo.

A Caixa ajuda nessas três coisas: **mostra quanto se recebe**, **ajuda a guardar um pouco por dia** e **lembra o pagamento**. E guarda o histórico, que mais tarde também ajuda a loja a conseguir crédito.

**Proposta do fundador:** todos contribuem sobre **1 salário mínimo**, a base mais baixa que a lei aceita. Quem quiser pode declarar mais.

## O que diz a lei

| Tema                | Regra                                                                                                                                                                                      | Estado                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Diploma             | Decreto Presidencial n.º 97/22, de 2 de Maio: protecção social obrigatória dos trabalhadores por conta própria (substituiu o Decreto n.º 42/08)                                            | Confirmado em várias fontes                                                              |
| Quem                | Quem trabalha sem contrato de trabalho, angolano ou estrangeiro residente. A inscrição é obrigatória                                                                                       | Confirmado em várias fontes                                                              |
| Sobre que valor     | O rendimento declarado na inscrição, em número de **salários mínimos nacionais, de 1 a 35**                                                                                                | Confirmado numa fonte; a confirmar qual salário mínimo conta                             |
| Salário mínimo      | 100.000 Kz desde Setembro de 2025 (Decreto Presidencial n.º 152/24). Micro-empresas: 50.000 Kz                                                                                             | Confirmado. A confirmar se o INSS usa os 100.000 Kz para quem trabalha por conta própria |
| Taxa normal         | **8%** do rendimento declarado. Cobre a reforma por velhice, o abono de velhice (para quem não chega aos 15 anos), a reforma antecipada, a pensão de sobrevivência e o subsídio de funeral | Confirmado em várias fontes                                                              |
| Taxa alargada       | **11%**: junta o subsídio por morte e os subsídios de pré-maternidade, maternidade e aleitamento                                                                                           | Confirmado em várias fontes                                                              |
| Baixos rendimentos  | **4%** para actividades de baixos rendimentos (as fontes falam da agricultura)                                                                                                             | A confirmar se os pequenos comerciantes podem entrar, e o que cobre                      |
| Prazo               | Todos os meses, **até ao dia 10 do mês seguinte**. Com autorização do INSS, pode pagar-se de 2 a 6 meses de uma vez                                                                        | Confirmado numa fonte oficial (MAPTSS)                                                   |
| Inscrição           | Nos balcões do INSS ou no portal INSS Virtual (regime «Conta Própria»). Cópia do bilhete de identidade e dos documentos de quem depende do trabalhador                                     | Confirmado em duas fontes; a confirmar se pedem NIF                                      |
| Reforma             | Aos **60 anos** (ou com 420 meses de contribuições), com pelo menos **180 meses** (15 anos)                                                                                                | Confirmado em várias fontes                                                              |
| Valor da pensão     | Rendimento declarado (média dos últimos 36 meses) × meses pagos ÷ 420 (Decreto Presidencial n.º 299/20)                                                                                    | Confirmado em duas fontes; a confirmar pensão mínima                                     |
| Mulheres            | A idade da reforma desce um ano por cada filho, até 5 anos                                                                                                                                 | A confirmar se vale para quem trabalha por conta própria                                 |
| Atrasos             | O diploma antigo tirava os direitos a quem devia mais de 18 meses                                                                                                                          | A confirmar o que vale hoje (juros, multas, perda de direitos)                           |
| Formalização (PREI) | O Programa de Reconversão da Economia Informal (Decreto Presidencial n.º 148/25) inclui a inscrição no INSS na sua Janela Única                                                            | Confirmado                                                                               |

Não conseguimos abrir o texto completo do diploma a partir do ambiente de desenvolvimento: as regras acima vêm de resumos de advogados, da imprensa económica e de páginas oficiais, cruzados entre si.

## Os números da proposta

Com 1 salário mínimo (100.000 Kz) e a taxa normal de 8%:

- **8.000 Kz por mês**, cerca de **270 Kz por dia**.
- Um funcionário com o salário mínimo desconta 3% (3.000 Kz) e o patrão junta 8% (8.000 Kz). O comerciante não tem patrão: paga os 8% sozinho.

| Anos a pagar | Reforma por mês (valores de hoje) |
| ------------ | --------------------------------- |
| 15 anos      | cerca de 42.900 Kz                |
| 20 anos      | cerca de 57.100 Kz                |
| 25 anos      | cerca de 71.400 Kz                |
| 35 anos      | 100.000 Kz                        |

Em 15 anos paga-se 1.440.000 Kz, que voltam em menos de 3 anos de reforma. Com a modalidade alargada (11%) são 11.000 Kz por mês e a pensão é a mesma: o que muda são os subsídios de maternidade e por morte.

## O que a app faz (Fase 1)

Tudo em «A minha reforma (INSS)», no «Hoje» e em «Mais». É **voluntário**: quem não quiser não vê nada disto no dia-a-dia.

1. **Simulador.** A pessoa escolhe quantos salários mínimos declara e o ano em que nasceu; a app diz quanto paga por mês e por dia e quanto recebe de reforma. Diz sempre que é uma estimativa.
2. **Mealheiro.** «Guardar para o INSS» regista o dinheiro posto de parte. Não é despesa (não baixa o lucro), como a retirada do dono, mas sai da conta do dinheiro da caixa. A app mostra quanto já está guardado e quanto falta para o mês.
3. **Lembrete.** No «Hoje» e no aviso diário com a app fechada: 2 dias antes do dia 10, no próprio dia e até 5 dias depois.
4. **Histórico.** «Registar pagamento ao INSS» guarda o mês, o valor e o número do comprovativo. A app conta os meses pagos, os meses seguidos e quanto falta para os 15 anos. A Ficha da loja mostra essa contagem (é a loja que decide enviá-la).
5. **Guia de inscrição.** Onde ir e o que levar.

Regras e contas: `src/domain/inss.ts` (os números estão todos em `INSS_RULES`).

## O que a app não faz

- **Não recebe dinheiro.** O pagamento faz-se sempre ao INSS, pelos meios do INSS.
- **Não inscreve ninguém** nem fala com o INSS: não há ligação aos sistemas do INSS.
- **Não prova nada.** O histórico é o registo da loja; o que vale são os comprovativos e o extracto do INSS.
- **Não promete valores.** A pensão é uma estimativa com as regras de hoje, em valores de hoje.
- O número de segurança social e as contribuições ficam só no telemóvel. No resumo do piloto vai apenas se a loja usa a funcionalidade e quantos meses registou.

## Perguntas para a reunião com o INSS

**Sobre as regras**

1. Para quem trabalha por conta própria, o salário mínimo que conta é o de 100.000 Kz? Quando o salário mínimo sobe, a contribuição sobe sozinha?
2. Um pequeno comerciante (cantina, banca de mercado, zungueira) pode inscrever-se na modalidade de baixos rendimentos, a 4%? O que cobre e como se calcula a pensão nessa modalidade?
3. A fórmula da pensão (rendimento × meses ÷ 420) e os 180 meses mínimos valem tal e qual para quem trabalha por conta própria? Existe pensão mínima?
4. A redução da idade da reforma por cada filho vale para as comerciantes por conta própria?
5. O que acontece a quem falha meses: juros, multas, perda de direitos? Pode pagar os meses em atraso mais tarde?
6. Como se pede para pagar de 2 a 6 meses de uma vez?
7. Como e quando se pode mudar o número de salários mínimos declarados?

**Sobre a inscrição e o pagamento**

8. Que documentos são pedidos além do bilhete de identidade? É preciso NIF ou prova da actividade?
9. Por que meios se paga (referência Multicaixa, Multicaixa Express, banco, portal INSS Virtual)? Como se chama e que aspecto tem o comprovativo?
10. O comerciante consegue ver o seu extracto de contribuições no telemóvel? Onde?

**Sobre trabalhar em conjunto**

11. O INSS faria dias de inscrição nos mercados com a Caixa, com uma equipa no local?
12. Uma plataforma pode inscrever ou pagar em nome dos comerciantes, com autorização deles? Que licença ou protocolo é preciso?
13. Há forma de a app confirmar junto do INSS que um mês foi pago (para o histórico deixar de ser só declarado pela loja)?
14. O INSS tem números recentes de inscritos por conta própria? (Em 2024 falava-se de cerca de 68 mil, a confirmar.)

## Fases seguintes

- **Fase 2:** dias de inscrição colectiva nos mercados; o painel do piloto mostra quantas lojas contribuem e há quantos meses.
- **Fase 3:** pagar o INSS a partir da app e pôr de parte automaticamente uma parte de cada venda digital, sempre através de um banco ou prestador licenciado.
- **Fase 4:** melhores condições de crédito para quem contribui; um só desconto automático pode pagar a prestação do crédito e o INSS.

## Fontes

- Decreto Presidencial n.º 97/22: [portal do INSS (PDF)](https://portal.inss.gov.ao/wp-content/uploads/2022/06/Decreto-Presidencial-97_22-o-Regime-Juridico-da-PSO-dos-Trabalhadores-por-Conta-Propria.pdf), [lex.ao](https://lex.ao/docs/presidente-da-republica/2022/decreto-presidencial-n-o-97-22-de-02-de-maio/), [resumo da Miranda Advogados](https://www.mirandalawfirm.com/pt/conhecimento-media/publications/alerts/proteccao-social-obrigatoria-dos-trabalhadores-por-conta-propria-3), [Angolex](https://www.angolex.com/paginas/decreto-presidencial/regime-juridico-da-proteccao-social-obrigatoria-dos-trabalhadores-por-conta-propria.html)
- As duas modalidades e o que cobrem: [Expansão](https://expansao.co.ao/angola/detalhe/dois-regimes-diferentes-para-os-trabalhadores-por-conta-propria-na-seguranca-social--55870.html)
- Prazo de pagamento: [MAPTSS, «Obrigação contributiva»](https://maptss.gov.ao/obrigacao-contributiva/)
- Inscrição: [INSS Virtual](https://virtual.inss.gov.ao/Contribuinte/Inscricao)
- Salário mínimo: [Decreto Presidencial n.º 152/24 (MAPTSS)](https://www.maptss.gov.ao/wp-content/uploads/2024/09/DECRETO-PRESIDENCIAL-152_24-FIXA-O-NOVO-SALARIO-MINIMO-NACIONAL.pdf), [Jornal de Angola](https://www.jornaldeangola.ao/noticias/4/economia/645742/sal%C3%A1rio-m%C3%ADnimo-nacional-sobe-de-70-mil-para-100-mil-kwanzas-a-partir-de-setembro)
- Reforma: [Expansão](https://expansao.co.ao/angola/detalhe/reformas-por-velhice-sao-aos-60-anos-ou-com-35-anos-de-descontos-ao-inss--55589.html), [SEPE](https://sepe.gov.ao/catalogo/mais-servicos/trabalho/pensao-de-reforma), [Angolex, protecção social na velhice](https://angolex.com/paginas/decreto-presidencial/regime-juridico-de-proteccao-social-na-velhice.html)
- PREI: [Decreto Presidencial n.º 148/25 (lex.ao)](https://lex.ao/docs/presidente-da-republica/2025/decreto-presidencial-n-o-148-25-de-30-de-julho/), [prei.ao](https://prei.ao/sobre-o-prei/)
