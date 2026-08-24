/**
 * Reconstrói todos os pedidos jul/2026 (Atomic) a partir das compras reais.
 * Apaga pedidos/vendas antigos de julho e recria com datas e itens corretos.
 *
 * Uso: node scripts/rebuild-july-pedidos-from-compras.mjs [--dry-run]
 */
import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
import { ATOMIC_BAR_ID } from '../api/_atomicJuneFix.js'
import { matchProduct } from './lib/productMatch.mjs'

const URL = 'https://ojirgkqtqvugqktyuhem.supabase.co'
const DRY = process.argv.includes('--dry-run')
const JUL_FROM = '2026-07-01'
const JUL_TO = '2026-07-31'

/** Nota em outra data, pedido feito nesta (água 22/07 → pedido 23/07) */
const COMPRA_TO_PEDIDO_DATE = {
  '2026-07-22': '2026-07-23',
}

function loadServiceKey() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY
  const env = readFileSync('.env.production', 'utf8')
  const m = env.match(/^SUPABASE_SERVICE_ROLE_KEY=(.+)$/m)
  if (m) return m[1].replace(/^["']|["']$/g, '')
  throw new Error('SUPABASE_SERVICE_ROLE_KEY não encontrada')
}

function pedidoDateForCompra(compraDate) {
  return COMPRA_TO_PEDIDO_DATE[compraDate] || compraDate
}

function mergeLineItems(items) {
  const byKey = new Map()
  for (const it of items) {
    const key = `${it.produto_id}|${it.preco_unitario}`
    const prev = byKey.get(key)
    if (prev) prev.qtd += it.qtd
    else byKey.set(key, { ...it })
  }
  return [...byKey.values()]
}

async function findVendaForPedido(sb, pedidoId) {
  const key = pedidoId.slice(0, 8)
  const { data } = await sb.from('vendas').select('id').ilike('obs', `%${key}%`).limit(1)
  return data?.[0] || null
}

async function deleteJulyPedidos(sb) {
  const { data: pedidos } = await sb.from('pedidos')
    .select('id,data_entrega_prevista')
    .eq('bar_id', ATOMIC_BAR_ID)
    .gte('data_entrega_prevista', JUL_FROM)
    .lte('data_entrega_prevista', JUL_TO)

  const removed = []
  for (const p of pedidos || []) {
    const venda = await findVendaForPedido(sb, p.id)
    if (!DRY) {
      if (venda) {
        await sb.from('vendas_itens').delete().eq('venda_id', venda.id)
        await sb.from('vendas').delete().eq('id', venda.id)
      }
      await sb.from('pedidos_itens').delete().eq('pedido_id', p.id)
      await sb.from('pedidos').delete().eq('id', p.id)
    }
    removed.push({ date: p.data_entrega_prevista, id: p.id.slice(0, 8) })
  }
  return removed
}

async function getCriadoPor(sb) {
  const { data } = await sb.from('perfis').select('id,email').eq('email', 'umeokayudi@gmail.com').limit(1)
  return data?.[0]?.id || null
}

async function main() {
  const sb = createClient(URL, loadServiceKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const criadoPor = await getCriadoPor(sb)
  const [{ data: produtos }, { data: compras }] = await Promise.all([
    sb.from('produtos').select('id,nome,custo,preco_venda,ativo'),
    sb.from('compras')
      .select('id,data,fornecedor,total_real,obs,compras_itens(nome,qtd,custo_unitario)')
      .gte('data', JUL_FROM)
      .lte('data', JUL_TO)
      .order('data'),
  ])

  console.log(`\n🔄 Rebuild pedidos jul/2026 — Atomic${DRY ? ' (dry-run)' : ''}\n`)

  const removed = await deleteJulyPedidos(sb)
  console.log(`🗑  Removidos ${removed.length} pedidos antigos:`)
  for (const r of removed) console.log(`    · ${r.date} ${r.id}`)

  const byPedidoDate = new Map()
  for (const compra of compras || []) {
    const pedidoDate = pedidoDateForCompra(compra.data)
    const key = pedidoDate
    const entry = byPedidoDate.get(key) || { date: pedidoDate, compras: [] }
    entry.compras.push(compra)
    byPedidoDate.set(key, entry)
  }

  const created = []
  const errors = []

  for (const [date, { compras: comprasDoDia }] of [...byPedidoDate.entries()].sort()) {
    const fornecedores = [...new Set(comprasDoDia.map(c => c.fornecedor))]
    const rawItems = []

    for (const compra of comprasDoDia) {
      for (const it of compra.compras_itens || []) {
        const prod = matchProduct(it.nome, produtos || [])
        if (!prod) {
          errors.push({ date, item: it.nome, fornecedor: compra.fornecedor })
          continue
        }
        const preco = prod.preco_venda || 0
        rawItems.push({
          produto_id: prod.id,
          nome: prod.nome,
          qtd: it.qtd,
          preco_unitario: preco,
          fornecedor: compra.fornecedor,
          nota: compra.data,
        })
      }
    }

    const items = mergeLineItems(rawItems.map(({ produto_id, qtd, preco_unitario }) => ({
      produto_id, qtd, preco_unitario,
    })))

    const total = items.reduce((a, it) => a + it.preco_unitario * it.qtd, 0)
    const obs = comprasDoDia.map(c => `${c.fornecedor} ${c.obs?.slice(0, 30) || c.data}`).join(' · ')

    let pedidoId = 'dry-run'
    let vendaId = 'dry-run'

    if (!DRY) {
      const { data: pedido, error: pErr } = await sb.from('pedidos').insert({
        bar_id: ATOMIC_BAR_ID,
        criado_por: criadoPor,
        status: 'entregue',
        data_pedido: date,
        data_entrega_prevista: date,
        total_estimado: total,
        obs: `Rebuild jul/2026 — ${fornecedores.join(', ')}`,
      }).select().single()

      if (pErr) throw new Error(`pedido ${date}: ${pErr.message}`)
      pedidoId = pedido.id

      await sb.from('pedidos_itens').insert(
        items.map(it => ({ pedido_id: pedidoId, ...it }))
      )

      const { data: venda, error: vErr } = await sb.from('vendas').insert({
        data: date,
        data_venda: date,
        bar_id: ATOMIC_BAR_ID,
        total,
        obs: `Auto: order ${pedidoId.slice(0, 8)}`,
        criado_por: criadoPor,
      }).select().single()

      if (vErr) throw new Error(`venda ${date}: ${vErr.message}`)
      vendaId = venda.id

      await sb.from('vendas_itens').insert(
        items.map(it => ({
          venda_id: vendaId,
          produto_id: it.produto_id,
          qtd: it.qtd,
          preco_unitario: it.preco_unitario,
        }))
      )
    }

    created.push({
      date,
      pedidoId: pedidoId.slice(0, 8),
      fornecedores,
      notas: comprasDoDia.map(c => c.data),
      total,
      items: rawItems,
      merged: items,
    })

    console.log(`\n✅ ${date} — ¥${total.toLocaleString('ja-JP')} (${fornecedores.join(', ')})`)
    if (comprasDoDia.length > 1) console.log(`   notas: ${comprasDoDia.map(c => `${c.data} ${c.fornecedor}`).join(' + ')}`)
    for (const it of rawItems) {
      const tag = it.nota !== date ? ` [nota ${it.nota}]` : ''
      console.log(`   · ${it.qtd}× ${it.nome} @ ¥${it.preco_unitario}${tag}`)
    }
  }

  const totalReceita = created.reduce((a, c) => a + c.total, 0)
  const totalCompras = (compras || []).reduce((a, c) => a + (+c.total_real || 0), 0)

  console.log('\n══════════════════════════════════════')
  console.log('RESUMO JULHO/2026 — ATOMIC')
  console.log('══════════════════════════════════════')
  console.log(`Pedidos criados:  ${created.length}`)
  console.log(`Pedidos removidos: ${removed.length}`)
  console.log(`Receita total:    ¥${totalReceita.toLocaleString('ja-JP')}`)
  console.log(`Compras total:    ¥${totalCompras.toLocaleString('ja-JP')}`)
  if (errors.length) {
    console.log(`\n⚠ Erros (${errors.length}):`)
    for (const e of errors) console.log(`   · ${e.date} ${e.fornecedor}: ${e.item}`)
  }
  console.log('')
}

main().catch(e => {
  console.error('\n❌', e.message, '\n')
  process.exit(1)
})
