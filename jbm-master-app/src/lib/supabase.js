import { createClient } from '@supabase/supabase-js'

export const holdingSb = createClient(
  import.meta.env.VITE_HOLDING_SUPABASE_URL || 'https://fxsakrshmldmkdmbevna.supabase.co',
  import.meta.env.VITE_HOLDING_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ4c2FrcnNobWxkbWtkbWJldm5hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU1NjAzNDcsImV4cCI6MjA2MTEzNjM0N30.2LGfHLEeEpNDcVgcMv2-B5bJf0kNAqiZNHaJ_3rfBKk'
)

export const drinksSb = createClient(
  import.meta.env.VITE_DRINKS_SUPABASE_URL || 'https://ojirgkqtqvugqktyuhem.supabase.co',
  import.meta.env.VITE_DRINKS_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qaXJna3F0cXZ1Z3FrdHl1aGVtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1NTkwNTIsImV4cCI6MjA5NjEzNTA1Mn0.nRiZHav9wAY2HRKrO66W9HhY3R5wGZHMM8UH5W4PK_M'
)
