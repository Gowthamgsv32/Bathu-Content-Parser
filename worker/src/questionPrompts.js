// Builds the Gemini prompt for generating Health Inspector exam MCQs. The page
// content is supplied to the model as image(s) alongside this text, so the
// prompt tells the model to read the attached page image(s). Output is a single
// flat JSON object:
//   { "questions": [ { question, options[4], correctAnswer, explanation } ] }

export function buildQuestionPrompt(params) {
  const n = Number(params?.questionsPerPage) || 5

  return `You are an expert question setter for the Health Inspector examination.

You are given one or more TEXTBOOK PAGE IMAGES (attached after this text). Read
the content of each page image carefully. The text on the pages may be in Tamil.

For EACH page image, create exactly ${n} multiple-choice questions based strictly
on the content shown in that page. The questions must be relevant to the Health
Inspector exam (public health, sanitation, hygiene, epidemiology, food safety,
water supply and treatment, communicable diseases, vital statistics, occupational
health, health administration, first aid, and related topics).

LANGUAGE: Write ALL text in Tamil (தமிழ்) — the question stem, every option,
the correctAnswer, and the explanation must be in Tamil. Only the JSON keys stay
in English. Technical/scientific terms with no common Tamil word may keep their
English form in parentheses, but the sentence itself must be in Tamil.

Rules for every question:
- Base it ONLY on what actually appears in the page images. Do not invent facts,
  and do not write questions about these instructions.
- A clear, exam-standard question stem, in Tamil.
- Exactly 4 answer options, in Tamil.
- Exactly one option is correct.
- "correctAnswer" must be the FULL TEXT of the correct option and must match one
  of the "options" entries character-for-character.
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

Generate ${n} questions per page image. Output nothing except the JSON object.`
}
