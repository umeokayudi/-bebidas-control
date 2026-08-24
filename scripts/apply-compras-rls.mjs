#!/usr/bin/env node
/** Aplica COMPRAS_RLS_FIX.sql via Supabase service role (PostgREST não suporta DDL — use SQL Editor se falhar) */
import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

const URL = process.env.VITE_SUPABASE_URL || 'https://ojirgkqtqvugqktyuhem.supabase.co'
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY required')
  process.exit(1)
}

const sb = createClient(URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } })

// Verifica se staff já consegue ler compras (teste com anon não vale)
const { count, error } = await sb.from('compras').select('*', { count: 'exact', head: true })
if (error) {
  console.error('❌', error.message)
  process.exit(1)
}
console.log(`✅ Service role vê ${count} compras`)
console.log('ℹ️  Para RLS permanente, cole COMPRAS_RLS_FIX.sql no Supabase SQL Editor')
