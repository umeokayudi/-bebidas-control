import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { callGeminiChat, imageDataUrlToParts, parseJsonFromAI } from '../lib/ai'
import { fetchHoldingSystemSnapshot, buildHoldingChatSystem } from '../lib/holdingDataSync'
import { syncHoldingFromCloud } from '../lib/jbmHolding'
import { fmtYen, Spinner } from './utils'
import JbmHoldingPanel from './JbmHoldingPanel'

export default function AIAssistant() {
  const [tab, setTab] = useState('holding')
  return (
    <div>
      <div style={{ display:'flex', gap:8, marginBottom:20, flexWrap:'wrap' }}>
        {[['holding','🏛 JBM Holding'],['chat','🤖 Chat'],['purchase','🛒 Compras'],['scan','📷 Recibo']].map(([id,label]) => (
          <button key={id} onClick={()=>setTab(id)} style={{
            padding:'8px 18px', borderRadius:10, fontSize:13, fontWeight:600, cursor:'pointer',
            background: tab===id ? 'var(--navy)' : 'var(--bg3)',
            color: tab===id ? 'white' : 'var(--text2)', border:'none'
          }}>{label}</button>
        ))}
      </div>
      {tab==='holding'  && <JbmHoldingPanel />}
      {tab==='chat'     && <AIChat />}
      {tab==='purchase' && <PurchaseAdvisor />}
      {tab==='scan'     && <ReceiptScanner />}
    </div>
  )
}

function AIChat() {
  const [messages, setMessages] = useState([
    { role:'assistant', content:'Olá! Sou o assistente JBM Drinks, ligado aos dados reais do sistema. Pergunte sobre estoque, pedidos, caixa ou compras.' }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:'smooth' }) }, [messages])

  async function send() {
    if (!input.trim() || loading) return
    const userMsg = { role:'user', content: input }
    setMessages(m => [...m, userMsg])
    setInput('')
    setLoading(true)

    const holding = await syncHoldingFromCloud().catch(() => null)
    const snapshot = await fetchHoldingSystemSnapshot(supabase, holding)
    const system = buildHoldingChatSystem(snapshot) + `

Produtos recentes: ${JSON.stringify((await supabase.from('produtos').select('nome,categoria,custo,preco_venda').eq('ativo',true).limit(15)).data)}
Pedidos recentes: ${JSON.stringify((await supabase.from('pedidos').select('status,total_estimado,criado_em').order('criado_em',{ascending:false}).limit(8)).data)}
Responda em português do Brasil, de forma concisa e prática.`

    const history = messages.filter(m=>m.role!=='assistant'||messages.indexOf(m)>0).map(m=>({role:m.role,content:m.content}))
    const reply = await callGeminiChat({ messages: [...history, userMsg], system })
    setMessages(m => [...m, { role:'assistant', content: reply }])
    setLoading(false)
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', height:600 }}>
      <div style={{ flex:1, overflowY:'auto', padding:'0 4px', display:'flex', flexDirection:'column', gap:12 }}>
        {messages.map((m,i) => (
          <div key={i} style={{ display:'flex', justifyContent: m.role==='user'?'flex-end':'flex-start' }}>
            <div style={{
              maxWidth:'75%', padding:'12px 16px', borderRadius: m.role==='user'?'18px 18px 4px 18px':'18px 18px 18px 4px',
              background: m.role==='user'?'var(--navy)':'var(--bg2)',
              color: m.role==='user'?'white':'var(--text)',
              fontSize:13, lineHeight:1.6,
              border: m.role==='assistant'?'1px solid var(--border)':'none'
            }}>
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display:'flex', justifyContent:'flex-start' }}>
            <div style={{ padding:'12px 16px', borderRadius:'18px 18px 18px 4px', background:'var(--bg2)', border:'1px solid var(--border)' }}>
              <span style={{ display:'flex', gap:4 }}>
                {[0,1,2].map(i=><span key={i} style={{ width:6,height:6,borderRadius:'50%',background:'var(--text3)',animation:'pulse 1s infinite',animationDelay:i*0.2+'s' }}/>)}
              </span>
            </div>
          </div>
        )}
        <div ref={bottomRef}/>
      </div>
      <div style={{ display:'flex', gap:10, marginTop:16 }}>
        <input value={input} onChange={e=>setInput(e.target.value)}
          onKeyDown={e=>e.key==='Enter'&&send()}
          placeholder="Ask anything about your business..."
          style={{ flex:1, padding:'12px 16px', borderRadius:12, fontSize:13 }}
        />
        <button onClick={send} disabled={loading||!input.trim()} className="btn-primary"
          style={{ padding:'12px 20px', borderRadius:12, fontSize:13 }}>
          {loading ? '...' : 'Send'}
        </button>
      </div>
    </div>
  )
}

