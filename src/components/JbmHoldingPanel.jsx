import { useState, useEffect } from 'react'
import { fmtYen, Spinner } from './utils'
import {
  DEFAULT_HOLDING,
  loadHoldingLocal,
  saveHoldingLocal,
  syncHoldingFromCloud,
  syncHoldingToCloud,
} from '../lib/jbmHolding'

export default function JbmHoldingPanel() {
  const [profile, setProfile] = useState(DEFAULT_HOLDING)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    syncHoldingFromCloud()
      .then(setProfile)
      .catch(() => setProfile(loadHoldingLocal()))
      .finally(() => setLoading(false))
  }, [])

  function updateNegocio(i, patch) {
    setProfile(p => {
      const negocios = [...p.negocios]
      negocios[i] = { ...negocios[i], ...patch }
      return { ...p, negocios }
    })
  }

  function addNegocio() {
    setProfile(p => ({
      ...p,
      negocios: [
        ...p.negocios,
        {
          id: 'neg-' + Date.now(),
          nome: 'Novo negócio',
          tipo: 'servicos',
          custoOportunidadePct: 35,
          prioridade: 'media',
          notas: '',
        },
      ],
    }))
  }

  async function save() {
    setSaving(true)
    setMsg('')
    try {
      await syncHoldingToCloud(profile)
      setMsg('✅ JBM Holding sincronizada — a IA usa isso nas compras')
    } catch (e) {
      saveHoldingLocal(profile)
      setMsg('⚠️ Salvo localmente. Nuvem: ' + e.message)
    }
    setSaving(false)
  }

  if (loading) return <Spinner text="Carregando JBM Holding..." />

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 18, fontWeight: 800 }}>JBM Holding</div>
        <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 4, lineHeight: 1.5 }}>
          Capital compartilhado entre JBM Drinks e seus outros negócios. A IA usa este perfil para calcular
          <strong> custo de oportunidade real </strong> — não só 12% de juros, mas o que você deixa de fazer
          (ex.: contratar gente em outro negócio).
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label className="form-label">Custo de oportunidade base (%/ano)</label>
            <input
              type="number"
              value={profile.custoOportunidadeBasePct}
              onChange={e => setProfile(p => ({ ...p, custoOportunidadeBasePct: +e.target.value }))}
            />
            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4 }}>Mínimo da holding — na prática usa o maior entre negócios</div>
          </div>
          <div>
            <label className="form-label">Capital disponível (¥)</label>
            <input
              type="number"
              value={profile.capitalDisponivel || 0}
              onChange={e => setProfile(p => ({ ...p, capitalDisponivel: +e.target.value }))}
            />
          </div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label className="form-label">Regra de alocação de capital</label>
          <textarea
            value={profile.regraCapital || ''}
            onChange={e => setProfile(p => ({ ...p, regraCapital: e.target.value }))}
            rows={3}
            style={{ width: '100%', padding: 10, borderRadius: 10, fontSize: 13, resize: 'vertical' }}
            placeholder="Ex.: Se capital apertado, priorizar contratação no outro negócio antes de estoque à vista em bebidas."
          />
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Negócios da holding</div>
        <button type="button" onClick={addNegocio} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: 'var(--bg3)', cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>
          + Negócio
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
        {profile.negocios.map((n, i) => (
          <div key={n.id} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 10, marginBottom: 8 }}>
              <div>
                <label className="form-label">Nome</label>
                <input value={n.nome} onChange={e => updateNegocio(i, { nome: e.target.value })} />
              </div>
              <div>
                <label className="form-label">Tipo</label>
                <select value={n.tipo} onChange={e => updateNegocio(i, { tipo: e.target.value })}>
                  <option value="bebidas">Bebidas</option>
                  <option value="servicos">Serviços</option>
                  <option value="imobiliario">Imobiliário</option>
                  <option value="outro">Outro</option>
                </select>
              </div>
              <div>
                <label className="form-label">Custo oport. %/ano</label>
                <input type="number" value={n.custoOportunidadePct} onChange={e => updateNegocio(i, { custoOportunidadePct: +e.target.value })} />
              </div>
              <div>
                <label className="form-label">Prioridade</label>
                <select value={n.prioridade} onChange={e => updateNegocio(i, { prioridade: e.target.value })}>
                  <option value="alta">Alta</option>
                  <option value="media">Média</option>
                  <option value="baixa">Baixa</option>
                </select>
              </div>
            </div>
            <input
              value={n.notas || ''}
              onChange={e => updateNegocio(i, { notas: e.target.value })}
              placeholder="Notas — ex.: contratar 2 pessoas, expandir loja..."
              style={{ width: '100%', fontSize: 12 }}
            />
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button type="button" className="btn-primary" onClick={save} disabled={saving}>
          {saving ? 'Sincronizando...' : '💾 Salvar e sincronizar com IA'}
        </button>
        {msg && <span style={{ fontSize: 12, color: 'var(--text2)' }}>{msg}</span>}
      </div>

      <div style={{ marginTop: 20, padding: 14, background: '#eff6ff', borderRadius: 12, fontSize: 12, lineHeight: 1.6, border: '1px solid #93c5fd' }}>
        <strong>Como a IA usa isso:</strong> ao comprar bebidas à vista, ela calcula quanto esse dinheiro “custaria” se fosse para outro negócio da holding
        (ex. 45%/ano para contratar). Se o desconto à vista for menor que esse custo, recomenda <strong>pagar a prazo</strong> mesmo que o fornecedor cobre um pouco mais.
      </div>
    </div>
  )
}
