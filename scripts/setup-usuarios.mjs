/**
 * Setup usuários + Atomic Bar via service_role (terminal)
 * Uso: SUPABASE_SERVICE_ROLE_KEY=xxx node scripts/setup-usuarios.mjs [email@atomic.com]
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const URL = process.env.VITE_SUPABASE_URL || 'https://ojirgkqtqvugqktyuhem.supabase.co'
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!KEY) {
  console.error('\n❌ Falta SUPABASE_SERVICE_ROLE_KEY')
  console.error('   Supabase → Settings → API → service_role\n')
  process.exit(1)
}

const admin = createClient(URL, KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const linkEmail = process.argv[2]?.trim().toLowerCase()

async function runSqlFileIfPassword() {
  const dbPass = process.env.SUPABASE_DB_PASSWORD
  if (!dbPass) return false

  let pg
  try {
    pg = (await import('pg')).default
  } catch {
    console.log('⚠️  Instala pg: npm install pg')
    return false
  }

  const ref = URL.match(/https:\/\/([^.]+)/)?.[1]
  const conn = `postgresql://postgres.${ref}:${encodeURIComponent(dbPass)}@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres`
  const dir = dirname(fileURLToPath(import.meta.url))
  const sql = readFileSync(join(dir, '..', 'USUARIOS_SQL.sql'), 'utf8')

  const client = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } })
  await client.connect()
  await client.query(sql)
  await client.end()
  console.log('✅ SQL USUARIOS_SQL.sql executado')
  return true
}

async function main() {
  console.log('\n🔧 Setup usuários JBM / Atomic Bar\n')

  try {
    await runSqlFileIfPassword()
  } catch (e) {
    console.log('⚠️  SQL via DB password falhou:', e.message)
    console.log('   Rode USUARIOS_SQL.sql no Supabase SQL Editor se email/bar falhar.\n')
  }

  // Atomic Bar
  const { data: existingBars } = await admin.from('bars').select('id,nome').ilike('nome', '%atomic%')
  let barId = existingBars?.[0]?.id

  if (!barId) {
    const { data: created, error } = await admin.from('bars').insert({ nome: 'Atomic Bar', cor: '#C19C56' }).select().single()
    if (error) throw new Error('Criar bar: ' + error.message)
    barId = created.id
    console.log('✅ Bar criado: Atomic Bar')
  } else {
    console.log('✅ Bar já existe:', existingBars[0].nome)
  }

  // Sync emails auth → perfis
  const { data: authData, error: authErr } = await admin.auth.admin.listUsers({ perPage: 1000 })
  if (authErr) throw new Error('List auth: ' + authErr.message)

  for (const u of authData.users || []) {
    const { error } = await admin.from('perfis').upsert({
      id: u.id,
      email: u.email,
      nome: u.user_metadata?.nome || u.email?.split('@')[0] || 'User',
    }, { onConflict: 'id' })
    if (error && !error.message.includes('email')) {
      console.log('⚠️  perfil', u.email, ':', error.message)
    }
  }
  console.log('✅ Perfis sincronizados:', (authData.users || []).length)

  const { data: legacyStaff } = await admin.from('perfis').select('id').eq('role', 'funcionario')
  if (legacyStaff?.length) {
    const { error } = await admin.from('perfis').update({ role: 'staff' }).eq('role', 'funcionario')
    if (error) console.log('⚠️  normalize roles:', error.message)
    else console.log('✅ Roles normalizados: funcionario → staff (' + legacyStaff.length + ')')
  }

  // Link email to Atomic
  if (linkEmail) {
    const user = authData.users.find(u => u.email?.toLowerCase() === linkEmail)
    if (!user) {
      console.log('❌ Email não encontrado no Auth:', linkEmail)
      console.log('   Crie o user no site (Users) ou cadastre antes.\n')
    } else {
      const { error } = await admin.from('perfis').upsert({
        id: user.id,
        email: linkEmail,
        nome: user.user_metadata?.nome || linkEmail.split('@')[0],
        role: 'cliente',
        bar_id: barId,
      }, { onConflict: 'id' })
      if (error) throw new Error('Vincular bar: ' + error.message)
      console.log('✅', linkEmail, '→ Atomic Bar (cliente)')
    }
  }

  const { data: perfis } = await admin.from('perfis').select('nome,email,role,bar_id').order('nome')
  console.log('\n📋 Usuários:')
  for (const p of perfis || []) {
    const bar = p.bar_id ? 'linked' : '—'
    console.log(`   ${p.nome || '?'} | ${p.email || '?'} | ${p.role || '?'} | bar:${bar}`)
  }
  console.log('\n✅ Pronto!\n')
}

main().catch(e => {
  console.error('\n❌', e.message, '\n')
  process.exit(1)
})
