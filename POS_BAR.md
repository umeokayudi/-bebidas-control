# Plataforma POS do Bar (all-in-one)

Sistema de gestão da operação do bar montado **em cima** do sistema JBM Drinks
existente, sem mexer no fornecimento de bebida. Cobre os cinco módulos da
especificação: POS com faturamento por hora, estoque inteligente com reposição
automática, staff/salários, drink back e serviços de limpeza/manutenção.

Onde fica: portal do bar (login com `role = 'cliente'`) → aba **🍸 Bar POS**.

---

## Regra de ouro: POS e fornecimento JBM são separados

O bar e a JBM Drinks compartilham o mesmo banco Supabase. A separação é o que
impede o POS de estragar a margem, as faturas e os relatórios do fornecedor.

| Dado | Tabela | Quem escreve |
|---|---|---|
| Faturamento do balcão | `pos_vendas`, `pos_vendas_itens` | só o POS |
| Entregas da JBM ao bar | `vendas`, `vendas_itens` | só o lado fornecedor |
| Compras / faturas da JBM | `compras`, `faturas` | só o lado fornecedor |
| Estoque do bar | `estoque_movimentos` | portal (`origem='manual'`) e POS (`origem='pos'`) |
| Pedido bar → JBM | `pedidos` | portal (`origem='manual'`) e reposição (`origem='pos_auto'`) |
| Catálogo de produtos | `produtos` / `produtos_public` | somente leitura no POS |

Três garantias automatizadas em `tests/jbmIsolation.test.js`:

1. Nenhum arquivo do POS faz `insert/update/upsert/delete` em tabela do fornecedor.
2. Nenhum arquivo do POS escreve em `pedidos` direto — só via `/api/pos-reorder`.
3. `BAR_POS_SCHEMA.sql` é puramente aditivo: sem `drop`, sem `rename`, sem
   `delete from`, e todo `alter table` em tabela JBM é `add column if not exists`
   com `default`, para os `insert` atuais continuarem válidos.

O teste `tests/posSale.test.js` reforça isso em runtime: registra uma venda
completa contra um Supabase falso e verifica que nenhuma tabela do fornecedor
foi tocada.

---

## Instalação

1. Rode `ATOMIC_POS_SCHEMA.sql` no SQL Editor do Supabase (se ainda não rodou).
2. Rode `BAR_POS_SCHEMA.sql`. É idempotente — rodar de novo não faz nada.
3. Opcional, para a reposição automática disparar webhook: adicione
   `POS_REORDER_WEBHOOK_URL` nas variáveis de ambiente da Vercel (ou coloque a
   URL por bar em POS → Configurações).

Enquanto o schema não estiver aplicado, o hub mostra um aviso de setup e as
abas que dependem das tabelas novas ficam vazias em vez de quebrar.

---

## Módulo 1 — POS e faturamento por hora

- **Caixa** (`PosCheckout`): drinks do cardápio + shots por garrafa, preço
  regular/VIP/código de desconto, atribuição da venda ao atendente e à promoter
  de drink back, forma de pagamento.
- **Painel** (`PosDashboard`): faturamento do dia por faixa horária, ticket
  médio, hora de pico, média dos últimos 7 dias, métricas de drink back e
  chamados de serviço abertos.
- **Dia operacional**: o bar fecha depois da meia-noite, então uma venda às 2h
  entra na noite anterior (`businessDay`). Sem isso o relatório por hora
  quebraria a noite em dois dias.
- **Horários ociosos**: `suggestIdlePromotions` marca as faixas abaixo da meta e
  sugere a ação conforme o quanto a hora já preenche — hora quase vazia pede
  happy hour, hora meio cheia pede reserva ou evento.

A meta por hora é configurável. Em 0, o sistema usa 40% da média das horas com
movimento, para um bar de movimento baixo não marcar a noite toda como ociosa.

## Módulo 2 — Estoque inteligente e reposição automática

Baixa de estoque em tempo real a cada venda:

- **Shot** (produto JBM direto): 1 drink = `1 / drinks_por_garrafa` garrafa.
- **Drink de cardápio**: soma a receita cadastrada em `drink_menu_ingredientes`
  (aba **Receitas**). Sem receita a venda acontece, mas o estoque não baixa —
  evita saldo negativo fantasma.

Reorder point por produto (`estoque_regras.minimo`, o mesmo que o portal já
usa). Quando o saldo chega ao mínimo:

