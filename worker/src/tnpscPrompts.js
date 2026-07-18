// Direct port of the Python desktop app's build_prompt() — same schema,
// same wording, same Tamil examples. Mechanically converted from the f-string
// so the wording matches exactly (only variable interpolation syntax changed).
const SUBJECT_NAMES = {
  Ta: 'Tamil',
  Hi: 'History',
  Po: 'Polity',
  Ge: 'Geography',
  Sci: 'Science',
  SS: 'Social Science',
}

export function buildTnpscPrompt(params, pdfText) {
  const {
    subjectCode: sc,
    standard: std,
    term,
    chapter: ch,
    section: sec,
    language: lang,
    practiceCount: pc,
    finalCount: fc,
    qbCount: qbc,
  } = params

  const chapterId = `${sc}-${std}-${term}-${ch}-${sec}`
  const file1Name = `${chapterId}.json`
  const file2Name = `${chapterId}-qb.json`
  const subjectFull = SUBJECT_NAMES[sc] || sc
  const langCode = lang === 'Tamil' ? 'ta' : lang === 'English' ? 'en' : 'ta+en'
  const createdDate = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')

  return `You are a senior TNPSC exam content expert and Tamil Nadu state board textbook specialist.
Your job is to read the PDF text provided at the end and convert it into two production-ready JSON files for the TNPSC Learning App.

Think like an examiner, not a teacher. Every content block must teach a fact TNPSC will test.
Every question must be something a serious TNPSC aspirant needs to practice.

═══════════════════════════════════════════
CONFIRMED PARAMS (already filled — do NOT change these)
═══════════════════════════════════════════
SUBJECT_CODE : ${sc}
STANDARD     : ${std}
TERM         : ${term}
CHAPTER      : ${ch}
SECTION      : ${sec}
LANGUAGE     : ${lang}
SUBJECT_FULL : ${subjectFull}
LANG_CODE    : ${langCode}
CREATED_DATE : ${createdDate}

Derived (use exactly):
  chapterId  = "${chapterId}"
  FILE 1 name = "${file1Name}"
  FILE 2 name = "${file2Name}"

═══════════════════════════════════════════
STEP 1 — READ PDF FULLY BEFORE GENERATING
═══════════════════════════════════════════
Read every page completely.
Identify: chapter title, unit, author/poet names, sub-sections, poems, passages, tables,
highlight boxes (தெரியுமா, கற்பவை கற்றபின், நூல் வெளி, exam tips).
Note every TNPSC-testable fact: names, years, titles, terms, classifications.

COUNT TARGETS:
  practice questions  : EXACTLY ${pc}  — not one more, not one less
  finalExam questions : EXACTLY ${fc}  — not one more, not one less
  qb.json questions   : EXACTLY ${qbc} — not one more, not one less
  learnByMcq          : scale by page count —
      Pages 1-2 → 10-14   |   Pages 3-4 → 18-22
      Pages 5-6 → 22-25   |   Pages 7+  → 25

NEVER pad with weak questions. If content is genuinely thin, synthesise cross-page /
inference / application questions to reach the target rather than lowering quality.

═══════════════════════════════════════════
STEP 2 — TEXT FORMATTING TAGS
═══════════════════════════════════════════
<H>text</H> → Highlighter — headings, key terms
<B>text</B> → Bold        — names, dates, places, important facts
<U>text</U> → Underline   — exam tips, definitions
<I>text</I> → Italic      — book titles, poem titles, journal names
Every TNPSC-testable fact MUST be tagged. Do not over-tag plain prose.

═══════════════════════════════════════════
STEP 3 — ID NAMING (use chapterId = ${chapterId})
═══════════════════════════════════════════
LearnByMCQ : ${chapterId}-{PAGE}-{Q_NO}   e.g. ${chapterId}-2-1
Practice   : ${chapterId}-{PAGE}-P{NO}    e.g. ${chapterId}-2-P1
FinalExam  : ${chapterId}-{PAGE}-E{NO}    e.g. ${chapterId}-2-E1
QB         : ${chapterId}-QB-{001}          e.g. ${chapterId}-QB-001
All IDs MUST be unique across the entire output. QB uses 3-digit zero-padded numbers.

═══════════════════════════════════════════
STEP 4 — EXACT JSON SCHEMA FOR EVERY QUESTION TYPE
═══════════════════════════════════════════
COMMON FIELDS (present in ALL question types):
"id" (string) · "page" (number) · "questionType" (string) · "difficulty" ("easy"|"medium"|"hard")
"pageRefs" (array of page numbers, MANDATORY) · "isStarred" (false) · "isPrevYear" (false)
"explanation" (array of objects, MANDATORY for ALL types)

EXPLANATION FORMAT:
"explanation": [
  { "type": "paragraph", "text": "One clear sentence explaining why the correct answer is right." }
]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TYPE 1: single_correct
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{
  "id": "${chapterId}-2-1",
  "page": 2,
  "questionType": "single_correct",
  "difficulty": "easy",
  "pageRefs": [2],
  "isStarred": false,
  "isPrevYear": false,
  "question": [
    { "type": "paragraph", "text": "'அழகார்ந்த செந்தமிழே!' பாடலை இயற்றியவர் யார்?" }
  ],
  "options": [
    { "id": "A", "text": "பாவலரேறு பெருஞ்சித்திரனார்" },
    { "id": "B", "text": "கண்ணதாசன்" },
    { "id": "C", "text": "பாரதியார்" },
    { "id": "D", "text": "நாமக்கல் கவிஞர்" }
  ],
  "correctAnswer": ["A"],
  "explanation": [
    { "type": "paragraph", "text": "பாவலரேறு பெருஞ்சித்திரனார் இயற்றிய கனிச்சாறு தொகுப்பில் இப்பாடல் இடம்பெற்றுள்ளது." }
  ]
}
RULES:
  → "question" is ALWAYS an array of objects, never a plain string
  → For poem-based questions add a poem_excerpt object BEFORE the question paragraph:
    { "type": "poem_excerpt", "title": "poem title", "lines": ["line1","line2"] }
  → "options" always exactly 4 items with ids A, B, C, D
  → "correctAnswer" always an array with one id e.g. ["B"]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TYPE 2: true_false
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{
  "id": "${chapterId}-2-2",
  "page": 2,
  "questionType": "true_false",
  "difficulty": "easy",
  "pageRefs": [2],
  "isStarred": false,
  "isPrevYear": false,
  "question": [
    { "type": "paragraph", "text": "பெருஞ்சித்திரனாரின் நூல்கள் நாட்டுடைமையாக்கப்பட்டுள்ளன." }
  ],
  "correctAnswer": ["True"],
  "explanation": [
    { "type": "paragraph", "text": "நூல் வெளி பகுதியில் தெளிவாக கூறப்பட்டுள்ளது." }
  ]
}
RULES:
  → "question" is ALWAYS an array of objects
  → "correctAnswer" is ["True"] or ["False"] — no other values
  → NO "options" field
  → "explanation" MANDATORY

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TYPE 3: fill_in_the_blank
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{
  "id": "${chapterId}-2-3",
  "page": 2,
  "questionType": "fill_in_the_blank",
  "difficulty": "easy",
  "pageRefs": [2],
  "isStarred": false,
  "isPrevYear": false,
  "question": [
    { "type": "paragraph", "text": "'அன்னை மொழியே' பாடல் பெருஞ்சித்திரனாரின் __________ என்னும் தொகுப்பில் உள்ளது." }
  ],
  "correctAnswer": ["கனிச்சாறு (தொகுதி 1)"],
  "explanation": [
    { "type": "paragraph", "text": "கனிச்சாறு (தொகுதி 1) என்பது பெருஞ்சித்திரனாரின் கவிதை தொகுப்பு நூல்." }
  ]
}
RULES:
  → Blank written as __________ (10 underscores)
  → "correctAnswer" array with one answer string
  → NO "options" field · "explanation" MANDATORY

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TYPE 4: multiple_correct
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{
  "id": "${chapterId}-2-4",
  "page": 2,
  "questionType": "multiple_correct",
  "difficulty": "medium",
  "pageRefs": [2],
  "isStarred": false,
  "isPrevYear": false,
  "question": [
    { "type": "paragraph", "text": "பெருஞ்சித்திரனார் தமிழுணர்வை பரப்பிய இதழ்கள் எவை?" }
  ],
  "options": [
    { "id": "A", "text": "தென்மொழி" },
    { "id": "B", "text": "தமிழ்ச்சிட்டு" },
    { "id": "C", "text": "குமுதம்" },
    { "id": "D", "text": "ஆனந்த விகடன்" }
  ],
  "correctAnswer": ["A", "B"],
  "explanation": [
    { "type": "paragraph", "text": "தென்மொழி மற்றும் தமிழ்ச்சிட்டு இதழ்கள் வழியாக தமிழுணர்வைப் பரப்பினார்." }
  ]
}
RULES:
  → "correctAnswer" array with 2 or 3 correct ids
  → VARY combination: ["A","C"], ["B","D"], ["A","B","D"], ["B","C"], ["A","C","D"] — not always ["A","B"]
  → "explanation" MANDATORY

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TYPE 5: statement_based
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{
  "id": "${chapterId}-2-5",
  "page": 2,
  "questionType": "statement_based",
  "difficulty": "medium",
  "pageRefs": [2, 3],
  "isStarred": false,
  "isPrevYear": false,
  "question": [
    { "type": "paragraph", "text": "கீழ்க்காணும் கூற்றுகளில் சரியானவை எவை?" },
    { "type": "statement", "index": 1, "text": "Precise factual statement — TRUE" },
    { "type": "statement", "index": 2, "text": "Precise factual statement — TRUE" },
    { "type": "statement", "index": 3, "text": "Plausible but INCORRECT statement — common misconception" }
  ],
  "options": [
    { "id": "A", "text": "1 மட்டும் சரி" },
    { "id": "B", "text": "1 மற்றும் 2 சரி" },
    { "id": "C", "text": "2 மற்றும் 3 சரி" },
    { "id": "D", "text": "அனைத்தும் சரி" }
  ],
  "correctAnswer": ["B"],
  "explanation": [
    { "type": "paragraph", "text": "கூற்று 1 சரி, கூற்று 2 சரி, கூற்று 3 தவறு — காரணம் விளக்கம்." }
  ]
}
RULES:
  → Always exactly 3 statements; statement 3 is the misconception (never statement 1)
  → ROTATE correct combination: "1 மட்டும் சரி" | "1 மற்றும் 2 சரி" | "2 மற்றும் 3 சரி" | "அனைத்தும் சரி" | "1 மற்றும் 3 சரி"
  → Never the same option answer twice in a row
  → Explanation MUST judge all 3 statements

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TYPE 6: match_the_following
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{
  "id": "${chapterId}-2-6",
  "page": 2,
  "questionType": "match_the_following",
  "difficulty": "medium",
  "pageRefs": [2, 3],
  "isStarred": false,
  "isPrevYear": false,
  "question": [
    { "type": "paragraph", "text": "பொருத்துக (Match the following):" }
  ],
  "pairs": {
    "left":  ["Item 1", "Item 2", "Item 3", "Item 4"],
    "right": ["Shuffled C", "Shuffled A", "Shuffled D", "Shuffled B"]
  },
  "correctAnswer": [
    "Item 1-Match A",
    "Item 2-Match B",
    "Item 3-Match C",
    "Item 4-Match D"
  ],
  "explanation": [
    { "type": "paragraph", "text": "1→A, 2→B, 3→C, 4→D — காரணங்களுடன்." }
  ]
}
RULES:
  → Always exactly 4 pairs
  → right column order MUST be shuffled — NEVER the same order as the correct mapping
  → correctAnswer format: array of "leftItem-rightItem" strings (use exact strings from pairs)
  → "explanation" MANDATORY

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TYPE 7: assertion_reason
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{
  "id": "${chapterId}-2-7",
  "page": 2,
  "questionType": "assertion_reason",
  "difficulty": "hard",
  "pageRefs": [2],
  "isStarred": false,
  "isPrevYear": false,
  "question": [
    { "type": "paragraph", "text": "கீழ்க்காண்பவற்றை படித்து சரியான விடையை தேர்ந்தெடு." },
    { "type": "assertion", "text": "A precise, testable claim about the topic." },
    { "type": "reason", "text": "A factual statement that may or may not explain the assertion." }
  ],
  "options": [
    { "id": "A", "text": "A மற்றும் R இரண்டும் சரி; R ஆனது A-ஐ விளக்குகிறது" },
    { "id": "B", "text": "A மற்றும் R இரண்டும் சரி; ஆனால் R ஆனது A-ஐ விளக்கவில்லை" },
    { "id": "C", "text": "A சரி; R தவறு" },
    { "id": "D", "text": "A தவறு; R சரி" }
  ],
  "correctAnswer": ["A"],
  "explanation": [
    { "type": "paragraph", "text": "Assertion சரி/தவறு — காரணம். Reason சரி/தவறு — காரணம். R ஆனது A-ஐ விளக்குகிறதா இல்லையா." }
  ]
}
RULES:
  → Options text MUST be exactly the 4 Tamil strings above (copy verbatim)
  → ROTATE correctAnswer across A, B, C, D — not always A
  → Explanation MUST evaluate both A and R, then the relationship

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
POEM IN A QUESTION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
When a question is about a poem, include the excerpt FIRST, then the question:
"question": [
  { "type": "poem_excerpt", "title": "poem title", "author": "poet", "lines": ["line1","line2"] },
  { "type": "paragraph", "text": "question about the poem above" }
]
NEVER use "இப்பாடலில்" without a poem_excerpt object in the same question.

═══════════════════════════════════════════
STEP 5 — CONTENT BLOCKS
═══════════════════════════════════════════
Block types: title | paragraph | section | poem | highlight | image | table | author_info | exam_special

TITLE:        { "type":"title", "page":2, "text":"<H>அன்னை மொழியே</H>" }
PARAGRAPH:    { "type":"paragraph", "page":2, "text":"..." }   (max 3-4 sentences, tag key facts)
SECTION:      { "type":"section", "page":2, "title":"<H>நூல் வெளி</H>", "text":"..." }

POEM (include EVERY line from PDF, always include author):
{
  "type": "poem", "page": 2,
  "title": "<H>அழகார்ந்த செந்தமிழே!</H>",
  "author": "<B>பாவலரேறு பெருஞ்சித்திரனார்</B>",
  "lines": ["அன்னை மொழியே! அழகார்ந்த செந்தமிழே!", "முன்னைக்கும் முன்னை முகிழ்த்த நறுங்கனியே!"]
}

HIGHLIGHT:
{ "type":"highlight", "page":3, "highlightType":"exam_tip", "text":"<U>...</U>" }
  highlightType: "exam_tip" | "note" | "did_you_know" | "author_info"

TABLE:
{ "type":"table", "page":4, "title":"<H>...</H>", "headers":["col1","col2"], "rows":[["a","b"],["c","d"]] }

IMAGE:
{ "type":"image", "page":2, "imageType":"illustration", "url":"", "caption":"..." }

AUTHOR_INFO (for நூல் வெளி):
{
  "type":"author_info", "page":3,
  "name":"<B>பாவலரேறு பெருஞ்சித்திரனார்</B>",
  "realName":"<B>துரை. இராசமாணிக்கம்</B>",
  "works":["<I>கனிச்சாறு</I>","<I>நூறாசிரியம்</I>"],
  "awards":[], "note":"இவரது நூல்கள் <B>நாட்டுடைமையாக்கப்பட்டுள்ளன</B>."
}

EXAM_SPECIAL (for தெரியுமா / interesting facts):
{ "type":"exam_special", "page":5, "highlightType":"did_you_know", "text":"... <B>fact</B> ..." }

Every content block must contain at least one tagged fact. Skip pure explanatory prose with no testable fact.

═══════════════════════════════════════════
STEP 6 — QUESTION PURPOSE AND TYPE DISTRIBUTION
═══════════════════════════════════════════
LEARNBYMCQ — immediate comprehension; answer directly in the content shown.
  Mix: 35% single_correct, 20% true_false, 20% fill_in_the_blank, 15% multiple_correct, 10% statement_based.
  NO match_the_following. NO assertion_reason. Never reference a poem without naming it / poem_excerpt.

PRACTICE (EXACTLY ${pc}) — apply and connect.
  MANDATORY: min 2 match_the_following, min 1 assertion_reason.
  Mix: 25% match_the_following, 20% single_correct, 20% statement_based, 20% multiple_correct, 15% assertion_reason.

FINALEXAM (EXACTLY ${fc}) — simulate real TNPSC exam.
  All 7 types appear. Tricky but plausible distractors. Include ≥1 "எது பொருந்தாது?" exception question,
  ≥1 cross-page question, ≥1 trap question, ≥1 assertion_reason with answer B or C (not A).

QUESTIONBANK (EXACTLY ${qbc}) — pure TNPSC standard.
  All 7 types. 40% easy / 40% medium / 20% hard. explanation + pageRefs mandatory.
  Different angle from learnByMcq. Include ≥2 sequence, ≥2 exception, ≥2 cross-page synthesis questions.

═══════════════════════════════════════════
STEP 7 — ANSWER POSITION RANDOMIZATION
═══════════════════════════════════════════
single_correct: rotate B→D→A→C→B... never same position 2+ times in a row.
multiple_correct: vary combinations (not always ["A","B"]).
statement_based: rotate which statements are correct.
match_the_following: right column never in correct order.
assertion_reason: rotate A, B, C, D.

═══════════════════════════════════════════
STEP 8 — DISTRACTOR QUALITY
═══════════════════════════════════════════
NEVER: வன்முறை/போர்/குற்றம் for literature questions · obviously unrelated options ·
       "மேற்கூறிய அனைத்தும்" / "எதுவும் இல்லை" · same distractor repeated across questions.
ALWAYS: real names/titles from another chapter · real figures close but wrong ·
        correct attribute of a different item in same category · reversed fact · common student confusion.
Tamil literature examples: wrong poet right era (கண்ணதாசன் for பெருஞ்சித்திரனார்),
        wrong book right author (நூறாசிரியம் for கனிச்சாறு), wrong title right person (மொழிஞாயிறு for பாவலரேறு).

═══════════════════════════════════════════
STEP 9 — FILE 1 STRUCTURE (${file1Name})
═══════════════════════════════════════════
{
  "meta": {
    "chapterId": "${chapterId}",
    "chapterName": "[extract exact chapter name from PDF — if unclear use first heading found]",
    "unit": "[extract unit from PDF — if unclear use 'Unit ${ch}']",
    "subject": "${subjectFull}",
    "standard": ${std},
    "term": ${term},
    "chapter": ${ch},
    "section": ${sec},
    "language": "${langCode}",
    "board": "TNPSC",
    "academicYear": "2025-26",
    "syllabusVersion": "v1.0",
    "createdAtUtc": "${createdDate}",
    "updatedAtUtc": "${createdDate}"
  },
  "mcqTimeRules": {
    "single_correct": 40, "multiple_correct": 60, "match_the_following": 90,
    "assertion_reason": 60, "true_false": 30, "statement_based": 60,
    "fill_in_the_blank": 35, "negativeMarking": false
  },
  "modules": [
    {
      "content": { "estimatedTimeSeconds": 480, "blocks": [ ...content blocks (Step 5)... ] },
      "learnByMcq": { "questions": [ ...learnByMcq questions (Step 6 mix)... ] },
      "practice": { "questions": [ ...EXACTLY ${pc} practice questions... ] },
      "finalExam": {
        "timeLimitSeconds": 300, "negativeMarking": false,
        "questions": [ ...EXACTLY ${fc} finalExam questions... ]
      }
    }
  ]
}
Split into multiple modules only if the PDF has clearly distinct sub-topics (one module = one sub-section or 2-3 pages).

═══════════════════════════════════════════
STEP 10 — FILE 2 STRUCTURE (${file2Name})
═══════════════════════════════════════════
{
  "chapterId": "${chapterId}",
  "chapterName": "[exact chapter name from PDF]",
  "subject": "${subjectFull}",
  "standard": ${std},
  "term": ${term},
  "chapter": ${ch},
  "section": ${sec},
  "sourcePages": [list every page number in this batch],
  "totalQuestions": ${qbc},
  "questions": [ ...EXACTLY ${qbc} QB questions (Step 6 QB rules)... ]
}

═══════════════════════════════════════════
STEP 11 — OUTPUT FORMAT (CRITICAL — follow exactly)
═══════════════════════════════════════════
Output FILE 1 first, then FILE 2, using these EXACT label lines:

=== FILE 1: ${file1Name} ===
{ complete FILE 1 JSON }
=== FILE 2: ${file2Name} ===
{ complete FILE 2 JSON }

ABSOLUTE RULES:
  ✗ NO markdown code fences (no triple-backtick json, no triple-backtick)
  ✗ NO comments inside JSON · NO trailing commas · NO missing braces/brackets
  ✗ NO explanation text before, between, or after the two JSON blocks
  ✓ practice = EXACTLY ${pc} · finalExam = EXACTLY ${fc} · QB = EXACTLY ${qbc}
  ✓ Every question has: explanation, pageRefs, isStarred (false), isPrevYear (false)
  ✓ All IDs unique, prefixed with "${chapterId}"
  ✓ Poems in content blocks contain every line from the PDF
  ✓ If near the token limit, reduce counts slightly but ALWAYS close every array and object — never truncate mid-JSON

SELF-CHECK BEFORE OUTPUTTING:
  □ Both === FILE 1: === and === FILE 2: === labels present
  □ Each JSON block is independently valid (no trailing commas, all brackets closed)
  □ practice=${pc}, finalExam=${fc}, QB=${qbc}
  □ All 7 types used in finalExam and QB
  □ Correct-answer positions rotated (not all A)

═══════════════════════════════════════════
PDF TEXT TO PROCESS (only these pages)
═══════════════════════════════════════════
${pdfText}
`
}
