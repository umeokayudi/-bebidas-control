import { supabase } from './supabase'
import { compraMonthKey } from '../components/utils'

const SELECT = '*, compras_itens(produto_id,nome,custo_unitario)'

/** Carrega compras — tenta Supabase direto; se RLS bloquear, usa API com service role */
export async function loadCompras(opts = {}) {
  const { month } = opts

  const { data: direct, error } = await supabase
    .from('compras')
    .select(SELECT)
    .order('data', { ascending: true })

  let all = (!error && direct?.length) ? direct : null

  if (!all?.length) {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.access_token) {
      try {
        const res = await fetch('/api/compras', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
        if (res.ok) {
          const json = await res.json()
          all = json.compras || []
        }
      } catch { /* fallback abaixo */ }
    }
  }

  all = all || direct || []
  if (!month) return all
  return all.filter(c => compraMonthKey(c) === month)
}

/** Todas as compras (histórico completo para custo unitário) */
export async function loadAllCompras() {
  return loadCompras()
}
