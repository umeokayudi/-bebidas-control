/**
 * Alinha pedidos jul/2026 (LM) com itens das notas de compra.
 * Entrega direta ao Atomic — pedido deve espelhar o que foi comprado.
 *
 * Uso: node scripts/sync-july-pedidos-from-compras.mjs [--dry-run]
 */
import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
import { ATOMIC_BAR_ID } from '../api/_atomicJuneFix.js'
import { matchProduct } from './lib/productMatch.mjs'

const URL = 'https://ojirgkqtqvugqktyuhem.supabase.co'
const DRY = process.argv.includes('--dry-run')
const LE_VIN_PEDIDO = 'a6d3161a-42cd-4a24-b70d-6caac1878d1d'

/** Compra em outra data, mas o pedido foi feito nesta (ex.: água 22/07 no pedido 23/07) */
const COMPRA_TO_PEDIDO_DATE = {
  '2026-07-22': '2026-07-23',
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

function loadServiceKey() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY
  const env = readFileSync('.env.production', 'utf8')
  const m = env.match(/^SUPABASE_SERVICE_ROLE_KEY=(.+)$/m)
  if (m) return m[1].replace(/^["']|["']$/g, '')
  throw new Error('SUPABASE_SERVICE_ROLE_KEY não encontrada')
}

async function findVenda(sb, pedidoId) {
  const key = pedidoId.slice(0, 8)
  const { data } = await sb.from('vendas').select('id,total').ilike('obs', `%${key}%`).limit(1)
  return data?.[0] || null
}

async function main() {
  const sb = createClient(URL, loadServiceKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: produtos } = await sb.from('produtos').select('id,nome,custo,preco_venda,ativo')
  const { data: compras } = await sb.from('compras')
    .select('id,data,fornecedor,total_real,compras_itens(nome,qtd,custo_unitario)')
    .eq('fornecedor', 'Liquor Mountain')
    .gte('data', '2026-07-01')
    .lte('data', '2026-07-31')
    .order('data')

  const { data: pedidos } = await sb.from('pedidos')
    .select('id,data_entrega_prevista,status,total_estimado,pedidos_itens(id,produto_id,qtd,preco_unitario,produtos(nome))')
    .eq('bar_id', ATOMIC_BAR_ID)
    .gte('data_entrega_prevista', '2026-07-01')
    .lte('data_entrega_prevista', '2026-07-31')
    .neq('id', LE_VIN_PEDIDO)

  const report = { synced: 0, mismatches: [], missingPedido: [], removedPedidos: [] }

  console.log(`\n📋 Pedidos jul/2026 vs Liquor Mountain${DRY ? ' (dry-run)' : ''}\n`)

  const comprasByPedidoDate = new Map()
  for (const compra of compras || []) {
    const pedidoDate = pedidoDateForCompra(compra.data)
    const list = comprasByPedidoDate.get(pedidoDate) || []
    list.push(compra)
    comprasByPedidoDate.set(pedidoDate, list)
  }

  const orphanPedidoDates = new Set(
    (pedidos || [])
      .filter(p => !comprasByPedidoDate.has(p.data_entrega_prevista))
      .map(p => p.data_entrega_prevista)
  )

  for (const date of orphanPedidoDates) {
    const pedido = (pedidos || []).find(p => p.data_entrega_prevista === date)
    if (!pedido) continue
    console.log(`  🗑 ${date} — pedido órfão ${pedido.id.slice(0, 8)} (itens movidos para outro dia)`)
    if (!DRY) {
      const venda = await findVenda(sb, pedido.id)
      if (venda) {
        await sb.from('vendas_itens').delete().eq('venda_id', venda.id)
        await sb.from('vendas').delete().eq('id', venda.id)
      }
      await sb.from('pedidos_itens').delete().eq('pedido_id', pedido.id)
      await sb.from('pedidos').delete().eq('id', pedido.id)
    }
    report.removedPedidos.push(date)
  }

  for (const [pedidoDate, comprasDoDia] of [...comprasByPedidoDate.entries()].sort()) {
    const pedido = (pedidos || []).find(p => p.data_entrega_prevista === pedidoDate)
    if (!pedido) {
      report.missingPedido.push(pedidoDate)
      console.log(`  ⚠ ${pedidoDate} — compra sem pedido`)
      continue
    }

    const newItems = []
    let total = 0
    const lines = []

    for (const compra of comprasDoDia) {
      const tag = compra.data !== pedidoDate ? ` (nota ${compra.data})` : ''
      for (const it of compra.compras_itens || []) {
        const prod = matchProduct(it.nome, produtos || [])
        if (!prod) {
          report.mismatches.push({ date: compra.data, item: it.nome, issue: 'produto não encontrado' })
          continue
        }
        const preco = prod.preco_venda || 0
        newItems.push({
          pedido_id: pedido.id,
          produto_id: prod.id,
          qtd: it.qtd,
          preco_unitario: preco,
        })
        lines.push(`${it.qtd}× ${prod.nome} @ ¥${preco}${tag}`)
      }
    }

    const mergedItems = mergeLineItems(newItems)
    total = mergedItems.reduce((a, it) => a + it.preco_unitario * it.qtd, 0)

    const oldTotal = +pedido.total_estimado || 0
    console.log(`  ${pedidoDate} pedido ${pedido.id.slice(0, 8)}`)
    if (comprasDoDia.length > 1) {
      console.log(`    notas: ${comprasDoDia.map(c => c.data).join(' + ')}`)
    }
    console.log(`    antes: ¥${oldTotal.toLocaleString('ja-JP')} → depois: ¥${total.toLocaleString('ja-JP')}`)
    for (const l of lines) console.log(`    · ${l}`)

    if (!DRY) {
      await sb.from('pedidos_itens').delete().eq('pedido_id', pedido.id)
      if (mergedItems.length) await sb.from('pedidos_itens').insert(mergedItems)
      await sb.from('pedidos').update({
        total_estimado: total,
        data_pedido: pedidoDate,
        status: 'entregue',
      }).eq('id', pedido.id)

      const venda = await findVenda(sb, pedido.id)
      if (venda) {
        await sb.from('vendas').update({ total, data: pedidoDate, data_venda: pedidoDate }).eq('id', venda.id)
        await sb.from('vendas_itens').delete().eq('venda_id', venda.id)
        await sb.from('vendas_itens').insert(
          mergedItems.map(it => ({
            venda_id: venda.id,
            produto_id: it.produto_id,
            qtd: it.qtd,
            preco_unitario: it.preco_unitario,
          }))
        )
      }
    }

    report.synced++
  }

  console.log('\n── Resumo ──')
  console.log(`  Sincronizados: ${report.synced}`)
  console.log(`  Removidos:     ${report.removedPedidos.length}`)
  console.log(`  Sem pedido:    ${report.missingPedido.length}`)
  console.log(`  Erros match:   ${report.mismatches.length}`)
  if (report.mismatches.length) {
    for (const m of report.mismatches) console.log(`    · ${m.date} ${m.item}: ${m.issue}`)
  }
  console.log('')
}

main().catch(e => {
  console.error('\n❌', e.message, '\n')
  process.exit(1)
})
