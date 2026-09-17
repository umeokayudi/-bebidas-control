import AtomicPosPanel from '../AtomicPos'
import { createPosMemoryDb, completePosSale } from '../../lib/posEngine'
import { useMemo } from 'react'
import { useI18n } from '../../lib/i18n'

const DEMO_BAR = { id: 'demo-bar', nome: 'Atomic Bar' }

export function demoPosSeed() {
  const night = new Date()
  night.setHours(21, 0, 0, 0)
  const sales = [18, 20, 21, 22, 23, 1].map((hora, i) => ({
    id: `seed-sale-${i}`,
    bar_id: 'demo-bar',
    data: new Date().toISOString().slice(0, 10),
    hora,
    total: hora === 18 || hora === 1 ? 1800 : 6200 + i * 400,
    subtotal: hora === 18 ? 1800 : 6200,
    status: 'fechada',
    tipo: 'balcao',
    criado_em: new Date(night.getTime() + i * 3600000).toISOString(),
  }))
  return {
    drink_menu: [
      { id: 'd1', bar_id: 'demo-bar', nome: 'Gin Tonic', categoria: 'Gin', preco_venda: 1200, preco_desconto: 500, custo: 180, margem: 0.85 },
      { id: 'd2', bar_id: 'demo-bar', nome: 'Whisky Highball', categoria: 'Whisky', preco_venda: 1000, preco_desconto: 500, custo: 140, margem: 0.86 },
      { id: 'd3', bar_id: 'demo-bar', nome: 'Lemon Sour', categoria: 'Shochu', preco_venda: 900, preco_desconto: 500, custo: 90, margem: 0.9 },
      { id: 'd4', bar_id: 'demo-bar', nome: 'Champagne glass', categoria: 'Sparkling', preco_venda: 2000, preco_desconto: 1000, custo: 600, margem: 0.7 },
      { id: 'd5', bar_id: 'demo-bar', nome: 'Umeshu soda', categoria: 'Liqueur', preco_venda: 1100, preco_desconto: 500, custo: 160, margem: 0.85 },
    ],
    bar_pricing: [
      { id: 'p1', bar_id: 'demo-bar', produto_id: 'prod-jack', drinks_por_garrafa: 16, preco_drink: 800, produtos: { nome: "Jack Daniel's shot", categoria: 'Shot' } },
      { id: 'p2', bar_id: 'demo-bar', produto_id: 'prod-henny', drinks_por_garrafa: 12, preco_drink: 1500, produtos: { nome: 'Hennessy shot', categoria: 'Shot' } },
    ],
    drink_back_agents: [
      { id: 'db1', bar_id: 'demo-bar', nome: 'Yuki', codigo: 'YK-01', regiao: 'Roppongi', comissao_pct: 10, ativo: true },
      { id: 'db2', bar_id: 'demo-bar', nome: 'Mika', codigo: 'MK-07', regiao: 'Nishiazabu', comissao_pct: 12, ativo: true },
    ],
    vip_members: [
      { id: 'v1', bar_id: 'demo-bar', nome: 'Tanaka', codigo: 'VIP-01', ativo: true },
    ],
    discount_codes: [
      { id: 'c1', bar_id: 'demo-bar', codigo: 'ATOMIC-WELCOME', descricao: 'Welcome 10%', tipo: 'percent', valor: 10, ativo: true, usos_atual: 0 },
    ],
    estoque_regras: [
      { bar_id: 'demo-bar', produto_id: 'prod-jack', minimo: 2 },
    ],
    estoque_movimentos: [
      { produto_id: 'prod-jack', bar_id: 'demo-bar', tipo: 'entrada', qtd: 3 },
      { produto_id: 'prod-henny', bar_id: 'demo-bar', tipo: 'entrada', qtd: 4 },
    ],
    pos_vendas: sales,
    pos_vendas_itens: sales.map((s, i) => ({ id: `seed-item-${i}`, pos_venda_id: s.id, nome: 'Gin Tonic', qtd: 1, preco_unitario: s.total })),
  }
}

export default function PosDemoPage() {
  const { t } = useI18n()
  const db = useMemo(() => createPosMemoryDb(demoPosSeed()), [])

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '24px 20px 48px' }}>
      <div style={{ maxWidth: 1120, margin: '0 auto' }}>
        <div className="pos-demo-banner">{t('atomicPos.demoBadge')} — {t('atomicPos.demoSeedHint')}</div>
        <AtomicPosPanel
          bar={DEMO_BAR}
          db={db}
          demo
          completeSale={(input) => completePosSale(db, input)}
        />
      </div>
    </div>
  )
}
