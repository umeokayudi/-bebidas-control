import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useI18n } from '../../lib/i18n'
import { fmtYen, Spinner, isSupplierProduct } from '../utils'
import { PortalAlert, PortalPills } from '../ui/PageLayout'
import { businessDateKey, checkPosSchema, loadPosConfig } from '../../lib/posEngine'
import PosDashboard from './PosDashboard'
import PosCheckout from './PosCheckout'
import PosHourly from './PosHourly'
import PosStock from './PosStock'
import PosStaff from './PosStaff'
import PosDrinkBack from './PosDrinkBack'
import PosServices from './PosServices'
import PosVip from './PosVip'
import PosPrices from './PosPrices'
import PosDiscounts from './PosDiscounts'

const TABS = [
  { id: 'dashboard', key: 'tabDashboard', icon: '📊' },
  { id: 'checkout', key: 'tabCheckout', icon: '🧾' },
  { id: 'hours', key: 'tabHours', icon: '⏰' },
  { id: 'stock', key: 'tabStock', icon: '📦' },
  { id: 'staff', key: 'tabStaff', icon: '👥' },
  { id: 'drinkback', key: 'tabDrinkBack', icon: '💃' },
  { id: 'services', key: 'tabServices', icon: '🧹' },
  { id: 'vip', key: 'tabVip', icon: '⭐' },
  { id: 'prices', key: 'tabPrices', icon: '💴' },
  { id: 'discounts', key: 'tabDiscounts', icon: '🏷️' },
]

/**
 * Painel do POS do bar. Recebe o `bar` (cliente: o próprio bar; admin: bar
 * selecionado). Tudo aqui usa tabelas do bar — separado do fornecedor JBM.
 */
