import { createClient } from '@supabase/supabase-js'

function adminClient() {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_SERVICE_ROLE_KEY não configurada')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

async function requireStaff(req, admin) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return { error: 'Não autenticado', status: 401 }

  const { data: { user }, error } = await admin.auth.getUser(token)
  if (error || !user) return { error: 'Sessão inválida', status: 401 }

  const { data: perfil } = await admin.from('perfis').select('role').eq('id', user.id).single()
  if (!perfil || perfil.role === 'cliente') return { error: 'Sem permissão', status: 403 }

  return { user, perfil }
}

/** Compras via service role — contorna RLS quando scripts importam sem criado_por */
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const admin = adminClient()
    const auth = await requireStaff(req, admin)
    if (auth.error) return res.status(auth.status).json({ error: auth.error })

    const month = req.query?.month || ''

    const { data, error } = await admin
      .from('compras')
      .select('*, compras_itens(*)')
      .order('data', { ascending: true })

    if (error) return res.status(400).json({ error: error.message })

    let compras = data || []
    if (month) {
      compras = compras.filter(c => {
        const d = c.data || c.data_compra || ''
        return String(d).slice(0, 7) === month
      })
    }

    return res.status(200).json({ compras })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
