const AI_URL = import.meta.env.VITE_AI_API || 'https://bebidas-control.vercel.app/api/chat'

export async function callGeminiChat({ messages, system, temperature = 0.4, maxOutputTokens = 1200 }) {
  let res
  try {
    res = await fetch(AI_URL, {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, system, temperature, maxOutputTokens }),
    })
  } catch (e) {
    throw new Error('Não foi possível conectar à IA. Verifique a conexão e tente de novo.')
  }

  let data
  try {
    data = await res.json()
  } catch {
    throw new Error('Resposta inválida da IA')
  }

  if (!res.ok || data.error) throw new Error(data.error || res.statusText || 'Erro na IA')
  return data.text || 'Sem resposta'
}

export function parseJsonFromAI(text) {
  const cleaned = String(text || '').replace(/```json|```/g, '').trim()
  return JSON.parse(cleaned)
}
