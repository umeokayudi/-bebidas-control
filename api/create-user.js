import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { email, password, nome, role, bar_id } = req.body
  if (!email || !password || !nome || !role) return res.status(400).json({ error: 'Missing fields' })

  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    const response = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`
      },
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: { nome }
      })
    })

    const data = await response.json()
    if (!response.ok) return res.status(400).json({ error: data.message || data.msg || JSON.stringify(data) })

    const uid = data.id

    const perfilRes = await fetch(`${supabaseUrl}/rest/v1/perfis`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify({ id: uid, nome, email, role, bar_id: bar_id || null })
    })

    if (!perfilRes.ok) {
      const perfilErr = await perfilRes.json()
      return res.status(400).json({ error: perfilErr.message || 'Perfil creation failed' })
    }

    return res.status(200).json({ success: true, id: uid })
  } catch(e) {
    return res.status(500).json({ error: e.message })
  }
}
