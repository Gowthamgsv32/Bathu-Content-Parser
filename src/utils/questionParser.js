// Parses one Gemini response into a flat list of questions:
//   { question, options[], correctAnswer, explanation }

function cleanJsonFences(s) {
  s = s.trim()
  s = s.replace(/^```json\s*/i, '')
  s = s.replace(/^```\s*/, '')
  s = s.replace(/```\s*$/, '')
  return s.trim()
}

// Finds the index of the character that closes the bracket opened at
// `start`, tracking string literals/escapes so braces inside quoted text
// don't throw off the depth count.
function findMatchingBracketEnd(s, start) {
  let depth = 0
  let inString = false
  let escape = false

  for (let i = start; i < s.length; i++) {
    const c = s[i]
    if (inString) {
      if (escape) escape = false
      else if (c === '\\') escape = true
      else if (c === '"') inString = false
      continue
    }
    if (c === '"') inString = true
    else if (c === '{' || c === '[') depth++
    else if (c === '}' || c === ']') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

// Fallback for when the model wraps the JSON in prose: collect every
// top-level JSON object/array found, in order.
function extractJsonObjects(text) {
  const results = []
  const s = text.trim()
  let idx = 0

  while (idx < s.length) {
    while (idx < s.length && /\s/.test(s[idx])) idx++
    if (idx >= s.length) break

    if (s[idx] !== '{' && s[idx] !== '[') {
      idx++
      continue
    }

    const end = findMatchingBracketEnd(s, idx)
    if (end === -1) {
      idx++
      continue
    }

    const candidate = s.slice(idx, end + 1)
    try {
      results.push(JSON.parse(candidate))
      idx = end + 1
    } catch {
      idx++
    }
  }

  return results
}

// Normalises whatever shape came back into an array of question objects.
// Accepts { questions: [...] } or a bare [...] array.
function toQuestionArray(parsed) {
  if (Array.isArray(parsed)) return parsed
  if (parsed && Array.isArray(parsed.questions)) return parsed.questions
  return null
}

function isValidQuestion(q) {
  return (
    q &&
    typeof q.question === 'string' &&
    Array.isArray(q.options) &&
    q.options.length >= 2 &&
    typeof q.correctAnswer === 'string'
  )
}

export function countQuestions(data) {
  return data?.questions?.length || 0
}

// Returns { ok, questions: { questions: [...] }, error }. Keeps only the
// well-formed questions and drops malformed ones rather than failing the
// whole batch.
export function parseQuestions(raw) {
  const cleaned = cleanJsonFences(raw)

  let arr = null
  try {
    arr = toQuestionArray(JSON.parse(cleaned))
  } catch {
    // Model added stray text around the JSON — try the bracket scanner.
    const objects = extractJsonObjects(raw)
    for (const obj of objects) {
      const candidate = toQuestionArray(obj)
      if (candidate) {
        arr = candidate
        break
      }
    }
  }

  if (!arr) {
    return { ok: false, questions: null, error: 'Could not find a questions array in the response.' }
  }

  const valid = arr.filter(isValidQuestion)
  if (valid.length === 0) {
    return { ok: false, questions: null, error: 'Response contained no well-formed questions.' }
  }

  return { ok: true, questions: { questions: valid }, error: '' }
}
