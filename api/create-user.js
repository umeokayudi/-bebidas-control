import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { email, password, nome, role, bar_id } = req.body
  if (!email || !password || !nome || !role) return res.status(400).json({ error: 'Missing fields' })

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  const { data, error } = await supabase.auth.admin.createUser({
    email, password,
    email_confirm: true,
    user_metadata: { nome }
  })
  if (error) return res.status(400).json({ error: error.message })

  await supabase.from('perfis').upsert({
    id: data.user.id, nome, email, role,
    bar_id: bar_id || null
  })

  return res.status(200).json({ success: true, id: data.user.id })
}
