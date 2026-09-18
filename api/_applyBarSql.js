import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const FILES = [
  'ATOMIC_POS_SCHEMA.sql',
  'POS_EXTENDED_SCHEMA.sql',
  'BAR_ACCESS_SCHEMA.sql',
  'BAR_CRM_SPACES_SCHEMA.sql',
]

const TRIGGER_SQL = `
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfis (id, nome, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)),
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'staff')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

alter table public.perfis drop constraint if exists perfis_role_check;
`

function sqlRoot() {
  return join(dirname(fileURLToPath(import.meta.url)), '..')
}

export function bundledBarSql() {
  const root = sqlRoot()
  const chunks = FILES.map(name => {
    try { return `-- FILE ${name}\n` + readFileSync(join(root, name), 'utf8') }
    catch { return `-- missing ${name}` }
  })
  return chunks.join('\n\n') + '\n\n' + TRIGGER_SQL
}

export async function applyBarPosSql() {
  const sql = bundledBarSql()
  const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.SUPABASE_DB_URL
  const pass = process.env.SUPABASE_DB_PASSWORD || process.env.POSTGRES_PASSWORD
  const ref = (process.env.VITE_SUPABASE_URL || 'https://ojirgkqtqvugqktyuhem.supabase.co').match(/https:\/\/([^.]+)/)?.[1]

  if (dbUrl || (pass && ref)) {
    const pg = (await import('pg')).default
    const connectionString = dbUrl || `postgresql://postgres.${ref}:${encodeURIComponent(pass)}@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres`
    const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } })
    await client.connect()
    try {
      await client.query(sql)
      return { ok: true, via: 'postgres' }
    } finally {
      await client.end()
    }
  }

  return {
    ok: false,
    error: 'No DATABASE_URL / SUPABASE_DB_PASSWORD. Run the four SQL files in Supabase SQL Editor.',
    files: FILES,
  }
}
