import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://ojirgkqtqvugqktyuhem.supabase.co'
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qaXJna3F0cXZ1Z3FrdHl1aGVtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1NTkwNTIsImV4cCI6MjA5NjEzNTA1Mn0.nRiZHav9wAY2HRKrO66W9HhY3R5wGZHMM8UH5W4PK_M'

const TAB_ID_KEY = 'bebidas_tab_id'

/** ID único por aba — evita compartilhar login entre abas */
function getTabId() {
  if (typeof sessionStorage === 'undefined') return 'ssr'
  let id = sessionStorage.getItem(TAB_ID_KEY)
  if (!id) {
    id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
    sessionStorage.setItem(TAB_ID_KEY, id)
  }
  return id
}

const projectRef = supabaseUrl.match(/https:\/\/([^.]+)/)?.[1] || 'supabase'

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    // sessionStorage = isolado por aba (localStorage é compartilhado)
    storage: typeof sessionStorage !== 'undefined' ? sessionStorage : undefined,
    // storageKey único por aba = BroadcastChannel não sincroniza entre abas
    storageKey: `sb-${projectRef}-auth-${getTabId()}`,
    persistSession: true,
    autoRefreshToken: true,
  },
})
