import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')

const CJK_RE = /[一-鿿㐀-䶿]/

const SYSTEM_PROMPT = `You are a Chinese language flashcard generator. Given a user's freeform request, identify the target Chinese character, word, or phrase, then return a JSON flashcard. Return ONLY valid JSON with no markdown, no explanation, no preamble.

JSON shape:
{
  "text": "<hanzi>",
  "pinyin": "<pinyin with tone marks>",
  "meaning": "<concise English meaning>",
  "radical": "<radical hanzi or null>",
  "radical_pinyin": "<radical pinyin or null>",
  "radical_meaning": "<radical English meaning or null>",
  "mnemonic": "<short vivid mnemonic>",
  "example": "<3-5 char example sentence containing the target text>",
  "example_pinyin": "<pinyin for example>",
  "example_english": "<English translation of example>",
  "is_phrase": <true if text is more than one Chinese character, else false>
}

Rules:
- text must contain at least one Chinese character and be no more than 12 characters
- For a single character: fill radical fields using the most memorable component (not necessarily strict Kangxi); write a short vivid component-based mnemonic matching the style of a spaced-repetition deck
- For a multi-character word or phrase: set radical, radical_pinyin, radical_meaning to null; write a mnemonic for the whole word or phrase
- Mnemonics must be short, concrete, and vivid — one or two sentences max
- example must contain the target text verbatim
- example should use simple high-frequency vocabulary; prefer 3-5 characters where natural
- example_pinyin must be full pinyin with tone marks for the entire example sentence
- example_english must be a natural English translation of the example sentence
- If the input has no resolvable Chinese target, return exactly: {"error":"could_not_parse","message":"I couldn't tell which character or word to make a card for. Try e.g. 'add a card for 猫 (cat)'."}`

interface ProposedCard {
  text: string
  pinyin: string
  meaning: string
  radical: string | null
  radical_pinyin: string | null
  radical_meaning: string | null
  mnemonic: string
  example: string
  example_pinyin: string
  example_english: string
  is_phrase: boolean
}

interface ParseError {
  error: 'could_not_parse'
  message: string
}

async function callAnthropic(userInput: string): Promise<ProposedCard | ParseError> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userInput }],
    }),
  })

  if (!res.ok) {
    throw new Error(`Anthropic API error: ${res.status}`)
  }

  const data = await res.json()
  const raw: string = data.content?.[0]?.text ?? ''

  // Strip stray markdown fences
  const cleaned = raw.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim()

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    return { error: 'could_not_parse', message: "I couldn't parse the AI response. Please try again." }
  }

  if (parsed.error === 'could_not_parse') {
    return parsed as ParseError
  }

  return parsed as ProposedCard
}

function validate(card: ProposedCard): string | null {
  if (!card.text || !CJK_RE.test(card.text)) return 'text must contain at least one Chinese character'
  if (card.text.length > 12) return 'text is too long'
  if (!card.pinyin?.trim()) return 'pinyin is required'
  if (!card.meaning?.trim()) return 'meaning is required'
  if (!card.mnemonic?.trim()) return 'mnemonic is required'
  if (!card.example?.trim()) return 'example is required'
  if (!card.example_pinyin?.trim()) return 'example_pinyin is required'
  if (!card.example_english?.trim()) return 'example_english is required'
  if (!card.example.includes(card.text)) return 'example_does_not_contain_target'
  return null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
    })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405 })
  }

  // Verify JWT
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })
  }

  const supabase = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })
  }

  let input: string
  try {
    const body = await req.json()
    input = body.input?.trim()
    if (!input) throw new Error('empty')
  } catch {
    return new Response(JSON.stringify({ error: 'bad_request', message: 'Provide { "input": "..." }' }), { status: 400 })
  }

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  }

  try {
    let result = await callAnthropic(input)

    // If the example doesn't contain the target, retry once
    if (!('error' in result) && !result.example.includes(result.text)) {
      result = await callAnthropic(`${input}\n\nIMPORTANT: The example sentence MUST contain the exact text "${result.text}".`)
      if (!('error' in result) && !result.example.includes(result.text)) {
        return new Response(
          JSON.stringify({ error: 'could_not_parse', message: "I couldn't generate a valid example sentence. Please try again." }),
          { status: 200, headers: corsHeaders },
        )
      }
    }

    if ('error' in result) {
      return new Response(JSON.stringify(result), { status: 200, headers: corsHeaders })
    }

    const validationError = validate(result)
    if (validationError) {
      return new Response(
        JSON.stringify({ error: 'could_not_parse', message: `I couldn't generate a valid card: ${validationError}. Please try again.` }),
        { status: 200, headers: corsHeaders },
      )
    }

    return new Response(JSON.stringify({ proposed: result }), { status: 200, headers: corsHeaders })
  } catch (err) {
    console.error('generate-custom-card error:', err)
    return new Response(JSON.stringify({ error: 'server_error', message: 'Something went wrong. Please try again.' }), {
      status: 500,
      headers: corsHeaders,
    })
  }
})
