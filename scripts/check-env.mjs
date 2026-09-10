/**
 * Verifica variáveis necessárias para produção (local + Vercel).
 * Uso: node scripts/check-env.mjs
 */
const DRINKS_REF = 'ojirgkqtqvugqktyuhem'

function serviceRoleRef(key) {
  try {
    const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString())
    return payload.ref || null
  } catch {
    return null
  }
}

const checks = [
  { name: 'VITE_SUPABASE_URL', scope: 'client', required: true },
  { name: 'VITE_SUPABASE_ANON_KEY', scope: 'client', required: true },
  { name: 'SUPABASE_SERVICE_ROLE_KEY', scope: 'server', required: true },
  { name: 'GEMINI_API_KEY', scope: 'server', required: true },
  { name: 'RESEND_API_KEY', scope: 'server', required: false },
  { name: 'EMAIL_FROM', scope: 'server', required: false },
  { name: 'REPORT_EMAIL_RECIPIENTS', scope: 'server', required: false },
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

const srKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (srKey && srKey.length > 3) {
  const ref = serviceRoleRef(srKey)
  if (ref && ref !== DRINKS_REF) {
    console.log(`\n❌ SUPABASE_SERVICE_ROLE_KEY is for project "${ref}", expected "${DRINKS_REF}" (Drinks)`)
    console.log('   Vercel → bebidas-control → use service_role from ojirgkqtqvugqktyuhem, NOT Holding\n')
    process.exit(1)
  }
}

if (missing.length) {
  console.log('\nConfigure no Vercel → Settings → Environment Variables:')
  for (const m of missing) {
    if (m === 'GEMINI_API_KEY') console.log(`   ${m} → https://aistudio.google.com/apikey (mesma do Kuripuro)`)
    else if (m === 'SUPABASE_SERVICE_ROLE_KEY') console.log(`   ${m} → Supabase → Settings → API → service_role`)
    else if (m === 'RESEND_API_KEY') console.log(`   ${m} → https://resend.com/api-keys`)
    else if (m === 'EMAIL_FROM') console.log(`   ${m} → verified sender in Resend (e.g. JBM Drinks <billing@yourdomain.com>)`)
    else if (m === 'REPORT_EMAIL_RECIPIENTS') console.log(`   ${m} → comma-separated admin emails for daily report cron`)
    else console.log(`   ${m}`)
  }
  console.log('')
  process.exit(1)
}

console.log('✅ Ready for production\n')
