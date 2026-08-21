import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { imageDataUrlToParts } from '../lib/ai'
import { analyzeSeikyusho, registerSeikyusho, calcLucroPreview } from '../lib/seikyusho'
import { fmtYen, fmtDate, Spinner, SectionTitle, MetricCard } from './utils'

export default function SeikyushoTab() {
  const [image, setImage] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [extracted, setExtracted] = useState(null)
  const [result, setResult] = useState(null)
  const [context, setContext] = useState('')
  const [catalog, setCatalog] = useState([])

  useEffect(() => {
    loadContext()
  }, [])

  async function loadContext() {
    const [{ data: bars }, { data: forn }, { data: prods }] = await Promise.all([
      supabase.from('bars').select('nome').order('nome'),
      supabase.from('fornecedores').select('nome').order('nome'),
      supabase.from('produtos').select('nome,categoria,preco_venda,custo').eq('ativo', true).order('nome').limit(40),
    ])
    setContext([
      `Bares: ${(bars || []).map(b => b.nome).join(', ')}`,
      `Fornecedores: ${(forn || []).map(f => f.nome).join(', ')}`,
      `Produtos (amostra): ${(prods || []).map(p => p.nome).join(', ')}`,
      'Entrega direta ao bar: pedidos do cliente serão marcados entregue com data do pedido.',
    ].join('\n'))
    setCatalog(prods || [])
  }

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      setImage(ev.target.result)
      setExtracted(null)
      setResult(null)
    }
    reader.readAsDataURL(file)
  }

  async function scan() {
    if (!image) return
    setLoading(true)
    setExtracted(null)
    setResult(null)
    try {
      const imageParts = imageDataUrlToParts(image)
      const data = await analyzeSeikyusho({ image: imageParts, contextText: context })
      setExtracted(data)
    } catch (e) {
      alert(e.message || 'Erro ao analisar fatura')
    } finally {
      setLoading(false)
    }
  }

  async function save() {
    if (!extracted) return
    setSaving(true)
    try {
      const data = await registerSeikyusho({ extracted })
      setResult(data)
    } catch (e) {
      alert(e.message || 'Erro ao registrar')
    } finally {
      setSaving(false)
    }
  }

  const lucro = extracted ? calcLucroPreview(extracted, catalog) : null

  return (
    <div className="fade-in">
      <SectionTitle>請求書 — Fatura de Fornecedor (IA Gemini)</SectionTitle>
      <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 20 }}>
        Envie a 請求書 do fornecedor (custo JBM). A IA registra a compra, atualiza preços do fornecedor,
        sincroniza pedidos do cliente como entregues (com data do pedido) e calcula lucro = venda ao bar − custo JBM.
      </p>

      <div
        className="card"
        style={{ border: '2px dashed var(--border)', textAlign: 'center', padding: 32, marginBottom: 16, cursor: 'pointer' }}
        onClick={() => document.getElementById('seikyusho-input')?.click()}
      >
        {image ? (
          <img src={image} alt="seikyusho" style={{ maxHeight: 360, maxWidth: '100%', borderRadius: 8 }} />
        ) : (
          <div>
            <div style={{ fontSize: 48, marginBottom: 8 }}>📄</div>
            <div style={{ fontWeight: 600 }}>Clique para selecionar 請求書</div>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>JPG, PNG ou PDF escaneado</div>
          </div>
        )}
        <input id="seikyusho-input" type="file" accept="image/*,.pdf" style={{ display: 'none' }} onChange={handleFile} />
      </div>

      {image && !extracted && !loading && (
        <button className="btn-primary" onClick={scan} style={{ width: '100%', padding: 12, borderRadius: 12, marginBottom: 16 }}>
          🤖 Analisar com Gemini
        </button>
      )}

      {loading && (
        <div style={{ textAlign: 'center', padding: 24 }}>
          <Spinner /> <span style={{ marginLeft: 8, color: 'var(--text2)' }}>Lendo 請求書...</span>
        </div>
      )}

      {extracted && !result && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>✅ Dados extraídos — revise antes de salvar</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <Field label="Fornecedor" value={extracted.fornecedor} />
            <Field label="Nº fatura" value={extracted.numero_fatura} />
            <Field label="Data" value={extracted.data ? fmtDate(extracted.data) : '—'} />
            <Field label="Vencimento" value={extracted.data_vencimento ? fmtDate(extracted.data_vencimento) : '—'} />
            <Field label="Período" value={
              extracted.periodo_inicio && extracted.periodo_fim
                ? `${fmtDate(extracted.periodo_inicio)} – ${fmtDate(extracted.periodo_fim)}`
                : '—'
            } />
            <Field label="Cliente" value={extracted.cliente_bar || 'Atomic'} />
            <Field label="Total" value={fmtYen(extracted.total)} highlight />
          </div>

          {extracted.entrega_direta !== false && (
            <div style={{ fontSize: 12, color: 'var(--blue)', marginBottom: 12, padding: '10px 12px', background: 'var(--blue-bg)', borderRadius: 8 }}>
              📦 Entrega direta — pedidos do cliente serão marcados <strong>entregue</strong> com data do pedido e preço ao bar.
            </div>
          )}

          {lucro && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 16 }}>
              <MetricCard label="Custo JBM" value={fmtYen(lucro.custo)} color="red" />
              <MetricCard label="Receita (preço ao bar)" value={fmtYen(lucro.venda)} color="blue" />
              <MetricCard label="Lucro estimado" value={fmtYen(lucro.lucro)} sub={`${lucro.margemPct}% margem`} color="green" />
            </div>
          )}

          {(extracted.itens_custo?.length > 0) && (
            <ItemBlock title="Itens de custo (compra)" items={extracted.itens_custo} priceKey="custo_unitario" />
          )}

          {(extracted.entregas?.length > 0) && extracted.entregas.map((ent, i) => (
            <div key={i} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', marginBottom: 6 }}>
                Entrega → {ent.bar_nome || extracted.cliente_bar || '?'} ({ent.data || extracted.data})
              </div>
              <ItemBlock items={ent.itens} priceKey="preco_unitario" />
            </div>
          ))}

          {extracted.observacoes && (
            <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 8 }}>{extracted.observacoes}</div>
          )}

          <button className="btn-primary" onClick={save} disabled={saving} style={{ width: '100%', padding: 12, borderRadius: 12, marginTop: 16 }}>
            {saving ? 'Registrando...' : '💾 Registrar compra, entregas e lucro'}
          </button>
        </div>
      )}

      {result && (
        <div className="card" style={{ borderLeft: '4px solid var(--green)' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--green)', marginBottom: 12 }}>✅ Registrado com sucesso</div>
          <ul style={{ fontSize: 13, lineHeight: 1.8, paddingLeft: 20 }}>
            {result.compra && <li>Compra registrada (custo {fmtYen(result.custo)})</li>}
            {result.precosAtualizados?.fornecedor_precos > 0 && (
              <li>Preços do fornecedor atualizados ({result.precosAtualizados.fornecedor_precos} item(ns))</li>
            )}
            {result.pedidos?.pedidos > 0 && (
              <li>{result.pedidos.pedidos} pedido(s) marcado(s) como entregue — receita {fmtYen(result.pedidos.receita)}</li>
            )}
            {result.pedidos?.skipped > 0 && (
              <li>{result.pedidos.skipped} pedido(s) já sincronizado(s)</li>
            )}
            <li>Lucro real JBM: {fmtYen(result.lucro)} ({result.margemPct}% margem)</li>
          </ul>
          <button onClick={() => { setImage(null); setExtracted(null); setResult(null) }} style={{ marginTop: 12, padding: '8px 16px', borderRadius: 8 }}>
            Nova 請求書
          </button>
        </div>
      )}
    </div>
  )
}

function Field({ label, value, highlight }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontWeight: highlight ? 700 : 600, color: highlight ? 'var(--navy)' : 'inherit', fontSize: highlight ? 18 : 14 }}>
        {value || '—'}
      </div>
    </div>
  )
}

function ItemBlock({ title, items, priceKey }) {
  if (!items?.length) return null
  return (
    <div style={{ marginBottom: 12 }}>
      {title && <div style={{ fontSize: 11, color: 'var(--text2)', textTransform: 'uppercase', marginBottom: 6 }}>{title}</div>}
      {items.map((it, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
          <span>{it.nome} × {it.qtd || 1}</span>
          <span style={{ fontWeight: 600 }}>{fmtYen((it[priceKey] || 0) * (it.qtd || 1))}</span>
        </div>
      ))}
    </div>
  )
}
