import { useState } from 'react'
import { fmtYen } from '../utils'
import { useI18n } from '../../lib/i18n'

export default function PosDrinkBackTab({ agents, usages, onAdd, saving }) {
  const { t } = useI18n()
  const [form, setForm] = useState({ nome: '', codigo: '', regiao: '', comissao_pct: '10' })
  const today = usages.reduce((a, u) => a + (+u.comissao || 0), 0)

  return (
    <div className="pos-drinkback">
      <div className="pos-kpi-row">
        <div className="pos-kpi"><span>{t('atomicPos.members')}</span><strong>{agents.filter(a => a.ativo !== false).length}</strong></div>
        <div className="pos-kpi"><span>{t('atomicPos.commissionToday')}</span><strong>{fmtYen(today)}</strong></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }} className="pos-split">
        <div className="card">
          <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>{t('atomicPos.drinkBackTitle')}</div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 12 }}>{t('atomicPos.drinkBackSub')}</div>
          <input placeholder={t('atomicPos.nameRequired').replace(' required', '').replace('必須', '')} value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} style={{ width: '100%', marginBottom: 8 }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <input placeholder="Code" value={form.codigo} onChange={e => setForm({ ...form, codigo: e.target.value })} />
            <input placeholder={t('atomicPos.region')} value={form.regiao} onChange={e => setForm({ ...form, regiao: e.target.value })} />
          </div>
          <input type="number" min="0" max="50" placeholder={t('atomicPos.commissionPct')} value={form.comissao_pct} onChange={e => setForm({ ...form, comissao_pct: e.target.value })} style={{ width: '100%', marginBottom: 12 }} />
          <button className="btn-primary" disabled={saving} onClick={() => {
            if (!form.nome.trim()) return
            onAdd({ ...form, comissao_pct: +form.comissao_pct || 10 })
            setForm({ nome: '', codigo: '', regiao: '', comissao_pct: '10' })
          }} style={{ width: '100%', padding: 12 }}>{t('atomicPos.addAgent')}</button>
        </div>
        <div>
          {agents.map(a => (
            <div key={a.id} className="card" style={{ marginBottom: 8, padding: 14, opacity: a.ativo === false ? 0.5 : 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 800 }}>{a.nome}</div>
                  <div style={{ fontSize: 12, color: 'var(--text2)' }}>
                    {[a.codigo, a.regiao, `${a.comissao_pct || 0}%`].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <div style={{ fontWeight: 800, color: 'var(--gold)' }}>
                  {fmtYen(usages.filter(u => u.drink_back_agent_id === a.id).reduce((s, u) => s + (+u.comissao || 0), 0))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
