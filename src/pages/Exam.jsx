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

  // The full set that's currently selected (loaded so we know how many
  // questions there are before starting).
  const [loadedQuestions, setLoadedQuestions] = useState([])
  const [loadingSet, setLoadingSet] = useState(false)

  const [rangeFrom, setRangeFrom] = useState('1')
  const [rangeTo, setRangeTo] = useState('1')
  const [shuffle, setShuffle] = useState(true)

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

  // Load the selected set so we know its size and can offer a question range.
  useEffect(() => {
    if (!selectedUrl) {
      setLoadedQuestions([])
      return
    }
    let cancelled = false
    setLoadingSet(true)
    setSetsError('')
    loadQuestionSet(selectedUrl)
      .then((loaded) => {
        if (cancelled) return
        setLoadedQuestions(loaded)
        setRangeFrom('1')
        setRangeTo(String(loaded.length))
      })
      .catch((err) => {
        if (cancelled) return
        setLoadedQuestions([])
        setSetsError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoadingSet(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedUrl])

  const total = loadedQuestions.length
  const from = Math.min(Math.max(1, Number(rangeFrom) || 1), total || 1)
  const to = Math.min(Math.max(from, Number(rangeTo) || total), total || 1)
  const selectedCount = total === 0 ? 0 : to - from + 1

  function handleStart() {
    if (loadedQuestions.length === 0) return
    const slice = loadedQuestions.slice(from - 1, to)
    const qs = shuffle ? shuffled(slice) : slice
    setQuestions(qs)
    setAnswers(Array.from({ length: qs.length }, () => null))
    setCurrent(0)
    setSetName(sets.find((s) => s.downloadUrl === selectedUrl)?.name || 'Exam')
    setPhase('exam')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function selectOption(qIndex, option) {
    setAnswers((prev) => {
      const next = [...prev]
      next[qIndex] = option
      return next
    })
  }

  const answeredCount = answers.filter((a) => a !== null).length

  const stats = useMemo(() => {
    const totalQ = questions.length
    const correct = questions.reduce((sum, q, i) => sum + (answers[i] === q.correctAnswer ? 1 : 0), 0)
    const attempted = answers.filter((a) => a !== null).length
    const wrong = attempted - correct
    const skipped = totalQ - attempted
    const pct = totalQ === 0 ? 0 : Math.round((correct / totalQ) * 100)
    return { totalQ, correct, wrong, skipped, attempted, pct }
  }, [questions, answers])

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
          <p>Pick a published question set, choose how many questions to attempt, and test yourself.</p>
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

              <div className="field">
                <span>Question range {loadingSet ? '(loading…)' : total > 0 ? `(1–${total} available)` : ''}</span>
                <div className="form-grid">
                  <label className="field">
                    <span>From</span>
                    <input
                      type="number"
                      min="1"
                      max={total || 1}
                      value={rangeFrom}
                      onChange={(e) => setRangeFrom(e.target.value)}
                      disabled={loadingSet || total === 0}
                    />
                  </label>
                  <label className="field">
                    <span>To</span>
                    <input
                      type="number"
                      min="1"
                      max={total || 1}
                      value={rangeTo}
                      onChange={(e) => setRangeTo(e.target.value)}
                      disabled={loadingSet || total === 0}
                    />
                  </label>
                </div>
                {total > 0 && <p className="field-hint">{selectedCount} question(s) selected (numbers {from}–{to}).</p>}
              </div>

              <label className="qa-checkbox">
                <input type="checkbox" checked={shuffle} onChange={(e) => setShuffle(e.target.checked)} />
                <span>Shuffle question order</span>
              </label>

              <div className="form-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleStart}
                  disabled={loadingSet || total === 0}
                >
                  {loadingSet ? 'Loading…' : `Start Exam (${selectedCount})`}
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
  return (
    <div className="page">
      <section className="welcome-card">
        <h2>Result — {setName}</h2>
        <p>
          You scored <strong>{stats.correct}</strong> / {stats.totalQ} ({stats.pct}%).
        </p>

        <div className="stat-row">
          <div className="stat-tile">
            <span className="stat-value">{stats.totalQ}</span>
            <span className="stat-label">Total</span>
          </div>
          <div className="stat-tile stat-tile--ok">
            <span className="stat-value">{stats.correct}</span>
            <span className="stat-label">Correct</span>
          </div>
          <div className="stat-tile stat-tile--bad">
            <span className="stat-value">{stats.wrong}</span>
            <span className="stat-label">Wrong</span>
          </div>
          <div className="stat-tile stat-tile--muted">
            <span className="stat-value">{stats.skipped}</span>
            <span className="stat-label">Skipped</span>
          </div>
          <div className="stat-tile stat-tile--accent">
            <span className="stat-value">{stats.pct}%</span>
            <span className="stat-label">Score</span>
          </div>
        </div>

        <div className="form-actions" style={{ justifyContent: 'flex-start', marginTop: 12 }}>
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
                  <span className={correct ? 'exam-badge exam-badge--ok' : chosen === null ? 'exam-badge exam-badge--muted' : 'exam-badge exam-badge--bad'}>
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