function PurchaseAdvisor() {
  const [loading, setLoading] = useState(false)
  const [advice, setAdvice] = useState(null)
  const [data, setData] = useState(null)

  async function analyze() {
    setLoading(true)
    const [{ data: produtos }, { data: movimentos }, { data: pedidos }, { data: fornecedores }, { data: precos }] = await Promise.all([
      supabase.from('produtos').select('id,nome,categoria,custo,volume_ml').eq('ativo',true),
      supabase.from('estoque_movimentos').select('produto_id,tipo,qtd,criado_em').order('criado_em',{ascending:false}).limit(500),
      supabase.from('pedidos').select('pedidos_itens(produto_id,qtd),criado_em').order('criado_em',{ascending:false}).limit(10),
      supabase.from('fornecedores').select('nome,prazo_entrega_dias,pagamento,pontos_pct'),
      supabase.from('fornecedor_precos').select('produto_id,preco,fornecedores(nome)'),
    ])

    // Calculate stock levels
    const stockMap = {}
    ;(movimentos||[]).forEach(m => {
      if (!stockMap[m.produto_id]) stockMap[m.produto_id] = 0
      stockMap[m.produto_id] += m.tipo==='entrada' ? m.qtd : -m.qtd
    })

    const stockList = (produtos||[]).map(p => ({
      ...p, stock: Math.max(0, stockMap[p.id]||0),
      suppliers: (precos||[]).filter(pr=>pr.produto_id===p.id).map(pr=>({name:pr.fornecedores?.nome,price:pr.preco}))
    }))

    setData(stockList)

    const prompt = `Analyze this inventory and recommend what to purchase this week:
${JSON.stringify(stockList.map(p=>({name:p.nome,stock:p.stock,jbmCost:p.custo,suppliers:p.suppliers})))}

Recent orders: ${JSON.stringify(pedidos?.slice(0,3))}
Available suppliers: ${JSON.stringify(fornecedores)}

Provide:
1. TOP 5 items to reorder urgently (low/no stock)
2. Best supplier recommendation for each
3. Estimated total purchase cost
4. Any cost-saving opportunities

Be specific with quantities and prices in yen.`

    const reply = await callGeminiChat({
      messages: [{ role: 'user', content: prompt }],
      system: 'You are a procurement advisor for JBM Drinks Japan. Be concise, practical and specific.',
    })
    setAdvice(reply)
    setLoading(false)
  }

  return (
    <div>
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:16, fontWeight:700, marginBottom:4 }}>Purchase Advisor</div>
        <div style={{ fontSize:13, color:'var(--text2)', marginBottom:16 }}>AI analyzes your stock levels and recommends what to buy this week</div>
        <button className="btn-primary" onClick={analyze} disabled={loading} style={{ padding:'12px 24px', borderRadius:12 }}>
          {loading ? '🤔 Analyzing...' : '🔍 Analyze & recommend'}
        </button>
      </div>

      {advice && (
        <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:16, padding:'24px' }}>
          <div style={{ fontSize:14, fontWeight:700, marginBottom:16, color:'var(--navy)' }}>📋 Purchase Recommendation</div>
          <div style={{ fontSize:13, lineHeight:1.8, whiteSpace:'pre-wrap' }}>{advice}</div>
        </div>
      )}
    </div>
  )
}

