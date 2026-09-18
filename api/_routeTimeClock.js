/** Ponto eletrônico: só no tablet pareado, só dentro do GPS do bar. */

import { drinksAdminClient } from './_supabaseAdmin.js'
import { requireBarAccount, bearerToken } from './_requireStaff.js'
import { secretsMatch, hashSecret } from './_hash.js'
import { isInsideGeofence } from './_geo.js'

function bodyOf(req) {
  return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
}

async function loadBar(admin, barId) {
  const { data, error } = await admin.from('bars').select('id,nome,lat,lng,geofence_m,tablet_token_hash').eq('id', barId).single()
  if (error || !data) return null
  return data
}

function tabletOk(bar, token) {
  if (!bar?.tablet_token_hash || !token) return false
  return secretsMatch(String(token).trim().toUpperCase(), bar.tablet_token_hash)
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()

  let admin
  try { admin = drinksAdminClient() } catch (e) {
    return res.status(500).json({ error: e.message })
  }

  try {
    if (req.method === 'GET') {
      const q = req.query || {}
      if (q.roster === '1' || q.action === 'roster') {
        const bar = await loadBar(admin, q.bar_id)
        if (!bar) return res.status(404).json({ error: 'Bar not found' })
        if (!tabletOk(bar, q.tabletToken || q.tablet_token)) {
          return res.status(403).json({ error: 'Tablet not paired' })
        }
        const { data } = await admin.from('perfis')
          .select('id,nome,cargo,role')
          .eq('bar_id', bar.id)
          .in('role', ['caixa', 'bar_staff', 'cliente'])
          .eq('ativo', true)
          .order('nome')
        return res.status(200).json({ staff: (data || []).map(s => ({ id: s.id, nome: s.nome, cargo: s.cargo || s.role })) })
      }

      const auth = await requireBarAccount(req, admin)
      if (auth.error) return res.status(auth.status).json({ error: auth.error })
      const from = q.from
      const to = q.to
      let query = admin.from('time_clock').select('*').eq('bar_id', auth.perfil.bar_id).order('punched_at', { ascending: false }).limit(500)
      if (auth.perfil.role !== 'cliente') query = query.eq('staff_id', auth.user.id)
      if (from) query = query.gte('punched_at', from)
      if (to) query = query.lte('punched_at', to)
      const { data, error } = await query
      if (error) return res.status(400).json({ error: error.message })
      return res.status(200).json({ punches: data || [] })
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST or GET' })

    const body = bodyOf(req)
    const tipo = body.tipo === 'out' ? 'out' : 'in'
    const tabletToken = String(body.tabletToken || body.tablet_token || '').trim().toUpperCase()

    let barId = body.bar_id
    let staffId = body.staff_id
    const auth = bearerToken(req) ? await requireBarAccount(req, admin) : null
    if (auth && !auth.error) {
      barId = auth.perfil.bar_id
      if (!staffId || auth.perfil.role !== 'cliente') staffId = auth.user.id
    }

    if (!barId || !staffId) return res.status(400).json({ error: 'bar_id and staff_id required' })

    const bar = await loadBar(admin, barId)
    if (!bar) return res.status(404).json({ error: 'Bar not found' })

    const deviceOk = tabletOk(bar, tabletToken)
    if (!deviceOk) {
      return res.status(403).json({ error: 'Clock-in only on the paired bar tablet', code: 'tablet' })
    }

    const geo = isInsideGeofence({
      lat: body.lat,
      lng: body.lng,
      barLat: bar.lat,
      barLng: bar.lng,
      radiusM: bar.geofence_m,
      accuracyM: body.accuracy,
    })
    if (!geo.ok) {
      return res.status(403).json({
        error: geo.reason === 'no_location'
          ? 'Bar GPS not configured'
          : geo.reason === 'accuracy'
            ? 'GPS too imprecise'
            : `Outside bar (${Math.round(geo.distance || 0)}m)`,
        code: geo.reason,
        distance: geo.distance,
      })
    }

    const { data: staff, error: sErr } = await admin.from('perfis')
      .select('id,bar_id,role,clock_pin_hash,ativo,nome')
      .eq('id', staffId)
      .single()
    if (sErr || !staff || staff.bar_id !== bar.id) return res.status(404).json({ error: 'Staff not found' })
    if (staff.ativo === false) return res.status(403).json({ error: 'Staff inactive' })

    const pinOk = secretsMatch(String(body.pin || ''), staff.clock_pin_hash)
    if (!pinOk) {
      return res.status(403).json({ error: 'Invalid PIN', code: 'pin' })
    }

    const { data: last } = await admin.from('time_clock')
      .select('tipo')
      .eq('bar_id', bar.id)
      .eq('staff_id', staffId)
      .order('punched_at', { ascending: false })
      .limit(1)
    const lastTipo = last?.[0]?.tipo
    if (tipo === 'in' && lastTipo === 'in') {
      return res.status(400).json({ error: 'Already clocked in' })
    }
    if (tipo === 'out' && lastTipo !== 'in') {
      return res.status(400).json({ error: 'Not clocked in' })
    }

    const { data: punch, error: pErr } = await admin.from('time_clock').insert({
      bar_id: bar.id,
      staff_id: staffId,
      tipo,
      lat: body.lat,
      lng: body.lng,
      accuracy_m: body.accuracy || null,
      distance_m: Math.round(geo.distance),
      tablet_ok: true,
      origem: 'tablet',
    }).select().single()
    if (pErr) return res.status(400).json({ error: pErr.message })

    return res.status(200).json({ ok: true, punch, staff: { id: staff.id, nome: staff.nome } })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
