import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { email, password, nome, role, bar_id } = req.body || {}
  if (!email || !password || !nome || !role) return res.status(400).json({ error: 'Missing fields' })
  if (role === 'cliente' && !bar_id) return res.status(400).json({ error: 'Bar clients must be linked to a bar' })

  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY is not configured in Vercel' })
  }

  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

  try {
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password,
      email_confirm: true,
      user_metadata: { nome },
    })
    if (cErr) return res.status(400).json({ error: cErr.message })

    const uid = created.user.id
    const { error: pErr } = await admin.from('perfis').upsert({
      id: uid,
      nome,
      email: email.trim().toLowerCase(),
      role,
      bar_id: role === 'cliente' ? bar_id : null,
    }, { onConflict: 'id' })

    if (pErr) {
      await admin.auth.admin.deleteUser(uid).catch(() => {})
      return res.status(400).json({ error: 'Profile save failed: ' + pErr.message })
    }

    return res.status(200).json({ success: true, id: uid })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
