import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import AtomicPosPanel from './AtomicPos'
import { Spinner } from './utils'
import { useI18n } from '../lib/i18n'

export default function AdminPosTab() {
  const { t } = useI18n()
  const [bars, setBars] = useState([])
  const [selectedBarId, setSelectedBarId] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadBars()
  }, [])

  async function loadBars() {
    setLoading(true)
    const { data } = await supabase.from('bars').select('*').order('nome')
    const list = data || []
    setBars(list)
    if (list.length > 0) {
      setSelectedBarId(list[0].id)
    }
    setLoading(false)
  }

  const selectedBar = bars.find(b => b.id === selectedBarId)

  if (loading) return <Spinner text="Carregando bares..." />

  return (
    <div className="fade-in portal-page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 800 }}>⚡ Bar POS & Gestão Operacional</h2>
          <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 4 }}>
            Operação de balcão do bar, horários de pico, promoters de drink back e staff (100% isolado da distribuidora JBM)
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--text2)' }}>Bar:</label>
          <select
            value={selectedBarId}
            onChange={e => setSelectedBarId(e.target.value)}
            style={{ padding: '8px 14px', borderRadius: 10, minWidth: 200, fontWeight: 600 }}
          >
            {bars.map(b => (
              <option key={b.id} value={b.id}>{b.nome}</option>
            ))}
          </select>
        </div>
      </div>

      {selectedBar ? (
        <AtomicPosPanel bar={selectedBar} />
      ) : (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Nenhum bar encontrado.</div>
      )}
    </div>
  )
}
