import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './Auth'
import { Spinner, SectionTitle } from './utils'
import { useI18n } from '../lib/i18n'
import {
  SPACE_TYPES,
  tokyoFloorPreset,
  decorateSpaces,
  spacesByZone,
  checkCrmSchema,
  zoneLabelKey,
  visitMinutes,
  formatVisitDuration,
} from '../lib/barCrm'

function typeLabel(t, tipo) {
  const row = SPACE_TYPES.find(x => x.id === tipo)
  return row ? t(row.labelKey) : tipo
}

function zoneTitle(t, zona) {
  const key = zoneLabelKey(zona)
  return key ? t(key) : zona
}

export default function BarSpacesTab({ bar }) {
  const { t } = useI18n()
  const { user } = useAuth()
  const [ready, setReady] = useState(null)
  const [spaces, setSpaces] = useState([])
  const [visits, setVisits] = useState([])
  const [guests, setGuests] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ nome: '', tipo: 'counter', capacidade: 1, zona: 'counter', notas: '' })
  const [seat, setSeat] = useState(null)
  const [guestId, setGuestId] = useState('')
  const [party, setParty] = useState(1)
  const [hostNome, setHostNome] = useState('')
  const [seatMode, setSeatMode] = useState('seated')
  const [, setTick] = useState(0)

  async function load() {
    const schema = await checkCrmSchema(supabase)
    setReady(schema)
    if (!schema.ready) { setLoading(false); return }
    const [sR, vR, gR] = await Promise.all([
      supabase.from('bar_spaces').select('*').eq('bar_id', bar.id).order('ordem'),
      supabase.from('bar_visits').select('*, bar_guests(nome)').eq('bar_id', bar.id).in('status', ['reserved', 'seated']).order('inicio', { ascending: false }),
      supabase.from('bar_guests').select('id,nome,telefone,line_id,preferred_host').eq('bar_id', bar.id).eq('ativo', true).order('nome'),
    ])
    setSpaces(sR.data || [])
    setVisits(vR.data || [])
    setGuests(gR.data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [bar.id])
  useEffect(() => {
    const id = setInterval(() => setTick(n => n + 1), 60000)
    return () => clearInterval(id)
  }, [])

  const floor = decorateSpaces(spaces, visits)
  const zones = spacesByZone(floor)
  const seated = floor.filter(s => s.occupied).length
  const reserved = floor.filter(s => s.reserved).length
  const free = floor.filter(s => !s.occupied && !s.reserved).length

  async function addSpace() {
    if (!form.nome.trim()) return
    setSaving(true)
    await supabase.from('bar_spaces').insert({
      bar_id: bar.id,
      nome: form.nome.trim(),
      tipo: form.tipo,
      capacidade: +form.capacidade || 1,
      zona: form.zona || form.tipo,
      ordem: spaces.length + 1,
      notas: form.notas || null,
    })
    setForm({ nome: '', tipo: 'counter', capacidade: 1, zona: 'counter', notas: '' })
    setSaving(false)
    load()
  }

  async function seedTokyoFloor() {
    if (spaces.length) return alert(t('spaces.alreadyHasSpaces'))
    setSaving(true)
    await supabase.from('bar_spaces').insert(
      tokyoFloorPreset().map(s => ({ ...s, bar_id: bar.id }))
    )
    setSaving(false)
    load()
  }

  async function confirmVisit() {
    if (!seat) return
    setSaving(true)
    await supabase.from('bar_visits').insert({
      bar_id: bar.id,
      space_id: seat.id,
      guest_id: guestId || null,
      status: seatMode,
      party_size: +party || 1,
      host_nome: hostNome || null,
      criado_por: user?.id,
    })
    setSeat(null)
    setGuestId('')
    setParty(1)
    setHostNome('')
    setSeatMode('seated')
    setSaving(false)
    load()
  }

  async function freeSpace(space) {
    const visit = space.visit
    if (!visit) return
    await supabase.from('bar_visits').update({ status: 'done', fim: new Date().toISOString() }).eq('id', visit.id)
    load()
  }

  function openSeat(space, mode) {
    const g = guests.find(x => x.id === guestId)
    setSeat(space)
    setSeatMode(mode)
    setParty(space.capacidade || 1)
    setHostNome(g?.preferred_host || '')
  }

  if (loading) return <Spinner text={t('spaces.loading')} />
  if (!ready?.ready) {
    return (
      <div className="card" style={{ padding: 20 }}>
        <SectionTitle>{t('spaces.title')}</SectionTitle>
        <p style={{ fontSize: 13, color: 'var(--text2)' }}>{t('spaces.setupHint')}</p>
      </div>
    )
  }

  return (
    <div className="fade-in">
      <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>{t('spaces.title')}</div>
      <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>{t('spaces.subtitle')}</div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 16 }}>
        {[
          { label: t('spaces.total'), value: floor.length },
          { label: t('spaces.seated'), value: seated, color: 'var(--navy)' },
          { label: t('spaces.reserved'), value: reserved, color: 'var(--gold, #b8860b)' },
          { label: t('spaces.free'), value: free, color: 'var(--green)' },
        ].map(k => (
          <div key={k.label} className="card" style={{ padding: 14, textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: k.color }}>{k.value}</div>
            <div style={{ fontSize: 11, color: 'var(--text2)', textTransform: 'uppercase' }}>{k.label}</div>
          </div>
        ))}
      </div>

      {!spaces.length && (
        <div className="card" style={{ marginBottom: 16, padding: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>{t('spaces.seedTitle')}</div>
          <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 10 }}>{t('spaces.seedHint')}</div>
          <button className="btn-primary" disabled={saving} onClick={seedTokyoFloor}>{t('spaces.seedBtn')}</button>
        </div>
      )}

      {zones.map(z => (
        <div key={z.zona} style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
            {zoneTitle(t, z.zona)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8 }}>
            {z.spaces.map(s => (
              <div key={s.id} className="card" style={{
                padding: 12,
                borderColor: s.occupied ? 'var(--navy)' : s.reserved ? 'var(--gold, #b8860b)' : 'var(--border)',
                background: s.occupied ? 'rgba(26,78,138,0.06)' : 'var(--bg2)',
              }}>
                <div style={{ fontWeight: 800, fontSize: 14 }}>{s.nome}</div>
                <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 8 }}>
                  {typeLabel(t, s.tipo)} · {t('spaces.seats', { count: s.capacidade })}
                </div>
                {s.visit ? (
                  <>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>
                      {s.visit.bar_guests?.nome || t('spaces.walkIn')}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 8 }}>
                      {s.visit.status === 'reserved' ? t('spaces.reserved') : t('spaces.duration', { time: formatVisitDuration(visitMinutes(s.visit)) })}
                      {s.visit.party_size ? ` · ${s.visit.party_size}` : ''}
                      {s.visit.host_nome ? ` · ${s.visit.host_nome}` : ''}
                    </div>
                    <button onClick={() => freeSpace(s)} style={{ width: '100%', padding: 8, borderRadius: 8, border: 'none', background: 'var(--bg3)', fontWeight: 700, cursor: 'pointer' }}>
                      {t('spaces.freeBtn')}
                    </button>
                  </>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    <button className="btn-primary" onClick={() => openSeat(s, 'seated')} style={{ padding: 8 }}>
                      {t('spaces.seatBtn')}
                    </button>
                    <button onClick={() => openSeat(s, 'reserved')} style={{ padding: 8, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', fontWeight: 700, cursor: 'pointer' }}>
                      {t('spaces.reserveBtn')}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="card" style={{ maxWidth: 480, marginTop: 8 }}>
        <SectionTitle>{t('spaces.addSpace')}</SectionTitle>
        <input placeholder={t('spaces.namePlaceholder')} value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} style={{ width: '100%', marginBottom: 8 }} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <select value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value, zona: e.target.value === 'vip_room' ? 'vip' : e.target.value })}>
            {SPACE_TYPES.map(x => <option key={x.id} value={x.id}>{t(x.labelKey)}</option>)}
          </select>
          <input type="number" min="1" value={form.capacidade} onChange={e => setForm({ ...form, capacidade: e.target.value })} />
        </div>
        <button className="btn-primary" disabled={saving} onClick={addSpace} style={{ width: '100%', padding: 10 }}>{t('spaces.saveSpace')}</button>
      </div>

      {seat && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={() => setSeat(null)}>
          <div className="card" style={{ width: '100%', maxWidth: 380 }} onClick={e => e.stopPropagation()}>
            <SectionTitle>{seatMode === 'reserved' ? t('spaces.reserveAt', { name: seat.nome }) : t('spaces.seatAt', { name: seat.nome })}</SectionTitle>
            <label className="form-label">{t('spaces.guestOptional')}</label>
            <select
              value={guestId}
              onChange={e => {
                const id = e.target.value
                setGuestId(id)
                const g = guests.find(x => x.id === id)
                if (g?.preferred_host) setHostNome(g.preferred_host)
              }}
              style={{ width: '100%', marginBottom: 10 }}
            >
              <option value="">{t('spaces.walkIn')}</option>
              {guests.map(g => <option key={g.id} value={g.id}>{g.nome}{g.line_id ? ` · LINE ${g.line_id}` : ''}</option>)}
            </select>
            <label className="form-label">{t('spaces.hostOptional')}</label>
            <input value={hostNome} onChange={e => setHostNome(e.target.value)} placeholder={t('spaces.hostPlaceholder')} style={{ width: '100%', marginBottom: 10 }} />
            <label className="form-label">{t('spaces.partySize')}</label>
            <input type="number" min="1" value={party} onChange={e => setParty(e.target.value)} style={{ width: '100%', marginBottom: 12 }} />
            <button className="btn-primary" disabled={saving} onClick={confirmVisit} style={{ width: '100%', padding: 12, marginBottom: 8 }}>
              {seatMode === 'reserved' ? t('spaces.confirmReserve') : t('spaces.confirmSeat')}
            </button>
            <button onClick={() => setSeat(null)} style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid var(--border)', background: 'transparent' }}>{t('common.cancel')}</button>
          </div>
        </div>
      )}
    </div>
  )
}
