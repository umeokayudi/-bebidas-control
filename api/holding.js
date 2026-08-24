import { requireStaff } from './_requireStaff.js'
import { drinksAdminClient } from './_supabaseAdmin.js'

const BUCKET = 'system-private'
const FILE = 'jbm_holding.json'

const DEFAULT_HOLDING = {
  nome: 'JBM Holding',
  custoOportunidadeBasePct: 28,
  capitalDisponivel: 0,
  regraCapital: '',
  negocios: [],
}

export default async function handler(req, res) {
  try {
    const sb = drinksAdminClient()
    const auth = await requireStaff(req, sb)
    if (auth.error) return res.status(auth.status).json({ error: auth.error })

    if (req.method === 'GET') {
      const { data, error } = await sb.storage.from(BUCKET).download(FILE)
      if (error || !data) {
        return res.status(200).json({ profile: DEFAULT_HOLDING })
      }
      const text = await data.text()
      return res.status(200).json({ profile: JSON.parse(text) })
    }

    if (req.method === 'POST') {
      const profile = req.body?.profile
      if (!profile?.nome) {
        return res.status(400).json({ error: 'profile inválido' })
      }
      const { data: buckets } = await sb.storage.listBuckets()
      if (!buckets?.some(b => b.name === BUCKET)) {
        await sb.storage.createBucket(BUCKET, { public: false })
      }
      const { error } = await sb.storage.from(BUCKET).upload(FILE, JSON.stringify(profile), {
        upsert: true,
        contentType: 'application/json',
      })
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json({ ok: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
