// Builds the Gemini prompt for generating Health Inspector exam MCQs from a
// batch of PDF page text. Output is a single flat JSON object:
//   { "questions": [ { question, options[4], correctAnswer, explanation } ] }

export function buildQuestionPrompt(params, pdfText) {
  const { questionsPerPage } = params
  const n = Number(questionsPerPage) || 5

  return `You are an expert question setter for the Health Inspector examination.

The SOURCE MATERIAL below contains one or more textbook pages. Each page is
delimited by a line like "===== PAGE 12 =====".

For EACH page, create exactly ${n} multiple-choice questions based strictly on
that page's content. The questions must be relevant to the Health Inspector
exam (public health, sanitation, hygiene, epidemiology, food safety, water
supply and treatment, communicable diseases, vital statistics, occupational
health, health administration, first aid, and related topics).

LANGUAGE: Write ALL text in Tamil (தமிழ்) — the question stem, every option,
the correctAnswer, and the explanation must be in Tamil. Only the JSON keys
stay in English. Technical/scientific terms with no common Tamil word may keep
their English form in parentheses, but the sentence itself must be in Tamil.

Rules for every question:
- A clear, exam-standard question stem, in Tamil.
- Exactly 4 answer options, in Tamil.
- Exactly one option is correct.
- "correctAnswer" must be the FULL TEXT of the correct option and must match
  one of the "options" entries character-for-character.
- A short "explanation" (1-2 sentences) in Tamil saying why that answer is correct.

Return ONLY a single valid JSON object — no markdown, no code fences, no
commentary before or after it — in exactly this shape:

{
  "questions": [
    {
      "question": "string",
      "options": ["string", "string", "string", "string"],
      "correctAnswer": "string",
      "explanation": "string"
    }
  ]
}

Generate ${n} questions per page. Output nothing except the JSON object.

SOURCE MATERIAL:
${pdfText}`
}
