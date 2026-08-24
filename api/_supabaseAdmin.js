import { createClient } from '@supabase/supabase-js'

export const DRINKS_SUPABASE_URL = 'https://ojirgkqtqvugqktyuhem.supabase.co'

function resolveDrinksUrl() {
  const raw = process.env.VITE_SUPABASE_URL || ''
  return /^https:\/\/[a-z0-9]+\.supabase\.co/i.test(raw) ? raw : DRINKS_SUPABASE_URL
}

function resolveServiceRoleKey() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!key || key === '[SENSITIVE]') {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not configured. Add it in Vercel → Settings → Environment Variables.'
    )
  }
  return key
}

/** Service-role client for JBM Drinks (bebidas-control). */
export function drinksAdminClient() {
  return createClient(resolveDrinksUrl(), resolveServiceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
