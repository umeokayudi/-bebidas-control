#!/usr/bin/env node
/**
 * Seed dados iniciais nos módulos JBM (tabelas existentes).
 * Uso: HOLDING_SERVICE_ROLE_KEY=xxx node scripts/seed-holding-modules.mjs
 */
import { createClient } from '@supabase/supabase-js'

const URL = process.env.HOLDING_SUPABASE_URL || 'https://fxsakrshmldmkdmbevna.supabase.co'
const KEY = process.env.HOLDING_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ4c2FrcnNobWxkbWtkbWJldm5hIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTEyNjAxMSwiZXhwIjoyMDk2NzAyMDExfQ.dFpBZGlulIp99ecHTSPA0izIRjNSi3NRR1BioZhUBZ0'

const sb = createClient(URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } })

async function hasRows(table, filter = () => true) {
  const { data } = await sb.from(table).select('id').limit(5)
  return (data || []).filter(filter).length > 0
}

async function main() {
  console.log('\n🌱 Seed JBM Holding modules\n')

  if (!(await hasRows('hr_placements'))) {
    const { error } = await sb.from('hr_placements').insert([
      {
        candidate_name: 'Pedro Yamada',
        client_company: 'Restaurante Kodama Kinshicho',
        position: 'Limpeza noturna',
        placement_date: '2026-07-01',
        fee: 45000,
        daily_rate: 12000,
        work_days_per_month: 22,
        status: 'active',
        notes: 'Colocação via JBM HR — empreiteira',
      },
      {
        candidate_name: 'Ana Costa',
        client_company: 'On The Planet',
        position: 'Supervisora limpeza',
        placement_date: '2026-06-15',
        fee: 60000,
        daily_rate: 15000,
        work_days_per_month: 20,
        status: 'active',
        notes: 'Gestão equipe KuriPuro',
      },
    ])
    if (error) console.log('⚠️  placements:', error.message)
    else console.log('✅ hr_placements (2)')
  } else console.log('⏭️  hr_placements já tem dados')

  const { count } = await sb.from('jbm_financeiro').select('id', { count: 'exact', head: true }).eq('unit', 'HR')
  if (!count) {
    const today = new Date().toISOString().slice(0, 10)
    const rows = [
      {
        unit: 'HR', type: 'receita', category: 'apresentacao', amount: 50000, date: '2026-08-05', due_date: '2026-08-20', paid: false,
        description: JSON.stringify({ module: 'hr_presentation', candidate_name: 'Carlos Mendes', client_company: 'Atomic Bar', position: 'Bartender', status: 'realizada', expected_fee: 50000, notes: 'Apresentação para bar' }),
      },
      {
        unit: 'HR', type: 'receita', category: 'comissao', amount: 50000, date: today, due_date: '2026-08-25', paid: false,
        description: JSON.stringify({ module: 'hr_commission', comm_type: 'apresentacao', candidate_name: 'Carlos Mendes', client_company: 'Atomic Bar', status: 'pendente' }),
      },
      {
        unit: 'HR', type: 'receita', category: 'comissao', amount: 45000, date: today, due_date: '2026-09-01', paid: false,
        description: JSON.stringify({ module: 'hr_commission', comm_type: 'colocacao', candidate_name: 'Pedro Yamada', client_company: 'Kodama Kinshicho', status: 'pendente' }),
      },
      {
        unit: 'Logistica', type: 'receita', category: 'frete', amount: 28000, date: '2026-08-17', due_date: '2026-08-17', paid: false,
        description: JSON.stringify({ module: 'logistics', reference: 'LOG-001', client_name: 'Atomic Bar', route_description: 'Depósito JBM → Atomic Bar Kinshicho', revenue: 28000, cost: 12000, commission: 8000, commission_status: 'pendente', status: 'concluido' }),
      },
      {
        unit: 'Logistica', type: 'receita', category: 'frete', amount: 15000, date: '2026-08-10', due_date: '2026-08-10', paid: true,
        description: JSON.stringify({ module: 'logistics', reference: 'LOG-002', client_name: 'On The Planet', route_description: 'Entrega materiais limpeza', revenue: 15000, cost: 6000, commission: 4000, commission_status: 'pago', status: 'concluido' }),
      },
      {
        unit: 'Investimentos', type: 'despesa', category: 'investimento', amount: 150000, date: '2026-06-20', paid: false,
        description: JSON.stringify({ module: 'investment', person_name: 'Maria Santos', person_unit: 'HR', investment_type: 'formacao', expected_return_amount: 200000, status: 'ativo', notes: 'Curso japonês + visto' }),
      },
    ]
    const { data: inserted, error } = await sb.from('jbm_financeiro').insert(rows).select('id,category')
    if (error) console.log('⚠️  jbm_financeiro:', error.message)
    else {
      console.log('✅ jbm_financeiro (' + inserted.length + ')')
      const invId = inserted.find(r => r.category === 'investimento')?.id
      if (invId) {
        await sb.from('jbm_financeiro').insert({
          unit: 'Investimentos', type: 'receita', category: 'retorno', amount: 35000, date: '2026-08-01', paid: true,
          description: JSON.stringify({ module: 'investment_return', investment_id: invId, person_name: 'Maria Santos', person_unit: 'HR', source: 'trabalho', notes: 'Primeiro retorno mensal' }),
        })
        console.log('✅ retorno investimento')
      }
    }
  } else console.log('⏭️  jbm_financeiro HR já tem dados')

  console.log('\n✅ Seed concluído\n')
}

main().catch(e => { console.error('❌', e.message); process.exit(1) })
