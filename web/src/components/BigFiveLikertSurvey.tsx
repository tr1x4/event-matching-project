import { useMemo, useState } from 'react'
import type { BfiQ } from '../questionnaire/bfiQuestions'
import './BigFiveLikertSurvey.css'

const LIKERT: { value: number; label: string }[] = [
  { value: 1, label: 'Совсем не про меня' },
  { value: 2, label: 'Скорее не про меня' },
  { value: 3, label: 'И да, и нет' },
  { value: 4, label: 'Скорее про меня' },
  { value: 5, label: 'Очень похоже на меня' },
]

type Props = {
  title: string
  questions: BfiQ[]
  /** Сколько утверждений на одном экране */
  pageSize: number
  initialAnswers?: Record<string, number>
  onCancel?: () => void
  onComplete: (answers: Record<string, number>) => void
  busy?: boolean
}

export function BigFiveLikertSurvey({
  title,
  questions,
  pageSize,
  initialAnswers,
  onCancel,
  onComplete,
  busy,
}: Props) {
  const pages = useMemo(() => {
    const out: BfiQ[][] = []
    for (let i = 0; i < questions.length; i += pageSize) {
      out.push(questions.slice(i, i + pageSize))
    }
    return out
  }, [questions, pageSize])

  const [page, setPage] = useState(0)
  const [answers, setAnswers] = useState<Record<string, number>>(() => ({ ...initialAnswers }))

  const chunk = pages[page] ?? []
  const totalQ = questions.length
  const answeredInChunk = chunk.every((q) => answers[q.code] != null)

  function setAnswer(code: string, value: number) {
    setAnswers((prev) => ({ ...prev, [code]: value }))
  }

  function next() {
    if (!answeredInChunk) return
    if (page < pages.length - 1) setPage((p) => p + 1)
    else {
      const full: Record<string, number> = {}
      for (const q of questions) {
        const v = answers[q.code]
        if (v == null) return
        full[q.code] = v
      }
      onComplete(full)
    }
  }

  function back() {
    if (page > 0) setPage((p) => p - 1)
    else onCancel?.()
  }

  const globalFrom = page * pageSize + 1
  const globalTo = Math.min((page + 1) * pageSize, totalQ)

  return (
    <div className="bf-survey">
      <div className="bf-survey-head">
        <h3 className="bf-survey-title">{title}</h3>
        <span className="bf-survey-progress">
          Вопросы {globalFrom}–{globalTo} из {totalQ}
        </span>
      </div>

      <p className="bf-likert-legend" aria-hidden>
        {LIKERT.map(({ value, label }) => (
          <span key={value} className="bf-likert-legend-item">
            <strong>{value}</strong>
            <span className="bf-likert-legend-dash"> — </span>
            {label}
          </span>
        ))}
      </p>

      {chunk.map((q) => (
        <div key={q.code} className="bf-q-block">
          <p className="bf-q-text">{q.textRu}</p>
          <div className="bf-likert-nums" role="group" aria-label={q.textRu}>
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                className={`bf-likert-num${answers[q.code] === value ? ' bf-likert-num--on' : ''}`}
                aria-label={LIKERT[value - 1]?.label ?? String(value)}
                onClick={() => setAnswer(q.code, value)}
              >
                {value}
              </button>
            ))}
          </div>
        </div>
      ))}

      <div className="bf-survey-foot">
        <button type="button" className="btn ghost" onClick={back} disabled={busy}>
          {page === 0 && onCancel ? 'Назад' : page === 0 ? 'Закрыть' : 'Назад'}
        </button>
        <button type="button" className="btn primary" onClick={next} disabled={!answeredInChunk || busy}>
          {page < pages.length - 1 ? 'Далее' : busy ? 'Сохранение…' : 'Завершить'}
        </button>
      </div>
    </div>
  )
}
