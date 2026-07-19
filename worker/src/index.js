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

// UTF-8 safe base64 (btoa alone mangles multi-byte chars like Tamil). Chunked
// so large payloads don't overflow the call stack.
function toBase64Utf8(str) {
  const bytes = new TextEncoder().encode(str)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
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
async function callGeminiWithFallback(parts, apiKeys, model, generationConfig = GENERATION_CONFIG) {
  let lastError = null

  for (const apiKey of apiKeys) {
    const maxAttempts = 2

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts }],
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

// Turns a page-batch (page images) into Health Inspector exam MCQs. Returns the
// raw model text; the frontend parses/validates the { questions: [] } JSON.
async function handleGenerateQuestions(request, env) {
  const { params, images } = await request.json()

  if (!Array.isArray(images) || images.length === 0) {
    return json(env, { error: 'Missing page images.' }, 400)
  }

  const apiKeys = parseApiKeys(env.GEMINI_API_KEY)
  if (apiKeys.length === 0) {
    return json(env, { error: 'No Gemini API key configured.' }, 500)
  }

  const prompt = buildQuestionPrompt(params || {})
  const parts = [
    { text: prompt },
    ...images.map((data) => ({ inlineData: { mimeType: 'image/jpeg', data } })),
  ]
  const model = env.GEMINI_MODEL || 'gemini-3.5-flash'

  let geminiRes
  try {
    geminiRes = await callGeminiWithFallback(parts, apiKeys, model)
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

// Commits a JSON file to the GitHub repo (public/questions by default) using a
// GITHUB_TOKEN secret. Overwrites the file if it already exists.
async function handlePublishQuestions(request, env) {
  const { filename, data } = await request.json()

  if (!filename || !data) {
    return json(env, { error: 'Missing filename or data.' }, 400)
  }

  const token = env.GITHUB_TOKEN
  if (!token) {
    return json(env, { error: 'No GitHub token configured on the worker (set GITHUB_TOKEN).' }, 500)
  }

  const owner = env.GITHUB_OWNER || 'Gowthamgsv32'
  const repo = env.GITHUB_REPO || 'Bathu-Content-Parser'
  const branch = env.GITHUB_BRANCH || 'main'
  const dir = env.GITHUB_DIR || 'public/questions'

  const safeName = String(filename).replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${dir}/${safeName}`
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`
  const ghHeaders = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'bathu-content-parser',
    'Content-Type': 'application/json',
  }

  // Look up the existing file's blob sha so we overwrite instead of failing.
  let sha
  try {
    const getRes = await fetch(`${apiUrl}?ref=${encodeURIComponent(branch)}`, { headers: ghHeaders })
    if (getRes.status === 200) {
      sha = (await getRes.json()).sha
    } else if (getRes.status !== 404) {
      return json(env, { error: `GitHub read failed (${getRes.status}): ${await getRes.text()}` }, 502)
    }
  } catch (err) {
    return json(env, { error: `GitHub read error: ${err.message}` }, 502)
  }

  const content = toBase64Utf8(JSON.stringify(data, null, 2))
  const putRes = await fetch(apiUrl, {
    method: 'PUT',
    headers: ghHeaders,
    body: JSON.stringify({
      message: `Publish questions: ${safeName}`,
      content,
      branch,
      ...(sha ? { sha } : {}),
    }),
  })

  if (!putRes.ok) {
    return json(env, { error: `GitHub write failed (${putRes.status}): ${await putRes.text()}` }, 502)
  }

  const body = await putRes.json()
  const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`
  const pagesPath = dir.replace(/^public\//, '')
  const pagesUrl = `https://${owner.toLowerCase()}.github.io/${repo}/${pagesPath}/${safeName}`

  return json(env, {
    ok: true,
    path,
    rawUrl,
    pagesUrl,
    htmlUrl: body.content?.html_url || null,
    commit: body.commit?.sha || null,
  })
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
      if (request.method === 'POST' && url.pathname === '/publish-questions') {
        return await handlePublishQuestions(request, env)
      }
      return json(env, { error: 'Not found.' }, 404)
    } catch (err) {
      return json(env, { error: err.message }, 500)
    }
  },
}
