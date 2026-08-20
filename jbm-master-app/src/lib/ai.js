const AI_URL = import.meta.env.VITE_AI_API || 'https://bebidas-control.vercel.app/api/chat'

export async function callGeminiChat({ messages, system, temperature = 0.4, maxOutputTokens = 1200 }) {
  const res = await fetch(AI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, system, temperature, maxOutputTokens }),
  })
  const data = await res.json()
  if (!res.ok || data.error) throw new Error(data.error || res.statusText)
  return data.text || 'Sem resposta'
}

export function parseJsonFromAI(text) {
  const cleaned = String(text || '').replace(/```json|```/g, '').trim()
  return JSON.parse(cleaned)
}
