/** Webhook de reposição automática quando estoque POS atinge mínimo */

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' })

  const webhookUrl = process.env.POS_REORDER_WEBHOOK_URL || process.env.MAKE_WEBHOOK_URL
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})

  if (!body.bar_id || !Array.isArray(body.items) || !body.items.length) {
    return res.status(400).json({ error: 'bar_id e items são obrigatórios' })
  }

  const payload = {
    event: 'pos_reorder_alert',
    timestamp: new Date().toISOString(),
    bar_id: body.bar_id,
    bar_nome: body.bar_nome || '',
    items: body.items,
  }

  if (!webhookUrl) {
    return res.status(200).json({ ok: true, webhook: 'skipped', reason: 'POS_REORDER_WEBHOOK_URL não configurado', payload })
  }

  try {
    const whRes = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const text = await whRes.text().catch(() => '')
    return res.status(200).json({ ok: true, webhook: 'sent', status: whRes.status, response: text.slice(0, 500) })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
