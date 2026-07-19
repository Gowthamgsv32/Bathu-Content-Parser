import { useEffect, useMemo, useState } from 'react'
import { listQuestionSets, loadQuestionSet } from '../utils/examSource'

// Fisher–Yates shuffle on a copy.
function shuffled(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function Exam() {
  const [phase, setPhase] = useState('select') // select | exam | result

  const [sets, setSets] = useState([])
  const [setsLoading, setSetsLoading] = useState(true)
  const [setsError, setSetsError] = useState('')
  const [selectedUrl, setSelectedUrl] = useState('')
  const [shuffle, setShuffle] = useState(true)

  const [loadingExam, setLoadingExam] = useState(false)
  const [setName, setSetName] = useState('')
  const [questions, setQuestions] = useState([])
  const [answers, setAnswers] = useState([])
  const [current, setCurrent] = useState(0)

  async function refreshSets() {
    setSetsLoading(true)
    setSetsError('')
    try {
      const list = await listQuestionSets()
      setSets(list)
      if (list.length > 0) setSelectedUrl((prev) => prev || list[0].downloadUrl)
    } catch (err) {
      setSetsError(err.message)
    } finally {
      setSetsLoading(false)
    }
  }

  useEffect(() => {
    refreshSets()
  }, [])

  async function handleStart() {
    if (!selectedUrl) return
    setLoadingExam(true)
    setSetsError('')
    try {
      const loaded = await loadQuestionSet(selectedUrl)
      const qs = shuffle ? shuffled(loaded) : loaded
      setQuestions(qs)
      setAnswers(Array.from({ length: qs.length }, () => null))
      setCurrent(0)
      setSetName(sets.find((s) => s.downloadUrl === selectedUrl)?.name || 'Exam')
      setPhase('exam')
    } catch (err) {
      setSetsError(err.message)
    } finally {
      setLoadingExam(false)
    }
  }

  function selectOption(qIndex, option) {
    setAnswers((prev) => {
      const next = [...prev]
      next[qIndex] = option
      return next
    })
  }

  const answeredCount = answers.filter((a) => a !== null).length

  const score = useMemo(() => {
    if (phase !== 'result') return 0
    return questions.reduce((sum, q, i) => sum + (answers[i] === q.correctAnswer ? 1 : 0), 0)
  }, [phase, questions, answers])

  function handleSubmit() {
    setPhase('result')
    setCurrent(0)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function handleRetake() {
    setAnswers(Array.from({ length: questions.length }, () => null))
    setCurrent(0)
    setPhase('exam')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function handleBackToSelect() {
    setPhase('select')
    setQuestions([])
    setAnswers([])
  }

  // ---- SELECT PHASE ----
  if (phase === 'select') {
    return (
      <div className="page">
        <section className="welcome-card">
          <h2>Exam</h2>
          <p>Pick a published question set and test yourself. Sets come from the Question Generator's “Publish to GitHub”.</p>
        </section>

        <section className="form-card">
          <div className="result-toolbar" style={{ padding: 0, border: 'none' }}>
            <h3>Question Sets</h3>
            <button type="button" className="btn btn-ghost" onClick={refreshSets} disabled={setsLoading}>
              {setsLoading ? 'Loading…' : 'Refresh'}
            </button>
          </div>

          {setsError && <div className="alert alert-error">{setsError}</div>}

          {!setsLoading && sets.length === 0 && !setsError && (
            <div className="empty-state">
              <p>No question sets published yet. Generate questions and click “Publish to GitHub”, then refresh here.</p>
            </div>
          )}

          {sets.length > 0 && (
            <>
              <label className="field">
                <span>Choose a set</span>
                <select value={selectedUrl} onChange={(e) => setSelectedUrl(e.target.value)}>
                  {sets.map((s) => (
                    <option key={s.name} value={s.downloadUrl}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="qa-checkbox">
                <input type="checkbox" checked={shuffle} onChange={(e) => setShuffle(e.target.checked)} />
                <span>Shuffle question order</span>
              </label>

              <div className="form-actions">
                <button type="button" className="btn btn-primary" onClick={handleStart} disabled={loadingExam || !selectedUrl}>
                  {loadingExam ? 'Loading…' : 'Start Exam'}
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    )
  }

  // ---- EXAM PHASE ----
  if (phase === 'exam') {
    const q = questions[current]
    const chosen = answers[current]
    return (
      <div className="page">
        <section className="welcome-card">
          <div className="result-toolbar" style={{ padding: 0, border: 'none' }}>
            <div>
              <h2>{setName}</h2>
              <p>
                Question {current + 1} of {questions.length} · {answeredCount} answered
              </p>
            </div>
            <button type="button" className="btn btn-ghost" onClick={handleBackToSelect}>
              Exit
            </button>
          </div>
          <div className="progress-track" style={{ marginTop: 12 }}>
            <div className="progress-fill" style={{ width: `${((current + 1) / questions.length) * 100}%` }} />
          </div>
        </section>

        <section className="form-card">
          <p className="exam-question">
            {current + 1}. {q.question}
          </p>
          <div className="exam-options">
            {q.options.map((opt, oi) => (
              <button
                key={oi}
                type="button"
                className={`exam-option${chosen === opt ? ' exam-option--chosen' : ''}`}
                onClick={() => selectOption(current, opt)}
              >
                <span className="exam-option-marker">{String.fromCharCode(65 + oi)}</span>
                <span>{opt}</span>
              </button>
            ))}
          </div>

          <div className="exam-nav">
            <button type="button" className="btn btn-ghost" onClick={() => setCurrent((c) => Math.max(0, c - 1))} disabled={current === 0}>
              Previous
            </button>
            {current < questions.length - 1 ? (
              <button type="button" className="btn btn-primary" onClick={() => setCurrent((c) => Math.min(questions.length - 1, c + 1))}>
                Next
              </button>
            ) : (
              <button type="button" className="btn btn-primary" onClick={handleSubmit}>
                Submit
              </button>
            )}
          </div>
        </section>

        <section className="form-card">
          <h3>Questions</h3>
          <div className="exam-grid">
            {questions.map((_, i) => (
              <button
                key={i}
                type="button"
                className={`exam-grid-cell${i === current ? ' exam-grid-cell--current' : ''}${answers[i] !== null ? ' exam-grid-cell--answered' : ''}`}
                onClick={() => setCurrent(i)}
              >
                {i + 1}
              </button>
            ))}
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-primary" onClick={handleSubmit}>
              Submit Exam ({answeredCount}/{questions.length})
            </button>
          </div>
        </section>
      </div>
    )
  }

  // ---- RESULT PHASE ----
  const pct = Math.round((score / questions.length) * 100)
  return (
    <div className="page">
      <section className="welcome-card">
        <h2>Result — {setName}</h2>
        <p>
          You scored <strong>{score}</strong> / {questions.length} ({pct}%).
        </p>
        <div className="form-actions" style={{ justifyContent: 'flex-start', marginTop: 6 }}>
          <button type="button" className="btn btn-ghost" onClick={handleRetake}>
            Retake
          </button>
          <button type="button" className="btn btn-primary" onClick={handleBackToSelect}>
            Choose Another Set
          </button>
        </div>
      </section>

      <section className="result-card">
        <div className="result-toolbar">
          <h3>Review</h3>
        </div>
        <ol className="qa-list" style={{ padding: '16px 20px 20px 40px' }}>
          {questions.map((q, i) => {
            const chosen = answers[i]
            const correct = chosen === q.correctAnswer
            return (
              <li key={i} className="qa-item">
                <p className="qa-question">
                  {q.question}{' '}
                  <span className={correct ? 'exam-badge exam-badge--ok' : 'exam-badge exam-badge--bad'}>
                    {chosen === null ? 'Skipped' : correct ? 'Correct' : 'Wrong'}
                  </span>
                </p>
                <ul className="qa-options">
                  {q.options.map((opt, oi) => {
                    const isCorrect = opt === q.correctAnswer
                    const isChosen = opt === chosen
                    let cls = 'qa-option'
                    if (isCorrect) cls += ' qa-option--correct'
                    else if (isChosen) cls += ' qa-option--wrong'
                    return (
                      <li key={oi} className={cls}>
                        {opt}
                        {isChosen && !isCorrect && ' — your answer'}
                      </li>
                    )
                  })}
                </ul>
                {q.explanation && <p className="qa-explanation">{q.explanation}</p>}
              </li>
            )
          })}
        </ol>
      </section>
    </div>
  )
}

export default Exam