export default function BarPos({ bar, initialTab = 'dashboard' }) {
  const { t } = useI18n()
  const [tab, setTab] = useState(initialTab)
  const [loading, setLoading] = useState(true)
  const [schema, setSchema] = useState({ ready: true })
  const [data, setData] = useState(null)

  const load = useCallback(async () => {
    if (!bar?.id) return
    setLoading(true)
    const sc = await checkPosSchema(supabase)
    setSchema(sc)
    if (!sc.ready) { setLoading(false); return }

    const config = await loadPosConfig(supabase, bar.id)
    const today = businessDateKey(new Date(), config)
    const [dR, sR, iR, pR, stR, agR, vR, cR, tR] = await Promise.all([
      supabase.from('drink_menu').select('*').eq('bar_id', bar.id).order('categoria').order('nome'),
      supabase.from('bar_pricing').select('*, produtos(id,nome,categoria,preco_venda,volume_ml)').eq('bar_id', bar.id),
      supabase.from('drink_menu_ingredientes').select('id, drink_menu_id, produto_id, ml'),
      supabase.from('produtos_public').select('*').eq('ativo', true).order('categoria').order('nome'),
      supabase.from('bar_staff').select('*').eq('bar_id', bar.id).order('nome'),
      supabase.from('drink_back_agents').select('*').eq('bar_id', bar.id).order('nome'),
      supabase.from('vip_members').select('*').eq('bar_id', bar.id).order('nome'),
      supabase.from('discount_codes').select('*').eq('bar_id', bar.id).order('criado_em', { ascending: false }),
      supabase.from('pos_vendas').select('id, total, custo_total, criado_em, data, comissao_drink_back, drink_back_agent_id, staff_id').eq('bar_id', bar.id).eq('data', today),
    ])

    const drinks = dR.data || []
    const drinkIds = new Set(drinks.map(d => d.id))
    const ingredientesByDrink = {}
    for (const ing of iR.data || []) {
      if (!drinkIds.has(ing.drink_menu_id)) continue
      ;(ingredientesByDrink[ing.drink_menu_id] ||= []).push(ing)
    }
    const produtos = (pR.data || []).filter(isSupplierProduct)
    const produtosById = {}
    for (const p of pR.data || []) produtosById[p.id] = p
    const pricingByProd = {}
    for (const s of sR.data || []) pricingByProd[s.produto_id] = s

    setData({
      config,
      today,
      drinks,
      shots: sR.data || [],
      ingredientesByDrink,
      produtos,
      produtosById,
      pricingByProd,
      staff: stR.data || [],
      agents: agR.data || [],
      vipMembers: vR.data || [],
      discountCodes: cR.data || [],
      todaySales: tR.data || [],
    })
    setLoading(false)
  }, [bar?.id])

  useEffect(() => { load() }, [load])

  const todayTotal = useMemo(() => (data?.todaySales || []).reduce((a, s) => a + (+s.total || 0), 0), [data])

  if (!bar) return null
  if (loading && !data) return <Spinner text={t('pos.loading')} />

  if (!schema.ready) {
    return (
      <div className="fade-in" style={{ maxWidth: 720 }}>
        <PortalAlert variant="amber">
          <div style={{ fontWeight: 700, marginBottom: 6 }}>{t('pos.setupRequired')}</div>
          <div style={{ fontSize: 13, lineHeight: 1.6 }}>{t('pos.setupHint')}</div>
          {schema.error && schema.error !== 'missingTables' && <div style={{ fontSize: 12, marginTop: 8, opacity: 0.8 }}>{schema.error}</div>}
          <button className="btn-primary" onClick={load} style={{ marginTop: 12, padding: '8px 16px', borderRadius: 10 }}>{t('pos.checkAgain')}</button>
        </PortalAlert>
      </div>
    )
  }

  const common = { bar, data, reload: load, onTab: setTab }

  return (
    <div className="fade-in pos-panel" style={{ maxWidth: 1100 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div className="portal-page-title">{t('pos.title', { bar: bar.nome })}</div>
          <div className="portal-page-sub">{t('pos.subtitle')}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: 'var(--text2)', textTransform: 'uppercase' }}>{t('pos.today')} · {data.today}</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--green)' }}>{fmtYen(todayTotal)}</div>
          <div style={{ fontSize: 11, color: 'var(--text2)' }}>{t('pos.salesCount', { count: data.todaySales.length })}</div>
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <PortalPills
          scrollable
          value={tab}
          onChange={setTab}
          options={TABS.map(tb => [tb.id, `${tb.icon} ${t(`pos.${tb.key}`)}`])}
        />
      </div>

      {tab === 'dashboard' && <PosDashboard {...common} />}
      {tab === 'checkout' && <PosCheckout {...common} />}
      {tab === 'hours' && <PosHourly {...common} />}
      {tab === 'stock' && <PosStock {...common} />}
      {tab === 'staff' && <PosStaff {...common} />}
      {tab === 'drinkback' && <PosDrinkBack {...common} />}
      {tab === 'services' && <PosServices {...common} />}
      {tab === 'vip' && <PosVip {...common} />}
      {tab === 'prices' && <PosPrices {...common} />}
      {tab === 'discounts' && <PosDiscounts {...common} />}
    </div>
  )
}

/** Versão admin: escolhe o bar antes de abrir o POS. */
export function BarPosAdmin() {
  const { t } = useI18n()
  const [bars, setBars] = useState([])
  const [barId, setBarId] = useState(() => { try { return sessionStorage.getItem('posBarId') || '' } catch { return '' } })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('bars').select('*').order('nome').then(({ data }) => {
      const list = data || []
      setBars(list)
      if (!barId && list.length) setBarId(list[0].id)
      setLoading(false)
    })
  }, [])

  useEffect(() => { try { if (barId) sessionStorage.setItem('posBarId', barId) } catch {} }, [barId])

  const bar = bars.find(b => b.id === barId)
  if (loading) return <Spinner />

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)' }}>{t('pos.selectBar')}</span>
        <select value={barId} onChange={e => setBarId(e.target.value)} style={{ width: 'auto', minWidth: 200 }}>
          {bars.map(b => <option key={b.id} value={b.id}>{b.nome}</option>)}
        </select>
      </div>
      {bar ? <BarPos key={bar.id} bar={bar} /> : <div style={{ color: 'var(--text2)', fontSize: 13 }}>{t('pos.noBars')}</div>}
    </div>
  )
}
