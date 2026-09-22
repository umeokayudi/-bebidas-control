import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './Auth'
import { fmtYen, Spinner } from './utils'
import { useI18n } from '../lib/i18n'
import { callGeminiChat, imageDataUrlToParts, parseJsonFromAI } from '../lib/ai'
import {
  normalizeSundry,
  parseSundryScan,
  sundryMonthRows,
  sundryNightRows,
  sundryPayload,
  sundryReady,
  sundryTotal,
} from '../lib/sundrySpend'
import { tokyoMonthKey, tokyoNightKey } from '../lib/tokyo'

async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = reject
    r.readAsDataURL(file)
  })
}

async function shrinkDataUrl(dataUrl, max = 1600) {
  if (!dataUrl || !dataUrl.startsWith('data:image')) return dataUrl
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height))
      if (scale >= 1) { resolve(dataUrl); return }
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', 0.82))
    }
    img.onerror = () => resolve(dataUrl)
    img.src = dataUrl
  })
}

export default function BarSundryTab({ bar, compact = false }) {
  const { t } = useI18n()
  const { user } = useAuth()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [amount, setAmount] = useState('')
  const [what, setWhat] = useState('')
  const [note, setNote] = useState('')
  const [image, setImage] = useState(null)
  const [scanning, setScanning] = useState(false)

  const month = tokyoMonthKey()
  const night = tokyoNightKey()

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('bar_sundry')
      .select('*')
      .eq('bar_id', bar.id)
      .order('spent_at', { ascending: false })
    if (error) setErr(error.message)
    setRows((data || []).map(r => normalizeSundry(r)))
    setLoading(false)
  }

  useEffect(() => { load() }, [bar.id])

  async function onPick(file) {
    if (!file) return
    setErr('')
    setMsg('')
    const raw = await fileToDataUrl(file)
    const dataUrl = await shrinkDataUrl(raw)
    setImage(dataUrl)
    setScanning(true)
    try {
      const imageParts = imageDataUrlToParts(dataUrl)
      const text = await callGeminiChat({
        messages: [{
          role: 'user',
          content: 'Store receipt / レシート. Extract yen total and what was bought. Reply ONLY JSON: {"amount":number,"what":string,"date":"YYYY-MM-DD"}',
        }],
        image: imageParts,
        temperature: 0.1,
        maxOutputTokens: 256,
      })
      if (String(text).startsWith('Error:')) throw new Error(text.replace(/^Error:\s*/, ''))
      const parsed = parseSundryScan(parseJsonFromAI(text))
      if (parsed.amount) setAmount(String(parsed.amount))
      if (parsed.what) setWhat(parsed.what)
      setMsg(t('sundry.scanned'))
    } catch {
      setMsg(t('sundry.scanFail'))
    }
    setScanning(false)
  }

  async function uploadPhoto() {
    if (!image) return null
    const blob = await fetch(image).then(r => r.blob())
    const filename = `sundry/${bar.id}/${Date.now()}.jpg`
    const { data: up, error } = await supabase.storage.from('recibos').upload(filename, blob, { contentType: 'image/jpeg' })
    if (error || !up) return null
    const { data: urlD } = supabase.storage.from('recibos').getPublicUrl(filename)
    return urlD?.publicUrl || null
  }

  async function save() {
    const draft = { amount, what, note }
    if (!sundryReady(draft)) {
      setErr(t('sundry.needBoth'))
      return
    }
    setBusy(true)
    setErr('')
    setMsg('')
    try {
      const photo_url = await uploadPhoto()
      const payload = sundryPayload({
        bar_id: bar.id,
        amount,
        what,
        note,
        photo_url,
        criado_por: user?.id || null,
      })
      const { error } = await supabase.from('bar_sundry').insert(payload)
      if (error) throw error
      setAmount('')
      setWhat('')
      setNote('')
      setImage(null)
      setMsg(t('sundry.saved'))
      await load()
    } catch (e) {
      setErr(e.message)
    }
    setBusy(false)
  }

  async function remove(id) {
    if (!id) return
    setBusy(true)
    await supabase.from('bar_sundry').delete().eq('id', id)
    await load()
    setBusy(false)
  }

  const monthRows = sundryMonthRows(rows, month)
  const nightRows = sundryNightRows(rows, night)
  const list = compact ? monthRows.slice(0, 4) : monthRows

  return (
    <div className={`fade-in portal-page sundry-page${compact ? ' is-compact' : ''}`}>
      {!compact && (
        <>
          <div className="hq-title">{t('sundry.title')}</div>
          <div className="hq-sub">{t('sundry.subtitle')}</div>
        </>
      )}
      {compact && <div className="hq-panel-title">{t('sundry.title')}</div>}
      <div className="hq-panel-hint">{t('sundry.hint')}</div>

      <div className="hq-kpis sundry-kpis">
        <div><b>{fmtYen(sundryTotal(monthRows))}</b><span>{t('sundry.monthTotal')}</span></div>
        <div><b>{fmtYen(sundryTotal(nightRows))}</b><span>{t('sundry.nightTotal')}</span></div>
        <div><b>{monthRows.length}</b><span>{t('sundry.receipts')}</span></div>
      </div>

      <div className="sundry-form hq-panel">
        <div className="hq-panel-title">{t('sundry.add')}</div>
        <label className="sundry-shot">
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={e => onPick(e.target.files?.[0])}
          />
          {image ? (
            <img src={image} alt="" className="sundry-preview" />
          ) : (
            <span>{scanning ? t('sundry.scanning') : t('sundry.takePhoto')}</span>
          )}
        </label>
        <div className="hq-rent-row">
          <label>{t('sundry.amount')}<input type="number" min="0" step="1" value={amount} onChange={e => setAmount(e.target.value)} /></label>
          <label>{t('sundry.what')}<input value={what} onChange={e => setWhat(e.target.value)} placeholder={t('sundry.whatPh')} /></label>
        </div>
        <label>{t('common.notes')}<input value={note} onChange={e => setNote(e.target.value)} /></label>
        <button type="button" className="btn-primary" data-sundry-save disabled={busy || scanning} onClick={save}>
          {busy ? t('common.saving') : t('sundry.save')}
        </button>
        {msg && <div className="sundry-msg">{msg}</div>}
        {err && <div className="sundry-err">{err}</div>}
      </div>

      {loading && <Spinner />}
      {!loading && !list.length && <div className="hq-empty">{t('sundry.empty')}</div>}
      <div className="sundry-list">
        {list.map(r => (
          <div key={r.id} className="sundry-row">
            {r.photo_url && <img src={r.photo_url} alt="" className="sundry-thumb" />}
            <div className="sundry-body">
              <strong>{r.what || '—'}</strong>
              <div className="sundry-meta">{r.night_key} · {r.note || t('sundry.noNote')}</div>
            </div>
            <div className="sundry-yen">{fmtYen(r.amount)}</div>
            {!compact && (
              <button type="button" className="hq-chip" disabled={busy} onClick={() => remove(r.id)}>{t('common.delete')}</button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
