import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const here = path.dirname(fileURLToPath(import.meta.url))
const realClient = path.resolve(here, '../../src/lib/supabase.js')
const mockClient = path.resolve(here, 'mockSupabase.js')

/**
 * Troca o cliente Supabase pelo mock. Os componentes importam por caminho
 * relativo (`../lib/supabase`), então um alias comum não pegaria: é preciso
 * resolver primeiro e comparar o arquivo final.
 */
function useMockSupabase() {
  return {
    name: 'pos-preview-mock-supabase',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (!source.includes('supabase')) return null
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true })
      if (!resolved) return null
      return path.resolve(resolved.id.split('?')[0]) === realClient ? mockClient : null
    },
  }
}

export default defineConfig({
  root: here,
  publicDir: path.resolve(here, '../../public'),
  plugins: [react(), useMockSupabase()],
  server: { port: 5180, host: true },
})
