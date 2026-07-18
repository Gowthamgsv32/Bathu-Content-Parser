// Port of the desktop app's _split_and_save() parsing logic (minus the
// filesystem writes, which become React state + download buttons instead).

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

// Walks the text collecting every top-level JSON object/array found, in
// order — the fallback path for when Gemini concatenates blobs without the
// "=== FILE N: ===" markers, or drops them entirely.
export function extractJsonObjects(text) {
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

export function countFile1Questions(data) {
  if (!data?.modules?.length) return 0
  const m = data.modules[0]
  return (
    (m.learnByMcq?.questions?.length || 0) +
    (m.practice?.questions?.length || 0) +
    (m.finalExam?.questions?.length || 0)
  )
}

// Splits and validates one Gemini response into FILE 1 / FILE 2. `savedFile1`
// is the best FILE 1 seen across previous retries for this batch — a new
// attempt that produces a strictly worse (fewer-question) FILE 1 keeps the
// previous one instead of regressing.
export function splitAndValidate(raw, savedFile1) {
  const pat1 = /=== FILE 1:.*?===/i
  const pat2 = /=== FILE 2:.*?===/i
  const m1 = pat1.exec(raw)
  const m2 = pat2.exec(raw)

  let json1Raw = null
  let json2Raw = null

  if (m1 && m2 && m1.index < m2.index) {
    json1Raw = cleanJsonFences(raw.slice(m1.index + m1[0].length, m2.index))
    json2Raw = cleanJsonFences(raw.slice(m2.index + m2[0].length))
  } else {
    const objects = extractJsonObjects(raw)
    if (objects.length >= 2) {
      json1Raw = JSON.stringify(objects[0])
      json2Raw = JSON.stringify(objects[1])
    } else if (objects.length === 1) {
      json1Raw = JSON.stringify(objects[0])
      json2Raw = '{}'
    } else {
      return { ok: false, file1: savedFile1 || null, file2: null, error: 'Could not extract any JSON from the response.' }
    }
  }

  let newFile1
  try {
    const candidate = JSON.parse(json1Raw)
    const newCount = countFile1Questions(candidate)

    if (newCount === 0 && savedFile1) {
      newFile1 = savedFile1
    } else if (savedFile1 && countFile1Questions(savedFile1) > newCount) {
      newFile1 = savedFile1
    } else {
      newFile1 = candidate
    }
  } catch (err) {
    return {
      ok: false,
      file1: savedFile1 || null,
      file2: null,
      error: `FILE 1 JSON parse error: ${err.message}`,
      brokenText: json1Raw,
    }
  }

  let data2
  try {
    data2 = JSON.parse(json2Raw)
  } catch (err) {
    return {
      ok: false,
      file1: newFile1,
      file2: null,
      error: `FILE 2 JSON parse error: ${err.message}`,
      brokenText: json2Raw,
    }
  }

  return { ok: true, file1: newFile1, file2: data2 }
}
