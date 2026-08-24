import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { imageDataUrlToParts } from '../lib/ai'
import { analyzeSeikyusho, registerSeikyusho, calcLucroPreview } from '../lib/seikyusho'
import { fmtYen, fmtDate, Spinner, MetricCard } from './utils'
import { PageHeader, PortalSurface } from './ui/PageLayout'

export default function SeikyushoTab() {
  const [image, setImage] = useState(null)
  const [comentario, setComentario] = useState('')
  const [correcao, setCorrecao] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [extracted, setExtracted] = useState(null)
  const [plano, setPlano] = useState(null)
  const [result, setResult] = useState(null)
  const [context, setContext] = useState('')
  const [catalog, setCatalog] = useState([])
  const [step, setStep] = useState('upload') // upload | review | done

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

  function resetAll() {
    setImage(null)
    setComentario('')
    setCorrecao('')
    setExtracted(null)
    setPlano(null)
    setResult(null)
    setStep('upload')
  }

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      setImage(ev.target.result)
      setExtracted(null)
      setPlano(null)
      setResult(null)
      setStep('upload')
    }
    reader.readAsDataURL(file)
  }

  async function scan(commentOverride) {
    if (!image) return
    setLoading(true)
    try {
      const imageParts = imageDataUrlToParts(image)
      if (!imageParts?.data) {
        throw new Error('Arquivo inválido. Use JPG, PNG ou PDF.')
      }
      const note = [comentario, commentOverride].filter(Boolean).join('\n').trim()
      const { extracted: data, plano: plan } = await analyzeSeikyusho({
        image: imageParts,
        contextText: context,
        comentario: note,
        previous: commentOverride && extracted ? extracted : undefined,
      })
      setExtracted(data)
      setPlano(plan)
      setStep('review')
      if (commentOverride) setCorrecao('')
    } catch (e) {
      alert(e.message || 'Erro ao analisar fatura')
    } finally {
      setLoading(false)
    }
  }

  async function confirmAndSave() {
    if (!extracted) return
    setSaving(true)
    try {
      const data = await registerSeikyusho({
        extracted,
        comentario: [comentario, correcao].filter(Boolean).join(' — '),
        confirmed: true,
      })
      setResult(data)
      setStep('done')
    } catch (e) {
      alert(e.message || 'Erro ao registrar')
    } finally {
      setSaving(false)
    }
  }

  const lucro = extracted ? calcLucroPreview(extracted, catalog) : null

  return (
    <div className="fade-in" style={{ maxWidth: 1000 }}>
      <PageHeader
        title="Leitor de cobrança"
        subtitle="Envie a fatura do fornecedor (請求書), revise os dados extraídos e confirme antes de registrar."
      />

      {step !== 'done' && (
        <>
          <div
            className="portal-surface-card"
            style={{ border: '2px dashed var(--border)', textAlign: 'center', padding: 32, marginBottom: 16, cursor: 'pointer' }}
            onClick={() => document.getElementById('seikyusho-input')?.click()}
          >
            {image ? (
              image.startsWith('data:application/pdf') ? (
                <div style={{ padding: 24 }}>
                  <div style={{ fontSize: 48, marginBottom: 8 }}>📄</div>
                  <div style={{ fontWeight: 600 }}>PDF selecionado</div>
                  <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>Pronto para leitura automática</div>
                </div>
              ) : (
                <img src={image} alt="seikyusho" style={{ maxHeight: 360, maxWidth: '100%', borderRadius: 8 }} />
              )
            ) : (
              <div>
                <div style={{ fontSize: 48, marginBottom: 8 }}>📄</div>
                <div style={{ fontWeight: 600 }}>Clique para selecionar a fatura</div>
                <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>JPG, PNG ou PDF — 請求書 do fornecedor</div>
              </div>
            )}
            <input id="seikyusho-input" type="file" accept="image/*,.pdf" style={{ display: 'none' }} onChange={handleFile} />
          </div>

          {step === 'upload' && image && (
            <PortalSurface style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text2)', marginBottom: 8, textTransform: 'uppercase' }}>
                Comentário (opcional)
              </label>
              <textarea
                value={comentario}
                onChange={e => setComentario(e.target.value)}
                placeholder="Ex: entrega direta ao Atomic, período julho/2026, custo é da JBM não do bar, pedidos já existem no portal..."
                rows={4}
                style={{ width: '100%', padding: 12, borderRadius: 10, border: '1px solid var(--border)', fontSize: 13, resize: 'vertical', marginBottom: 12 }}
              />
              <button className="btn-primary" onClick={() => scan()} disabled={loading} style={{ width: '100%', padding: 12, borderRadius: 12 }}>
                {loading ? 'Lendo fatura...' : 'Ler fatura'}
              </button>
            </PortalSurface>
          )}
        </>
      )}

      {loading && (
        <div style={{ textAlign: 'center', padding: 24 }}>
          <Spinner /> <span style={{ marginLeft: 8, color: 'var(--text2)' }}>Lendo fatura...</span>
        </div>
      )}

      {step === 'review' && extracted && !result && (
        <PortalSurface style={{ marginBottom: 16 }}>
          {plano && (
            <div style={{ marginBottom: 20, padding: 16, background: 'var(--blue-bg)', borderRadius: 12, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', marginBottom: 8 }}>Resumo da leitura</div>
              <p style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 12 }}>{plano.resumo}</p>
              {plano.acoes?.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', marginBottom: 6 }}>Ações no sistema</div>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.7 }}>
                    {plano.acoes.map((a, i) => <li key={i}>{a}</li>)}
                  </ul>
                </div>
              )}
              {plano.alertas?.length > 0 && (
                <div style={{ marginBottom: 12, padding: '8px 12px', background: 'var(--amber-bg)', borderRadius: 8, fontSize: 12 }}>
                  {plano.alertas.map((a, i) => <div key={i}>⚠️ {a}</div>)}
                </div>
              )}
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)', padding: '12px 0 0', borderTop: '1px solid var(--border)' }}>
                {plano.pergunta || 'Está correto? Posso registrar no sistema?'}
              </div>
            </div>
          )}

          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Dados extraídos — revise</div>

          <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
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

          <div style={{ marginTop: 16, marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text2)', marginBottom: 8, textTransform: 'uppercase' }}>
              Correção / comentário adicional
            </label>
            <textarea
              value={correcao}
              onChange={e => setCorrecao(e.target.value)}
              placeholder="Algo errado? Descreva aqui e re-analise antes de confirmar."
              rows={3}
              style={{ width: '100%', padding: 12, borderRadius: 10, border: '1px solid var(--border)', fontSize: 13, resize: 'vertical' }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
            <button className="btn-primary" onClick={confirmAndSave} disabled={saving} style={{ width: '100%', padding: 12, borderRadius: 12 }}>
              {saving ? 'Registrando...' : '✅ Sim, está correto — registrar no sistema'}
            </button>
            {correcao.trim() && (
              <button onClick={() => scan(correcao)} disabled={loading} style={{ width: '100%', padding: 12, borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg2)' }}>
                🔄 Re-analisar com correção
              </button>
            )}
            <button onClick={() => { setStep('upload'); setExtracted(null); setPlano(null) }} style={{ width: '100%', padding: 10, borderRadius: 12, border: 'none', background: 'transparent', color: 'var(--text2)', fontSize: 13 }}>
              ← Voltar e editar comentário inicial
            </button>
          </div>
        </PortalSurface>
      )}

      {step === 'done' && result && (
        <PortalSurface style={{ borderLeft: '4px solid var(--green)' }}>
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
          <button onClick={resetAll} style={{ marginTop: 12, padding: '8px 16px', borderRadius: 8 }}>
            Nova fatura
          </button>
        </PortalSurface>
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
