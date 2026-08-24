// ── Formatters ────────────────────────────────────────────────────────────────
export const fmtYen   = n => `¥${Math.round(+n || 0).toLocaleString('ja-JP')}`
export const fmtDate  = iso => iso ? new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {year:'numeric',month:'short',day:'numeric'}) : '—'
export const monthKey = iso => iso ? String(iso).slice(0, 7) : ''
export const compraDate = c => {
  const d = c?.data_compra || c?.data || ''
  return d ? String(d).slice(0, 10) : ''
}
export const compraMonthKey = c => monthKey(compraDate(c))

/** Vencimento de compra a prazo — ex.: Le Vin paga dia 10 do mês seguinte */
export function compraDueDate(c, fornecedorPagamento) {
  const explicit = c?.data_pagamento ? String(c.data_pagamento).slice(0, 10) : ''
  if (explicit) return explicit
  const base = compraDate(c)
  if (!base) return ''
  const pag = String(fornecedorPagamento || c?.pagamento || '')
  const m = pag.match(/dia\s*(\d{1,2})/i) || pag.match(/day\s*(\d{1,2})/i) || pag.match(/(\d{1,2})\s*(?:of|do mês)/i)
  if (!m) return ''
  const day = Math.min(28, Math.max(1, +m[1]))
  const d = new Date(base + 'T12:00:00')
  d.setMonth(d.getMonth() + 1)
  d.setDate(day)
  return d.toISOString().slice(0, 10)
}

