import { useMemo, useRef, useState } from 'react'
import { WORKER_URL } from '../config/api'
import { extractPdfPages } from '../utils/pdfText'
import { splitAndValidate, countFile1Questions } from '../utils/tnpscParser'
import { createZip } from '../utils/zip'
import { downloadBlob } from '../utils/download'

const SUBJECT_CODES = ['Ta', 'Hi', 'Po', 'Ge', 'Sci', 'SS']
const SUBJECT_NAMES = {
  Ta: 'Tamil',
  Hi: 'History',
  Po: 'Polity',
  Ge: 'Geography',
  Sci: 'Science',
  SS: 'Social Science',
}
const STANDARDS = Array.from({ length: 7 }, (_, i) => String(i + 6)) // 6..12
const LANGUAGES = ['Tamil', 'English', 'Both']

const MAX_ATTEMPTS = 5
const RETRY_WAIT_MS = 8000
const BATCH_PAUSE_MS = 3000

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function parseSkipPages(raw) {
  const set = new Set()
  raw
    .split(/[,;]/)
    .map((p) => p.trim())
    .filter(Boolean)
    .forEach((p) => {
      const n = parseInt(p, 10)
      if (Number.isFinite(n)) set.add(n)
    })
  return set
}

function buildBatches(pageCount, skipSet, batchSize) {
  const active = []
  for (let i = 0; i < pageCount; i++) {
    if (!skipSet.has(i + 1)) active.push(i)
  }
  const batches = []
  for (let i = 0; i < active.length; i += batchSize) {
    batches.push(active.slice(i, i + batchSize))
  }
  return batches
}

function isKeyExhaustionError(message) {
  return /rate.?limit|quota|exhaust|429/i.test(message || '')
}

