import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { callGeminiChat } from '../lib/ai'
import { Spinner, SectionTitle } from './utils'
import { fetchClientPortalSnapshot, buildClientChatSystem } from '../lib/clientPortalSnapshot'

const QUICK_PROMPTS = [
  'Quanto gastei com bebidas este mês?',
  'Quais produtos dão mais margem no meu cardápio?',
  'Tenho faturas pendentes ou em atraso?',
  'Como estão minhas compras nos últimos meses?',
  'O que devo repor no estoque?',
]

export default function PortalClienteAI({ bar }) {
  const [snapshot, setSnapshot] = useState(null)
  const [loadingSnap, setLoadingSnap] = useState(true)
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: `Olá! Sou o assistente IA do portal JBM Drinks para ${bar.nome}. Pergunte sobre compras, faturas, margem POS ou estoque — uso os dados reais do seu bar.`,
    },
  ])
  const [input, setInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => {
    refreshSnapshot()
  }, [bar])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function refreshSnapshot() {
    setLoadingSnap(true)
    try {
      const snap = await fetchClientPortalSnapshot(supabase, bar)
      setSnapshot(snap)
    } catch (e) {
      setSnapshot({ erro: e.message, bar: { nome: bar.nome } })
    }
    setLoadingSnap(false)
  }

  async function sendChat(override) {
    const text = (override || input).trim()
    if (!text || chatLoading) return
    setInput('')
    const userMsg = { role: 'user', content: text }
    setMessages(m => [...m, userMsg])
    setChatLoading(true)

    const snap = snapshot?.erro ? await fetchClientPortalSnapshot(supabase, bar) : (snapshot || await fetchClientPortalSnapshot(supabase, bar))
    if (!snapshot || snapshot.erro) setSnapshot(snap)

    const history = messages.filter((_, i) => i > 0).map(m => ({ role: m.role, content: m.content }))
    const reply = await callGeminiChat({
      messages: [...history, userMsg],
      system: buildClientChatSystem(snap),
      temperature: 0.45,
      maxOutputTokens: 1200,
    })
    setMessages(m => [...m, { role: 'assistant', content: reply }])
    setChatLoading(false)
  }

  return (
    <div className="fade-in portal-page" style={{ maxWidth: 860 }}>
      <SectionTitle sub="Pergunte sobre compras, relatórios, faturas e margem — com dados do seu bar">
        Assistente IA
      </SectionTitle>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ fontSize: 12, color: 'var(--text2)' }}>
          Conectada às compras, pedidos, faturas JBM, preços POS e estoque de {bar.nome}.
        </div>
        <button
          type="button"
          onClick={refreshSnapshot}
          disabled={loadingSnap}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'white', fontSize: 12, cursor: 'pointer' }}
        >
          {loadingSnap ? '...' : '🔄 Atualizar dados'}
        </button>
      </div>

      {snapshot && !snapshot.erro && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(130px,1fr))', gap: 8, marginBottom: 16 }}>
          {[
            { label: 'Compras mês', value: `¥${Math.round(snapshot.comprasMes || 0).toLocaleString('ja-JP')}`, color: 'var(--navy)' },
            { label: 'Margem POS', value: `${snapshot.margemPct || 0}%`, color: 'var(--green)' },
            { label: 'Pendente', value: `¥${Math.round(snapshot.totalPendente || 0).toLocaleString('ja-JP')}`, color: snapshot.totalPendente > 0 ? 'var(--amber)' : 'var(--green)' },
            { label: 'Em atraso', value: snapshot.faturasAtraso || 0, color: snapshot.faturasAtraso > 0 ? 'var(--red)' : 'var(--green)' },
          ].map(k => (
            <div key={k.label} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
              <div style={{ fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase' }}>{k.label}</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: k.color }}>{k.value}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {QUICK_PROMPTS.map(p => (
          <button
            key={p}
            type="button"
            onClick={() => sendChat(p)}
            style={{ fontSize: 11, padding: '6px 12px', borderRadius: 20, border: '1px solid var(--border)', background: 'var(--bg3)', cursor: 'pointer' }}
          >
            {p}
          </button>
        ))}
      </div>

      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', height: 420 }}>
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
          {messages.map((m, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <div
                style={{
                  maxWidth: '85%',
                  padding: '10px 14px',
                  borderRadius: m.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                  background: m.role === 'user' ? 'var(--navy)' : 'white',
                  color: m.role === 'user' ? 'white' : 'var(--text)',
                  fontSize: 13,
                  lineHeight: 1.6,
                  border: m.role === 'assistant' ? '1px solid var(--border)' : 'none',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {m.content}
              </div>
            </div>
          ))}
          {chatLoading && <Spinner text="Analisando dados do seu bar..." />}
          <div ref={bottomRef} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendChat()}
            placeholder="Ex.: quanto gastei em julho? qual produto rende mais?"
            style={{ flex: 1, padding: '10px 14px', borderRadius: 10, fontSize: 13 }}
          />
          <button
            type="button"
            onClick={() => sendChat()}
            disabled={chatLoading || !input.trim()}
            className="btn-primary"
            style={{ padding: '10px 16px', borderRadius: 10, fontSize: 12 }}
          >
            Enviar
          </button>
        </div>
      </div>
    </div>
  )
}