export function isCompraOverdue(c, fornecedorPagamento) {
  if (c?.status_pagamento === 'pago') return false
  const due = compraDueDate(c, fornecedorPagamento)
  if (!due) return false
  return due < new Date().toISOString().slice(0, 10)
}
export const saleDate = v => v?.data || v?.data_venda || ''
export const saleMonthKey = v => monthKey(saleDate(v))
export const monthLabel = mk => {
  if (!mk) return ''
  const [y, m] = mk.split('-')
  const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${names[+m - 1]}/${y}`
}

export const PAGAMENTOS = ['Cash','Credit card','Debit card','PIX','Transfer','Points/Credit','Mixed']
export const CATEGORIAS = ['Water','Soda','Juice','Energy Drink','Beer','Sake','Shochu','Vodka','Gin','Tequila','Whisky','Japanese Whisky','Spirits','Champagne','Wine','Others']

// Inventory categories JBM sells to bars (excludes POS/menu imports)
export const SUPPLIER_CATEGORIES = CATEGORIAS
export const NON_SUPPLIER_CATEGORIES = ['Highball', 'Food', 'Bottle', 'Premium', 'Soft', 'suco', 'cha', 'licor', 'rum', 'mixer', 'vinho', 'Cerveja', 'Soft Drinks', 'Liqueurs', 'Gin Base', 'Wine Base']

export function isSupplierProduct(p) {
  if (!p || p.ativo === false) return false
  if (NON_SUPPLIER_CATEGORIES.includes(p.categoria)) return false
  return SUPPLIER_CATEGORIES.includes(p.categoria)
}

// Supplier deliveries only — excludes POS/bar billing imported into vendas
export function isSupplierVenda(v) {
  if (!v) return false
  if (v.origem === 'pos') return false
  const obs = (v.obs || '').toLowerCase()
  if (obs.includes('balcão') || obs.includes('balcao') || obs.includes('square') || obs.includes('pos')) return false
  if (v.cast_id) return false
  return true
}

export function filterSupplierVendas(list) {
  return (list || []).filter(isSupplierVenda)
}

export function roleLabel(role) {
  if (role === 'admin') return 'Administrador'
  if (role === 'cliente') return 'Cliente'
  if (role === 'funcionario') return 'Funcionário'
  return 'Staff'
}

// ── Metric Card ───────────────────────────────────────────────────────────────
export function MetricCard({ label, value, sub, color = 'blue', icon }) {
  return (
    <div className={`metric-card ${color}`}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <div className="metric-label">{label}</div>
        {icon && <span style={{ fontSize:20, opacity:0.5 }}>{icon}</span>}
      </div>
      <div className="metric-value" style={{
        color: color==='green'?'var(--green)':color==='red'?'var(--red)':color==='gold'?'var(--gold)':'var(--blue)'
      }}>{value}</div>
      {sub && <div className="metric-sub">{sub}</div>}
    </div>
  )
}

// ── Badge ─────────────────────────────────────────────────────────────────────
export function Badge({ children, color = 'blue' }) {
  const map = {
    blue:  { bg:'var(--blue-bg)',  text:'var(--blue)'  },
    green: { bg:'var(--green-bg)', text:'var(--green)' },
    red:   { bg:'var(--red-bg)',   text:'var(--red)'   },
    amber: { bg:'var(--amber-bg)', text:'var(--amber)' },
    gold:  { bg:'#FDF8EC',         text:'var(--gold)'  },
  }
  const s = map[color] || map.blue
  return <span className="badge" style={{ background:s.bg, color:s.text }}>{children}</span>
}

// ── Category Badge ────────────────────────────────────────────────────────────
export function CatBadge({ cat }) {
  const map = {
    'Beer':'amber','Sake':'blue','Shochu':'blue',
    'Vodka':'blue','Gin':'blue','Tequila':'amber','Whisky':'amber',
    'Japanese Whisky':'amber','Spirits':'amber','Champagne':'gold',
    'Wine':'gold','Water':'green','Soda':'green','Juice':'green',
    'Energy Drink':'red','Others':'blue'
  }
  return <Badge color={map[cat]||'blue'}>{cat}</Badge>
}

// ── Spinner ───────────────────────────────────────────────────────────────────
export function Spinner({ text = 'Loading...' }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, color:'var(--text2)', fontSize:13, padding:'20px 0' }}>
      <span className="spinner" />{text}
    </div>
  )
}

// ── Empty ─────────────────────────────────────────────────────────────────────
export function Empty({ text, icon = '📭' }) {
  return (
    <div style={{ textAlign:'center', padding:'40px 0', color:'var(--text3)' }}>
      <div style={{ fontSize:32, marginBottom:8 }}>{icon}</div>
      <div style={{ fontSize:13 }}>{text}</div>
    </div>
  )
}

// ── Section Title ─────────────────────────────────────────────────────────────
export function SectionTitle({ children, sub }) {
  return (
    <div style={{ marginBottom:18 }}>
      <div style={{ fontSize:16, fontWeight:700, letterSpacing:-0.3 }}>{children}</div>
      {sub && <div style={{ fontSize:12, color:'var(--text2)', marginTop:2 }}>{sub}</div>}
    </div>
  )
}

// ── Del Button ────────────────────────────────────────────────────────────────
export function DelBtn({ onClick, title = 'Excluir' }) {
  return (
    <button className="btn-danger" onClick={onClick} title={title}
      style={{ padding:'4px 10px', fontSize:11, borderRadius:6 }}>🗑</button>
  )
}

export function EditBtn({ onClick, title = 'Editar' }) {
  return (
    <button onClick={onClick} title={title}
      style={{ padding:'4px 10px', fontSize:11, borderRadius:6, border:'1px solid var(--border)', background:'var(--bg2)', cursor:'pointer' }}>✏️</button>
  )
}

export function RowActions({ onEdit, onDelete, editTitle, deleteTitle }) {
  return (
    <span style={{ display: 'inline-flex', gap: 6 }}>
      {onEdit && <EditBtn onClick={onEdit} title={editTitle} />}
      {onDelete && <DelBtn onClick={onDelete} title={deleteTitle} />}
    </span>
  )
}

// ── Divider ───────────────────────────────────────────────────────────────────
export function Divider() {
  return <div style={{ height:1, background:'var(--border)', margin:'16px 0' }} />
}

/** Chip de item de pedido — hover mostra preço × qtd = total */
export function PedidoItemChip({ nome, qtd, precoUnitario, custoUnitario, hideCost = false }) {
  const qty = +qtd || 0
  const unit = +precoUnitario || 0
  const line = unit * qty
  const cost = !hideCost && custoUnitario != null ? +custoUnitario : null
  const tipLines = [
    `¥${Math.round(unit).toLocaleString('ja-JP')} × ${qty} = ¥${Math.round(line).toLocaleString('ja-JP')}`,
  ]
  if (cost != null && cost > 0) {
    tipLines.push(`Custo JBM: ¥${Math.round(cost).toLocaleString('ja-JP')}`)
    const lucro = line - cost * qty
    tipLines.push(`Margem linha: ¥${Math.round(lucro).toLocaleString('ja-JP')}`)
  }

  return (
    <span className="pedido-item-chip" data-tip={tipLines.join(' · ')}>
      <span className="pedido-item-chip-name">{nome}</span>
      <span className="pedido-item-chip-qty">×{qty}</span>
    </span>
  )
}

// ── AI receipt analysis ───────────────────────────────────────────────────────
export async function analyzeReceipt(base64, mediaType) {
  const key = import.meta.env.VITE_ANTHROPIC_KEY
  if (!key || key === 'dummy') return null
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-calls': 'true'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: 'Read beverage receipts (Japanese or Portuguese). Reply ONLY valid JSON no markdown: {"fornecedor":"","data":"","pagamento":"","pontos_ganhos":0,"desconto_pontos":0,"subtotal":0,"total_pago":0,"itens":[{"nome":"","qtd":1,"custo_unitario":0}]}',
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          { type: 'text', text: 'Read this receipt.' }
        ]
      }]
    })
  })
  const data = await resp.json()
  const text = (data.content || []).map(c => c.text || '').join('')
  try { return JSON.parse(text.replace(/```json|```/g, '').trim()) }
  catch { return null }
}
