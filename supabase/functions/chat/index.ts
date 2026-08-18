import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const PREFERRED = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-1.5-flash']

async function geminiGenerate(body: Record<string, unknown>) {
  const key = Deno.env.get('GEMINI_API_KEY')
  if (!key) throw new Error('GEMINI_API_KEY not configured')

  let lastErr = ''
  for (const model of PREFERRED) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
    )
    const text = await res.text()
    if (res.ok) {
      const data = JSON.parse(text)
      return data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text).join('') || 'No response'
    }
    lastErr = text
    if (!text.includes('NOT_FOUND') && !text.includes('"code":404')) break
  }
  throw new Error(lastErr)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { messages, system } = await req.json()
    const contents = (messages || []).map((m: { role: string; content: string }) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }))

    const body: Record<string, unknown> = { contents }
    if (system) body.systemInstruction = { parts: [{ text: system }] }

    const text = await geminiGenerate(body)
    return new Response(JSON.stringify({ text }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
