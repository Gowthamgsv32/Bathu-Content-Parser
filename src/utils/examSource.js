// Reads the question sets published by the generator into public/questions/.
// Listing uses the GitHub Contents API (a public repo needs no token); the
// files themselves are fetched from their raw download URLs.

const OWNER = 'Gowthamgsv32'
const REPO = 'Bathu-Content-Parser'
const BRANCH = 'main'
const DIR = 'public/questions'

export async function listQuestionSets() {
  const res = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/contents/${DIR}?ref=${BRANCH}`,
    { headers: { Accept: 'application/vnd.github+json' } }
  )
  // Folder won't exist until the first set is published.
  if (res.status === 404) return []
  if (!res.ok) throw new Error(`Couldn't list question sets (GitHub ${res.status}).`)

  const files = await res.json()
  return files
    .filter((f) => f.type === 'file' && f.name.toLowerCase().endsWith('.json'))
    .map((f) => ({ name: f.name, downloadUrl: f.download_url }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function loadQuestionSet(downloadUrl) {
  const res = await fetch(downloadUrl)
  if (!res.ok) throw new Error(`Couldn't load the question set (${res.status}).`)
  const data = await res.json()
  const questions = Array.isArray(data) ? data : data?.questions
  if (!Array.isArray(questions) || questions.length === 0) {
    throw new Error('This file has no questions.')
  }
  return questions
}