function ReceiptScanner() {
  const [image, setImage] = useState(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function scan() {
    if (!image) return
    setLoading(true)
    setResult(null)

    const imageParts = imageDataUrlToParts(image)
    const prompt = `Extract purchase information from this receipt image. Return ONLY valid JSON:
{
  "supplier": "store name",
  "date": "YYYY-MM-DD",
  "payment": "Cash/Card/etc",
  "items": [{"name": "product name", "qty": 1, "price": 0}],
  "total": 0,
  "points": 0
}`

    const text = await callGeminiChat({
      messages: [{ role: 'user', content: prompt }],
      image: imageParts,
      temperature: 0.2,
      maxOutputTokens: 1024,
    })
    try {
      setResult(parseJsonFromAI(text))
    } catch(e) {
      setResult({ error: text })
    }
    setLoading(false)
  }

  async function saveReceipt() {
    if (!result || result.error) return
    setSaving(true)
    await supabase.from('compras').insert({
      data: result.date || new Date().toISOString().slice(0,10),
      fornecedor: result.supplier || '',
      pagamento: result.payment || 'Cash',
      subtotal: result.total || 0,
      desconto_pontos: 0,
      total_pago: result.total || 0,
      pontos_ganhos: result.points || 0,
      obs: 'AI scanned receipt'
    })
    setSaving(false)
    setSaved(true)
  }

  return (
    <div>
      <div style={{ fontSize:16, fontWeight:700, marginBottom:4 }}>Receipt Scanner</div>
      <div style={{ fontSize:13, color:'var(--text2)', marginBottom:16 }}>Take a photo of any receipt and AI extracts the data automatically</div>

      <div style={{ border:'2px dashed var(--border)', borderRadius:16, padding:'32px', textAlign:'center', marginBottom:16, cursor:'pointer', background:'var(--bg2)' }}
        onClick={()=>document.getElementById('receipt-input').click()}>
        {image
          ? <img src={image} alt="receipt" style={{ maxHeight:300, maxWidth:'100%', borderRadius:8 }} />
          : <div>
              <div style={{ fontSize:40, marginBottom:8 }}>📷</div>
              <div style={{ fontSize:14, fontWeight:600 }}>Tap to select receipt photo</div>
              <div style={{ fontSize:12, color:'var(--text2)', marginTop:4 }}>AI extracts supplier, items, payment and points automatically</div>
            </div>
        }
        <input id="receipt-input" type="file" accept="image/*" style={{ display:'none' }}
          onChange={e => {
            const file = e.target.files[0]
            if (!file) return
            const reader = new FileReader()
            reader.onload = ev => setImage(ev.target.result)
            reader.readAsDataURL(file)
          }}
        />
      </div>

      {image && !result && (
        <button className="btn-primary" onClick={scan} disabled={loading} style={{ width:'100%', padding:'12px', borderRadius:12, marginBottom:16 }}>
          {loading ? '🤖 Scanning...' : '🔍 Scan receipt'}
        </button>
      )}

      {result && !result.error && (
        <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:16, padding:'24px', marginBottom:16 }}>
          <div style={{ fontSize:14, fontWeight:700, marginBottom:16 }}>✅ Receipt extracted</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16 }}>
            <div><span style={{ fontSize:11, color:'var(--text2)', textTransform:'uppercase' }}>Supplier</span><div style={{ fontWeight:600 }}>{result.supplier}</div></div>
            <div><span style={{ fontSize:11, color:'var(--text2)', textTransform:'uppercase' }}>Date</span><div style={{ fontWeight:600 }}>{result.date}</div></div>
            <div><span style={{ fontSize:11, color:'var(--text2)', textTransform:'uppercase' }}>Payment</span><div style={{ fontWeight:600 }}>{result.payment}</div></div>
            <div><span style={{ fontSize:11, color:'var(--text2)', textTransform:'uppercase' }}>Total</span><div style={{ fontWeight:700, color:'var(--navy)', fontSize:18 }}>{fmtYen(result.total)}</div></div>
          </div>
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:11, color:'var(--text2)', textTransform:'uppercase', marginBottom:8 }}>Items</div>
            {(result.items||[]).map((it,i) => (
              <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid var(--border)', fontSize:13 }}>
                <span>{it.name} × {it.qty}</span>
                <span style={{ fontWeight:600 }}>{fmtYen(it.price)}</span>
              </div>
            ))}
          </div>
          {!saved
            ? <button className="btn-primary" onClick={saveReceipt} disabled={saving} style={{ width:'100%', padding:'12px', borderRadius:12 }}>
                {saving ? 'Saving...' : '💾 Save to purchases'}
              </button>
            : <div style={{ textAlign:'center', color:'var(--green)', fontWeight:700, padding:12 }}>✅ Saved to purchases!</div>
          }
        </div>
      )}

      {result?.error && (
        <div style={{ background:'#fef2f2', border:'1px solid #fca5a5', borderRadius:12, padding:16, fontSize:13, color:'#dc2626' }}>
          Could not extract receipt data. Try a clearer photo.
        </div>
      )}
    </div>
  )
}