1. Grava `pos_reorder_requests` com status `pendente`.
2. `POST /api/pos-reorder` dispara o webhook para a operação central (Make.com).
3. Se `criar_pedido_jbm` estiver ligado, cria o `pedidos` + `pedidos_itens` com
   `status = 'pendente'` e `origem = 'pos_auto'` — o mesmo formato do pedido
   manual, então o fluxo de confirmação/entrega da JBM não muda.
4. Notifica os admins (`notificacoes`, tipo `pedido_novo`, igual ao portal).

Proteções:

- `auto_reorder_enabled` vem **desligado**; o dono liga quando quiser.
- Cooldown por produto (24h por padrão) impede que cada venda de um item zerado
  gere um pedido novo para a JBM.
- Ordem sugerida = `minimo × multiplicador − estoque`, arredondada para garrafa
  inteira, no mínimo 1.
- A request é gravada antes do webhook: se o disparo falhar, o dono vê a
  reposição na tela com status `falhou` e pode reenviar.

Payload do webhook:

```json
{
  "evento": "pos.reposicao_automatica",
  "gerado_em": "2026-03-10T12:00:00.000Z",
  "bar": { "id": "...", "nome": "Atomic", "endereco": "...", "telefone": "..." },
  "config": { "cooldown_horas": 24, "multiplicador": 2, "criar_pedido_jbm": true },
  "itens": [
    { "produto_id": "...", "sku": "SKU-A", "produto": "Grey Goose 700ml",
      "estoque_atual": 0, "minimo": 3, "qtd_sugerida": 6, "preco_unitario": 4800 }
  ],
  "total_itens": 1,
  "total_estimado": 28800
}
```

## Módulo 3 — Staff, custos e salários

- Cadastro com cargo, comissão e três formas de pagamento: `mensal` (salário
  cheio), `diaria` (× dias escalados), `hora` (× horas escaladas).
- Escala de turnos que atravessa a meia-noite (20:00 → 02:00 = 6h). Turno com
  status `falta` não entra no custo.
- Folha do mês = custo fixo + comissão sobre as vendas atribuídas à pessoa no
  caixa, com o custo de mão de obra como % do faturamento do POS.
- Cobertura por hora cruzada com o faturamento: hora que fatura acima da média
  com pouca gente é gargalo; hora vazia com muita gente é custo jogado fora.

## Módulo 4 — Drink back (promoters / hostesses)

- Cadastro com região e cidade, comissão própria (ou o padrão do bar) e meta
  mensal.
- No caixa, a venda é vinculada à promoter; a comissão é gravada em
  `drink_back_comissoes` na mesma transação lógica da venda.
- A base da comissão é o **total cobrado**, não o preço de tabela — pagar sobre
  a tabela faria o bar pagar comissão em cima do desconto que ele mesmo deu.
- Ranking, progresso de meta, mapa regional e baixa de pagamento em lote.

## Módulo 5 — Serviços (limpeza e manutenção)

- Chamados com tipo, prioridade, data agendada, fornecedor e custo.
- Fila ordenada por atraso → prioridade → data.
- Fluxo `aberto → agendado → em_andamento → concluido`.
- Recorrência (semanal / quinzenal / mensal): ao concluir, o próximo chamado é
  agendado automaticamente — é o que transforma "limpeza pesada" em manutenção
  preventiva de verdade.

---

## Estrutura dos arquivos

A especificação sugeria `/frontend`, `/backend`, `/database`, `/webhooks`. Este
repositório já tem uma estrutura equivalente, então o código novo seguiu a
convenção existente em vez de reorganizar o projeto:

| Papel | Caminho neste repo |
|---|---|
| Frontend | `src/components/pos/*` |
| Regras de negócio | `src/lib/pos*.js`, `src/lib/drinkBack.js`, `src/lib/barStaff.js`, `src/lib/serviceOrders.js` |
| Backend / webhook | `api/pos-reorder.js` |
| Database | `BAR_POS_SCHEMA.sql` |
| Testes | `tests/*.test.js` |

Regras de negócio ficam em módulos puros, sem Supabase e sem React, para serem
testáveis: `posHourly` (faturamento por hora), `posStock` (consumo e reposição),
`drinkBack` (comissões), `barStaff` (folha e escala), `serviceOrders` (chamados).
`posData` é a única camada que fala com o Supabase.

## Testes

```bash
npm test          # 164 testes
npm run build
```
