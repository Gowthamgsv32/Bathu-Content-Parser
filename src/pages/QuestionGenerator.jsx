import { useMemo, useRef, useState } from 'react'
import { WORKER_URL } from '../config/api'
import { extractPdfPages } from '../utils/pdfText'
import { parseQuestions, countQuestions } from '../utils/questionParser'
import { downloadBlob } from '../utils/download'

const MAX_ATTEMPTS = 5
const RETRY_WAIT_MS = 8000
const BATCH_PAUSE_MS = 3000

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Split all page indices into groups of `batchSize` — every page is
// processed, in order.
function buildBatches(pageCount, batchSize) {
  const batches = []
  for (let i = 0; i < pageCount; i += batchSize) {
    const group = []
    for (let j = i; j < Math.min(i + batchSize, pageCount); j++) group.push(j)
    batches.push(group)
  }
  return batches
}

function isKeyExhaustionError(message) {
  return /rate.?limit|quota|exhaust|429/i.test(message || '')
}

function baseName(file) {
  if (!file?.name) return 'questions'
  return file.name.replace(/\.pdf$/i, '') || 'questions'
}

function QuestionGenerator() {
  const [questionsPerPage, setQuestionsPerPage] = useState('5')
  const [pagesPerBatch, setPagesPerBatch] = useState('1')

  const [pdfFile, setPdfFile] = useState(null)
  const [pdfPages, setPdfPages] = useState(null)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [pdfError, setPdfError] = useState('')

  const [generalError, setGeneralError] = useState('')
  const [running, setRunning] = useState(false)
  const [logLines, setLogLines] = useState([])
  const [progress, setProgress] = useState(0)
  const [statusText, setStatusText] = useState('Ready — set the counts and upload a PDF.')
  const [batches, setBatches] = useState([])

  const stopRef = useRef(false)
  const logRef = useRef(null)

  const batchSizeNum = Math.max(1, Number(pagesPerBatch) || 1)
  const plannedBatches = useMemo(() => {
    if (!pdfPages) return []
    return buildBatches(pdfPages.length, batchSizeNum)
  }, [pdfPages, batchSizeNum])

  function log(tag, text) {
    setLogLines((prev) => [...prev, { ts: new Date().toLocaleTimeString(), tag, text }])
    requestAnimationFrame(() => {
      if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
    })
  }

  async function handlePdfChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setPdfFile(file)
    setPdfPages(null)
    setPdfError('')
    setPdfLoading(true)
    try {
      const pages = await extractPdfPages(file)
      setPdfPages(pages)
    } catch (err) {
      setPdfError(`Failed to read PDF: ${err.message}`)
    } finally {
      setPdfLoading(false)
    }
  }

  function handleClearLog() {
    setLogLines([])
  }

  function handleStop() {
    stopRef.current = true
    log('warn', 'Stop requested — finishing current step...')
  }

  async function handleGenerate() {
    setGeneralError('')

    if (!pdfPages || pdfPages.length === 0) {
      setGeneralError('Please upload a PDF first.')
      return
    }

    const qppNum = Number(questionsPerPage)
    if (!Number.isFinite(qppNum) || qppNum < 1) {
      setGeneralError('Questions per page must be a positive number.')
      return
    }
    if (!Number.isFinite(batchSizeNum) || batchSizeNum < 1) {
      setGeneralError('Pages per batch must be a positive number.')
      return
    }

    const batchGroups = buildBatches(pdfPages.length, batchSizeNum)
    const params = { questionsPerPage: qppNum }

    stopRef.current = false
    setRunning(true)
    setLogLines([])
    setProgress(0)
    setBatches(
      batchGroups.map((indices, i) => ({
        batchNum: i + 1,
        pageStart: indices[0] + 1,
        pageEnd: indices[indices.length - 1] + 1,
        status: 'pending',
        questions: null,
        error: '',
      }))
    )

    log('info', `Processing ${pdfPages.length} page(s) in ${batchGroups.length} batch(es), ${qppNum} question(s) per page.`)

    for (let b = 0; b < batchGroups.length; b++) {
      if (stopRef.current) {
        log('warn', 'Stopped by user.')
        break
      }

      const batchNum = b + 1
      const indices = batchGroups[b]
      const pageStart = indices[0] + 1
      const pageEnd = indices[indices.length - 1] + 1

      setBatches((prev) => prev.map((x) => (x.batchNum === batchNum ? { ...x, status: 'running' } : x)))
      setStatusText(`Batch ${batchNum}/${batchGroups.length}: pages ${pageStart}–${pageEnd}...`)
      setProgress(Math.round(((batchNum - 1) / batchGroups.length) * 100))
      log('accent', `BATCH ${batchNum}/${batchGroups.length} — Pages ${pageStart}–${pageEnd}`)

      const batchText = indices.map((idx) => `===== PAGE ${idx + 1} =====\n${pdfPages[idx]}`).join('\n\n')

      let success = false
      let lastErrorMessage = ''

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        if (stopRef.current) break

        log('info', `Calling Gemini — attempt ${attempt}/${MAX_ATTEMPTS}...`)
        try {
          const res = await fetch(`${WORKER_URL}/generate-questions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ params, pdfText: batchText }),
          })
          const result = await res.json()

          if (result.error) {
            lastErrorMessage = result.error
            log('warn', `API error: ${result.error}`)
            if (isKeyExhaustionError(result.error)) {
              log('error', 'Gemini API keys appear exhausted — stopping the whole run.')
              stopRef.current = true
              break
            }
            if (attempt < MAX_ATTEMPTS) {
              log('info', `Waiting ${RETRY_WAIT_MS / 1000}s before retry...`)
              await sleep(RETRY_WAIT_MS)
            }
            continue
          }

          log('success', `Response received (${result.text.length.toLocaleString()} chars).`)
          const parsed = parseQuestions(result.text)

          if (parsed.ok) {
            success = true
            const count = countQuestions(parsed.questions)
            setBatches((prev) =>
              prev.map((x) => (x.batchNum === batchNum ? { ...x, status: 'success', questions: parsed.questions } : x))
            )
            log('success', `Batch ${batchNum} parsed — ${count} question(s).`)
            break
          }

          lastErrorMessage = parsed.error
          log('warn', `Parse failed on attempt ${attempt}: ${parsed.error}`)
          if (attempt < MAX_ATTEMPTS) {
            log('info', `Waiting ${RETRY_WAIT_MS / 1000}s before retry...`)
            await sleep(RETRY_WAIT_MS)
          }
        } catch (err) {
          lastErrorMessage = err.message
          log('warn', `Request failed (attempt ${attempt}): ${err.message}`)
          if (attempt < MAX_ATTEMPTS) {
            await sleep(RETRY_WAIT_MS)
          }
        }
      }

      if (!success) {
        setBatches((prev) => prev.map((x) => (x.batchNum === batchNum ? { ...x, status: 'failed', error: lastErrorMessage } : x)))
        log('error', `Batch ${batchNum} failed after all attempts: ${lastErrorMessage}`)
      }

      if (stopRef.current) break

      if (b < batchGroups.length - 1) {
        log('info', `Waiting ${BATCH_PAUSE_MS / 1000}s before next batch...`)
        await sleep(BATCH_PAUSE_MS)
      }
    }

    setProgress(100)
    setRunning(false)
    if (stopRef.current) {
      setStatusText('Stopped.')
      log('warn', 'Run stopped.')
    } else {
      setStatusText('Done — review the questions below.')
      log('success', 'All batches processed.')
    }
  }

  const base = baseName(pdfFile)
  const successfulBatches = batches.filter((b) => b.questions)
  const allQuestions = successfulBatches.flatMap((b) => b.questions.questions)

  function handleDownloadBatch(batch) {
    if (!batch.questions) return
    downloadBlob(JSON.stringify(batch.questions, null, 2), `${base}-batch${batch.batchNum}.json`, 'application/json')
  }

  function handleDownloadAll() {
    if (allQuestions.length === 0) return
    downloadBlob(JSON.stringify({ questions: allQuestions }, null, 2), `${base}-questions.json`, 'application/json')
  }

  return (
    <div className="page">
      <section className="welcome-card">
        <h2>Health Inspector Question Generator</h2>
        <p>Upload a PDF and Gemini turns each page into Health Inspector exam MCQs — question, options, correct answer and explanation.</p>
      </section>

      <div className="page-columns">
        <div className="page-col page-col-left">
          <section className="form-card">
            <h3>Settings</h3>

            <div className="form-grid">
              <label className="field">
                <span>Questions per page</span>
                <input
                  type="number"
                  min="1"
                  value={questionsPerPage}
                  onChange={(e) => setQuestionsPerPage(e.target.value)}
                  disabled={running}
                />
              </label>
              <label className="field">
                <span>Pages per batch</span>
                <input
                  type="number"
                  min="1"
                  value={pagesPerBatch}
                  onChange={(e) => setPagesPerBatch(e.target.value)}
                  disabled={running}
                />
              </label>
            </div>
            <p className="field-hint">
              Each batch is one Gemini call. Fewer pages per batch is more reliable; more pages is faster but risks truncation.
            </p>
          </section>

          <section className="form-card">
            <h3>Source PDF</h3>
            <label className="field">
              <span>PDF File</span>
              <input type="file" accept="application/pdf" onChange={handlePdfChange} disabled={running} />
            </label>

            {pdfLoading && <p className="field-hint">Reading PDF…</p>}
            {pdfError && <div className="alert alert-error">{pdfError}</div>}
            {pdfPages && !pdfLoading && (
              <p className="field-hint">
                {pdfFile?.name} · {pdfPages.length} page{pdfPages.length === 1 ? '' : 's'} loaded · {plannedBatches.length} batch
                {plannedBatches.length === 1 ? '' : 'es'} · ~{pdfPages.length * (Number(questionsPerPage) || 0)} question(s) total.
              </p>
            )}

            {generalError && <div className="alert alert-error">{generalError}</div>}

            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={handleStop} disabled={!running}>
                Stop
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleGenerate}
                disabled={running || !pdfPages || pdfLoading}
              >
                {running ? 'Generating…' : 'Generate Questions'}
              </button>
            </div>
          </section>
        </div>

        <div className="page-col page-col-right">
          <section className="result-card">
            <div className="result-toolbar">
              <h3>Activity Log</h3>
              <div className="result-actions">
                <button type="button" className="btn btn-ghost" onClick={handleClearLog} disabled={running}>
                  Clear Log
                </button>
              </div>
            </div>

            <div style={{ padding: '16px 20px 0' }}>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${progress}%` }} />
              </div>
              <p className="field-hint" style={{ marginTop: 6 }}>
                {statusText}
              </p>
            </div>

            <div className="log-panel" ref={logRef}>
              {logLines.length === 0 ? (
                <div className="log-empty">Log output will appear here once you click Generate Questions.</div>
              ) : (
                logLines.map((line, i) => (
                  <div key={i} className={`log-line log-line--${line.tag}`}>
                    <span className="log-ts">{line.ts}</span> {line.text}
                  </div>
                ))
              )}
            </div>
          </section>

          {batches.length > 0 && (
            <section className="result-card">
              <div className="result-toolbar">
                <h3>
                  Questions ({allQuestions.length} from {successfulBatches.length}/{batches.length} batch
                  {batches.length === 1 ? '' : 'es'})
                </h3>
                <div className="result-actions">
                  <button type="button" className="btn btn-ghost" onClick={handleDownloadAll} disabled={allQuestions.length === 0}>
                    Download All (JSON)
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '16px 20px' }}>
                {batches.map((b) => (
                  <div key={b.batchNum} className={`batch-row batch-row--${b.status}`} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, width: '100%' }}>
                      <div className="batch-row-info">
                        <span className={`batch-status-dot batch-status-dot--${b.status}`} />
                        <div>
                          <strong>
                            Batch {b.batchNum} — Pages {b.pageStart}–{b.pageEnd}
                          </strong>
                          {b.status === 'success' && (
                            <p className="field-hint">{countQuestions(b.questions)} question(s)</p>
                          )}
                          {b.status === 'failed' && <p className="field-hint">{b.error}</p>}
                          {(b.status === 'pending' || b.status === 'running') && (
                            <p className="field-hint">{b.status === 'running' ? 'Generating…' : 'Waiting…'}</p>
                          )}
                        </div>
                      </div>
                      {b.status === 'success' && (
                        <div className="batch-row-actions">
                          <button type="button" className="btn btn-ghost" onClick={() => handleDownloadBatch(b)}>
                            JSON
                          </button>
                        </div>
                      )}
                    </div>

                    {b.status === 'success' && (
                      <ol className="qa-list">
                        {b.questions.questions.map((q, qi) => (
                          <li key={qi} className="qa-item">
                            <p className="qa-question">{q.question}</p>
                            <ul className="qa-options">
                              {q.options.map((opt, oi) => (
                                <li key={oi} className={opt === q.correctAnswer ? 'qa-option qa-option--correct' : 'qa-option'}>
                                  {opt}
                                </li>
                              ))}
                            </ul>
                            {q.explanation && <p className="qa-explanation">{q.explanation}</p>}
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}

export default QuestionGenerator
