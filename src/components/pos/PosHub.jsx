/**
 * Hub do POS do bar — reúne os cinco módulos da plataforma:
 *   1. Caixa + faturamento por hora (painel)
 *   2. Estoque inteligente + reposição automática
 *   3. Staff, custos e salários
 *   4. Drink back (promoters / hostesses)
 *   5. Serviços de limpeza e manutenção
 *
 * O hub carrega os dados uma vez e distribui para as abas, para não
 * repetir round-trips no Supabase a cada troca de aba.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Spinner } from '../utils'
import { useAuth } from '../Auth'
import { useI18n } from '../../lib/i18n'
import { PosVipTab, PosDiscountTab } from '../AtomicPos'
import {
  businessDay,
  checkPosPlatform,
  loadDrinkBack,
  loadInventory,
  loadPosCatalog,
  loadPosConfig,
  loadPosSales,
  loadReorderRequests,
  loadServiceOrders,
  loadStaff,
  monthKey,
} from '../../lib/posData'
import { aggregateAgents } from '../../lib/drinkBack'
import { Banner, PosTabs } from './posUi'
import PosDashboard from './PosDashboard'
import PosCheckout from './PosCheckout'
import PosStockPanel from './PosStockPanel'
import PosRecipesPanel from './PosRecipesPanel'
import PosStaffPanel from './PosStaffPanel'
import PosDrinkBackPanel from './PosDrinkBackPanel'
import PosServicesPanel from './PosServicesPanel'
import PosConfigPanel from './PosConfigPanel'

function daysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

export default function PosHub({ bar }) {
  const { t } = useI18n()
  const { user } = useAuth()
  const [tab, setTab] = useState('painel')
  const [loading, setLoading] = useState(true)
  const [platform, setPlatform] = useState({ ready: true })
  const [error, setError] = useState('')
  const [data, setData] = useState(null)

  const mes = monthKey()

  const load = useCallback(async () => {
    if (!bar?.id) return
    setError('')
    try {
      const status = await checkPosPlatform()
      setPlatform(status)

      const config = await loadPosConfig(bar.id)
      const hoje = businessDay(new Date(), config.hora_abertura)

      const [catalog, inventory, reorderRequests, todaySales, weekSales, monthSales, staffData, drinkBack, serviceOrders] =
        await Promise.all([
          loadPosCatalog(bar.id),
          loadInventory(bar.id),
          loadReorderRequests(bar.id),
          loadPosSales(bar.id, { from: hoje, to: hoje }),
          loadPosSales(bar.id, { from: daysAgo(7), to: hoje }),
          loadPosSales(bar.id, { from: `${mes}-01`, to: hoje }),
          loadStaff(bar.id, mes),
          loadDrinkBack(bar.id, mes),
          loadServiceOrders(bar.id),
        ])

      setData({
        config,
        catalog,
        inventory,
        reorderRequests,
        todaySales,
        weekSales,
        monthSales,
        staffData,
        drinkBack,
        serviceOrders,
      })
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [bar?.id, mes])

  useEffect(() => { load() }, [load])

  const stockByProduto = useMemo(() => {
    const map = {}
    ;(data?.inventory?.rows || []).forEach(r => { map[r.id] = r.stock })
    return map
  }, [data])

  const agentTotals = useMemo(
    () => aggregateAgents(data?.drinkBack?.agents, data?.drinkBack?.comissoes, { mes, config: data?.config }),
    [data, mes]
  )

  const alertCount = useMemo(
    () => (data?.inventory?.rows || []).filter(r => r.status === 'critical' || r.status === 'low').length,
    [data]
  )
  const serviceAlertCount = useMemo(
    () => (data?.serviceOrders || []).filter(o => ['aberto', 'agendado', 'em_andamento'].includes(o.status)).length,
    [data]
  )

  if (loading) return <Spinner text={t('pos.loading')} />

  const tabs = [
    { id: 'painel', icon: '📊', label: t('pos.tabs.dashboard') },
    { id: 'caixa', icon: '🧾', label: t('pos.tabs.checkout') },
    { id: 'estoque', icon: '📦', label: t('pos.tabs.stock'), badge: alertCount },
    { id: 'receitas', icon: '🍹', label: t('pos.tabs.recipes') },
    { id: 'drinkback', icon: '⭐', label: t('pos.tabs.drinkBack') },
    { id: 'staff', icon: '👥', label: t('pos.tabs.staff') },
    { id: 'servicos', icon: '🧹', label: t('pos.tabs.services'), badge: serviceAlertCount },
    { id: 'vip', icon: '💎', label: t('pos.tabs.vip') },
    { id: 'codigos', icon: '🏷️', label: t('pos.tabs.codes') },
    { id: 'config', icon: '⚙️', label: t('pos.tabs.config') },
  ]

  return (
    <div className="fade-in portal-page">
      <div style={{ marginBottom: 20 }}>
        <div className="portal-page-title">{t('pos.title', { bar: bar.nome })}</div>
        <div className="portal-page-sub">{t('pos.subtitle')}</div>
      </div>

      {!platform.ready && (
        <Banner tone="amber" title={t('pos.setupTitle')}>
          {platform.error || t('pos.setupHint')}
        </Banner>
      )}

      {error && <Banner tone="red" title={t('pos.loadError')}>{error}</Banner>}

      <PosTabs options={tabs} value={tab} onChange={setTab} />

      {!data ? (
        <Banner tone="neutral">{t('pos.noData')}</Banner>
      ) : (
        <>
          {tab === 'painel' && (
            <PosDashboard
              config={data.config}
              todaySales={data.todaySales}
              weekSales={data.weekSales}
              inventoryRows={data.inventory.rows}
              agentTotals={agentTotals}
              serviceOrders={data.serviceOrders}
              onNav={setTab}
            />
          )}

          {tab === 'caixa' && (
            <PosCheckout
              bar={bar}
              catalog={data.catalog}
              config={data.config}
              stockByProduto={stockByProduto}
              userId={user?.id}
              onSale={load}
            />
          )}

          {tab === 'estoque' && (
            <PosStockPanel
              bar={bar}
              config={data.config}
              inventory={data.inventory}
              reorderRequests={data.reorderRequests}
              onRefresh={load}
            />
          )}

          {tab === 'receitas' && (
            <PosRecipesPanel catalog={data.catalog} inventory={data.inventory} onRefresh={load} />
          )}

          {tab === 'drinkback' && (
            <PosDrinkBackPanel
              bar={bar}
              config={data.config}
              drinkBack={data.drinkBack}
              mes={mes}
              onRefresh={load}
            />
          )}

          {tab === 'staff' && (
            <PosStaffPanel
              bar={bar}
              config={data.config}
              staffData={data.staffData}
              monthSales={data.monthSales}
              mes={mes}
              onRefresh={load}
            />
          )}

          {tab === 'servicos' && (
            <PosServicesPanel bar={bar} orders={data.serviceOrders} userId={user?.id} onRefresh={load} />
          )}

          {tab === 'vip' && <PosVipTab bar={bar} drinks={data.catalog.drinks} onUpdate={load} />}

          {tab === 'codigos' && <PosDiscountTab bar={bar} drinks={data.catalog.drinks} onUpdate={load} />}

          {tab === 'config' && <PosConfigPanel bar={bar} config={data.config} onRefresh={load} />}
        </>
      )}
    </div>
  )
}
