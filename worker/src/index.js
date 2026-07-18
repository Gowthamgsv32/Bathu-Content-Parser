import { buildQuestionPrompt } from './questionPrompts.js'

const ALLOWED_ORIGIN_DEFAULT = 'https://gowthamgsv32.github.io'

function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || ALLOWED_ORIGIN_DEFAULT,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}

function json(env, data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(env) },
  })
}

// GEMINI_API_KEY may hold one key or a comma-separated list. Keeping the
// same variable name means adding more keys is just editing its value in
// the Cloudflare dashboard — no new variable to wire up.
function parseApiKeys(raw) {
  return (raw || '')
    .split(',')
    .map((key) => key.trim())
    .filter(Boolean)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const GENERATION_CONFIG = {
  temperature: 0.4,
  maxOutputTokens: 65536,
  thinkingConfig: { thinkingBudget: 0 },
}

// Tries each key in order. A 429 (quota exceeded) moves on to the next key
// immediately since retrying the same key won't help. A 503 ("the model is
// currently experiencing high demand") is usually a transient overload on
// Google's side, so that key gets one quick retry before falling through to
// the next key. Any other response (success or a real error) is returned
// immediately.
async function callGeminiWithFallback(promptText, apiKeys, generationConfig = GENERATION_CONFIG) {
  let lastError = null

  for (const apiKey of apiKeys) {
    const maxAttempts = 2

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: promptText }] }],
            generationConfig,
          }),
        }
      )

      if (res.status !== 429 && res.status !== 503) {
        return res
      }

      let detail = ''
      try {
        detail = (await res.json())?.error?.message || ''
      } catch {
        // ignore — fall back to the generic message below
      }
      lastError = new Error(
        detail ||
          (res.status === 429
            ? 'Rate limit exceeded for this Gemini API key.'
            : 'Gemini model is temporarily overloaded.')
      )

      if (res.status === 503 && attempt < maxAttempts) {
        await sleep(600)
        continue
      }

      break
    }
  }

  throw lastError || new Error('No Gemini API keys configured.')
}

// Turns one page-batch of PDF text into Health Inspector exam MCQs. Returns
// the raw model text; the frontend parses/validates the { questions: [] } JSON.
async function handleGenerateQuestions(request, env) {
  const { params, pdfText } = await request.json()

  if (!pdfText) {
    return json(env, { error: 'Missing PDF text.' }, 400)
  }

  const apiKeys = parseApiKeys(env.GEMINI_API_KEY)
  if (apiKeys.length === 0) {
    return json(env, { error: 'No Gemini API key configured.' }, 500)
  }

  const prompt = buildQuestionPrompt(params || {}, pdfText)

  let geminiRes
  try {
    geminiRes = await callGeminiWithFallback(prompt, apiKeys)
  } catch (err) {
    return json(env, { error: `Gemini request failed on every API key: ${err.message}` }, 503)
  }

  const geminiBody = await geminiRes.json()
  if (geminiBody.error) {
    return json(env, { error: geminiBody.error.message }, 502)
  }

  const finishReason = geminiBody.candidates?.[0]?.finishReason
  const rawText = geminiBody.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

  if (!rawText) {
    return json(env, { error: `Gemini returned no text (finishReason: ${finishReason || 'unknown'}).` }, 502)
  }

  return json(env, { text: rawText, finishReason })
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(env) })
    }

    const url = new URL(request.url)

    try {
      if (request.method === 'POST' && url.pathname === '/generate-questions') {
        return await handleGenerateQuestions(request, env)
      }
      return json(env, { error: 'Not found.' }, 404)
    } catch (err) {
      return json(env, { error: err.message }, 500)
    }
  },
}