function TnpscParser() {
  const [subjectCode, setSubjectCode] = useState('Sci')
  const [standard, setStandard] = useState('10')
  const [term, setTerm] = useState('1')
  const [chapter, setChapter] = useState('1')
  const [section, setSection] = useState('1')
  const [language, setLanguage] = useState('Tamil')
  const [skipPages, setSkipPages] = useState('')
  const [batchSize, setBatchSize] = useState('5')

  const [practiceCount, setPracticeCount] = useState('10')
  const [finalCount, setFinalCount] = useState('10')
  const [qbCount, setQbCount] = useState('20')

  const [pdfFile, setPdfFile] = useState(null)
  const [pdfPages, setPdfPages] = useState(null)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [pdfError, setPdfError] = useState('')

  const [generalError, setGeneralError] = useState('')
  const [running, setRunning] = useState(false)
  const [logLines, setLogLines] = useState([])
  const [progress, setProgress] = useState(0)
  const [statusText, setStatusText] = useState('Ready — configure parameters and upload a PDF.')
  const [batches, setBatches] = useState([])

  const stopRef = useRef(false)
  const logRef = useRef(null)

  const skipSet = useMemo(() => parseSkipPages(skipPages), [skipPages])
  const batchSizeNum = Number(batchSize) || 0
  const plannedBatches = useMemo(() => {
    if (!pdfPages) return []
    return buildBatches(pdfPages.length, skipSet, Math.max(1, batchSizeNum))
  }, [pdfPages, skipSet, batchSizeNum])

  const baseId = `${subjectCode}-${standard}-${term}-${chapter}-${section}`

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

    const pcNum = Number(practiceCount)
    const fcNum = Number(finalCount)
    const qbcNum = Number(qbCount)
    if (![pcNum, fcNum, qbcNum].every((n) => Number.isFinite(n) && n >= 1)) {
      setGeneralError('Practice / Final Exam / QB counts must all be positive numbers.')
      return
    }
    if (!Number.isFinite(batchSizeNum) || batchSizeNum < 1) {
      setGeneralError('Pages per Batch must be a positive number.')
      return
    }

    const batchGroups = buildBatches(pdfPages.length, skipSet, batchSizeNum)
    if (batchGroups.length === 0) {
      setGeneralError('No pages left to process after skipping.')
      return
    }

    const params = {
      subjectCode,
      standard: Number(standard),
      term: Number(term),
      chapter: Number(chapter),
      section: Number(section),
      language,
      practiceCount: pcNum,
      finalCount: fcNum,
      qbCount: qbcNum,
    }

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
        file1: null,
        file2: null,
        error: '',
      }))
    )

    const totalPages = batchGroups.reduce((sum, g) => sum + g.length, 0)
    log('info', `Pages to process: ${totalPages} across ${batchGroups.length} batch(es).`)

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

      let savedFile1 = null
      let success = false
      let lastErrorMessage = ''

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        if (stopRef.current) break

        log('info', `Calling Gemini — attempt ${attempt}/${MAX_ATTEMPTS}...`)
        try {
          const res = await fetch(`${WORKER_URL}/generate-tnpsc`, {
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
          const split = splitAndValidate(result.text, savedFile1)

          if (split.ok) {
            success = true
            savedFile1 = split.file1
            setBatches((prev) =>
              prev.map((x) => (x.batchNum === batchNum ? { ...x, status: 'success', file1: split.file1, file2: split.file2 } : x))
            )
            const mod = split.file1.modules?.[0] || {}
            const lmc = mod.learnByMcq?.questions?.length || 0
            const pcCount = mod.practice?.questions?.length || 0
            const fcCount = mod.finalExam?.questions?.length || 0
            const qbc2 = split.file2?.questions?.length || 0
            log('success', `Batch ${batchNum} parsed — learnByMcq ${lmc} · practice ${pcCount} · finalExam ${fcCount} · QB ${qbc2}`)
            break
          }

          savedFile1 = split.file1 || savedFile1
          lastErrorMessage = split.error
          log('warn', `JSON broken on attempt ${attempt}: ${split.error}`)
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
      setStatusText('Done — review results below.')
      log('success', 'All batches processed.')
    }
  }

  function handleDownloadFile1(batch) {
    if (!batch.file1) return
    downloadBlob(JSON.stringify(batch.file1, null, 2), `${baseId}-batch${batch.batchNum}.json`, 'application/json')
  }

  function handleDownloadFile2(batch) {
    if (!batch.file2) return
    downloadBlob(JSON.stringify(batch.file2, null, 2), `${baseId}-batch${batch.batchNum}-qb.json`, 'application/json')
  }

  const successfulBatches = batches.filter((b) => b.file1)

  function handleDownloadAllZip() {
    if (successfulBatches.length === 0) return
    const files = []
    for (const b of successfulBatches) {
      files.push({
        name: `${baseId}-batch${b.batchNum}.json`,
        data: new TextEncoder().encode(JSON.stringify(b.file1, null, 2)),
      })
      if (b.file2) {
        files.push({
          name: `${baseId}-batch${b.batchNum}-qb.json`,
          data: new TextEncoder().encode(JSON.stringify(b.file2, null, 2)),
        })
      }
    }
    downloadBlob(createZip(files), `${baseId}.zip`, 'application/zip')
  }

  return (
    <div className="page">
      <section className="welcome-card">
        <h2>TNPSC Parser</h2>
        <p>Upload a textbook PDF and let Gemini turn it into exam-ready TNPSC question JSON, batch by batch.</p>
      </section>

      <div className="page-columns">
        <div className="page-col page-col-left">
          <section className="form-card">
            <h3>Section Parameters</h3>

            <div className="form-grid">
              <label className="field">
                <span>Subject Code</span>
                <select value={subjectCode} onChange={(e) => setSubjectCode(e.target.value)} disabled={running}>
                  {SUBJECT_CODES.map((c) => (
                    <option key={c} value={c}>
                      {c} — {SUBJECT_NAMES[c]}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Standard</span>
                <select value={standard} onChange={(e) => setStandard(e.target.value)} disabled={running}>
                  {STANDARDS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="form-grid">
              <label className="field">
                <span>Term</span>
                <input type="number" min="1" value={term} onChange={(e) => setTerm(e.target.value)} disabled={running} />
              </label>
              <label className="field">
                <span>Chapter</span>
                <input type="number" min="1" value={chapter} onChange={(e) => setChapter(e.target.value)} disabled={running} />
              </label>
              <label className="field">
                <span>Section</span>
                <input type="number" min="1" value={section} onChange={(e) => setSection(e.target.value)} disabled={running} />
              </label>
            </div>

            <label className="field">
              <span>Language</span>
              <select value={language} onChange={(e) => setLanguage(e.target.value)} disabled={running}>
                {LANGUAGES.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </label>

            <div className="form-grid">
              <label className="field">
                <span>Skip Pages</span>
                <input
                  type="text"
                  value={skipPages}
                  onChange={(e) => setSkipPages(e.target.value)}
                  placeholder="e.g. 1, 3, 5"
                  disabled={running}
                />
              </label>
              <label className="field">
                <span>Pages per Batch</span>
                <input
                  type="number"
                  min="1"
                  value={batchSize}
                  onChange={(e) => setBatchSize(e.target.value)}
                  disabled={running}
                />
              </label>
            </div>

            <p className="field-hint">chapterId will be: {baseId}</p>
          </section>

          <section className="form-card">
            <h3>Question Counts</h3>
            <div className="form-grid">
              <label className="field">
                <span>Practice</span>
                <input type="number" min="1" value={practiceCount} onChange={(e) => setPracticeCount(e.target.value)} disabled={running} />
              </label>
              <label className="field">
                <span>Final Exam</span>
                <input type="number" min="1" value={finalCount} onChange={(e) => setFinalCount(e.target.value)} disabled={running} />
              </label>
              <label className="field">
                <span>QB</span>
                <input type="number" min="1" value={qbCount} onChange={(e) => setQbCount(e.target.value)} disabled={running} />
              </label>
            </div>
            <p className="field-hint">These counts are enforced in the prompt — Gemini generates exactly this many.</p>
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
                {plannedBatches.length === 1 ? '' : 'es'} planned
                {skipSet.size > 0 && ` (skipping ${[...skipSet].sort((a, b) => a - b).join(', ')})`}.
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
                {running ? 'Generating…' : 'Generate JSON Files'}
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
                <div className="log-empty">Log output will appear here once you click Generate JSON Files.</div>
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
                <h3>Batch Results ({successfulBatches.length}/{batches.length} complete)</h3>
                <div className="result-actions">
                  <button type="button" className="btn btn-ghost" onClick={handleDownloadAllZip} disabled={successfulBatches.length === 0}>
                    Download All (ZIP)
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '16px 20px' }}>
                {batches.map((b) => (
                  <div key={b.batchNum} className={`batch-row batch-row--${b.status}`}>
                    <div className="batch-row-info">
                      <span className={`batch-status-dot batch-status-dot--${b.status}`} />
                      <div>
                        <strong>
                          Batch {b.batchNum} — Pages {b.pageStart}–{b.pageEnd}
                        </strong>
                        {b.status === 'success' && (
                          <p className="field-hint">{countFile1Questions(b.file1)} FILE1 questions · {b.file2?.questions?.length || 0} QB questions</p>
                        )}
                        {b.status === 'failed' && <p className="field-hint">{b.error}</p>}
                        {(b.status === 'pending' || b.status === 'running') && (
                          <p className="field-hint">{b.status === 'running' ? 'Generating…' : 'Waiting…'}</p>
                        )}
                      </div>
                    </div>
                    {b.status === 'success' && (
                      <div className="batch-row-actions">
                        <button type="button" className="btn btn-ghost" onClick={() => handleDownloadFile1(b)}>
                          FILE 1
                        </button>
                        <button type="button" className="btn btn-ghost" onClick={() => handleDownloadFile2(b)}>
                          FILE 2
                        </button>
                      </div>
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

export default TnpscParser
