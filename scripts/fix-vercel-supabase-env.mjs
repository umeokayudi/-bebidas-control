#!/usr/bin/env node
/**
 * Corrige VITE_SUPABASE_* no Vercel quando estão inválidos (ex.: literal "[SENSITIVE]").
 * Uso: VERCEL_TOKEN=xxx node scripts/fix-vercel-supabase-env.mjs
 */
import { spawnSync } from 'node:child_process'

const TOKEN = process.env.VERCEL_TOKEN
const PROJECT = process.env.BEBIDAS_PROJECT || 'bebidas-control'

const URL = 'https://ojirgkqtqvugqktyuhem.supabase.co'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qaXJna3F0cXZ1Z3FrdHl1aGVtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1NTkwNTIsImV4cCI6MjA5NjEzNTA1Mn0.nRiZHav9wAY2HRKrO66W9HhY3R5wGZHMM8UH5W4PK_M'
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!TOKEN) {
  console.error('❌ VERCEL_TOKEN required')
  process.exit(1)
}
if (!SERVICE) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY required (local env)')
  process.exit(1)
}

function run(args, input) {
  const r = spawnSync('npx', ['vercel', ...args, '--token', TOKEN], {
    input,
    encoding: 'utf8',
    stdio: ['pipe', 'inherit', 'inherit'],
  })
  if (r.status !== 0) process.exit(r.status || 1)
}

const envs = ['production', 'preview', 'development']
for (const name of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) {
  for (const env of envs) {
    run(['env', 'rm', name, env, '--yes'])
  }
}

for (const env of envs) {
  run(['env', 'add', 'VITE_SUPABASE_URL', env, '--yes'], URL)
  run(['env', 'add', 'VITE_SUPABASE_ANON_KEY', env, '--yes'], ANON)
  run(['env', 'add', 'SUPABASE_SERVICE_ROLE_KEY', env, '--yes'], SERVICE)
}

console.log(`\n✅ Supabase env atualizado em ${PROJECT} (${envs.join(', ')})\n`)
