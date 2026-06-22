/**
 * One-off seed script: reads characters.json and upserts into Supabase `characters` table.
 * Usage: npx tsx scripts/seed-characters.ts
 * Requires VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env
 * Uses the service role key so it can bypass RLS and write to the characters table.
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { config } from 'dotenv'

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, '../.env') })

const supabaseUrl = process.env.VITE_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey)

const raw = readFileSync(resolve(__dirname, '../characters.json'), 'utf-8')
const characters = JSON.parse(raw) as Array<{
  rank: number
  char: string
  pinyin: string
  meaning: string
  radical: string
  radical_pinyin: string
  radical_meaning: string
  mnemonic: string
  mnemonic_type: 'C' | 'H'
}>

const rows = characters.map((c) => ({
  id: c.rank,
  char: c.char,
  pinyin: c.pinyin,
  meaning: c.meaning,
  radical: c.radical,
  radical_pinyin: c.radical_pinyin,
  radical_meaning: c.radical_meaning,
  mnemonic: c.mnemonic,
  mnemonic_type: c.mnemonic_type,
}))

console.log(`Upserting ${rows.length} characters…`)

const BATCH = 100
for (let i = 0; i < rows.length; i += BATCH) {
  const batch = rows.slice(i, i + BATCH)
  const { error } = await supabase.from('characters').upsert(batch, { onConflict: 'id' })
  if (error) {
    console.error('Error upserting batch starting at', i, error)
    process.exit(1)
  }
  console.log(`  ${Math.min(i + BATCH, rows.length)} / ${rows.length}`)
}

console.log('Done.')
