/**
 * Verifica variáveis necessárias para produção (local + Vercel).
 * Uso: node scripts/check-env.mjs
 */
const checks = [
  { name: 'VITE_SUPABASE_URL', scope: 'client', required: true },
  { name: 'VITE_SUPABASE_ANON_KEY', scope: 'client', required: true },
  { name: 'SUPABASE_SERVICE_ROLE_KEY', scope: 'server', required: true },
  { name: 'GEMINI_API_KEY', scope: 'server', required: true },
]

console.log('\n🔍 JBM Drinks — environment check\n')

let ok = 0
let missing = []

for (const c of checks) {
  const val = process.env[c.name]
  const has = Boolean(val && val.length > 3 && !val.includes('YOUR_') && !val.includes('sua_'))
  if (has) {
    console.log(`✅ ${c.name} (${c.scope})`)
    ok++
  } else {
    console.log(`❌ ${c.name} (${c.scope}) — missing`)
    missing.push(c.name)
  }
}

console.log(`\n${ok}/${checks.length} configured`)

if (missing.length) {
  console.log('\nConfigure no Vercel → Settings → Environment Variables:')
  for (const m of missing) {
    if (m === 'GEMINI_API_KEY') console.log(`   ${m} → https://aistudio.google.com/apikey (mesma do Kuripuro)`)
    else if (m === 'SUPABASE_SERVICE_ROLE_KEY') console.log(`   ${m} → Supabase → Settings → API → service_role`)
    else console.log(`   ${m}`)
  }
  console.log('')
  process.exit(1)
}

console.log('✅ Ready for production\n')
