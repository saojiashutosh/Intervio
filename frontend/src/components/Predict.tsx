import { useState } from 'react'

/** "Predict, then watch": commit to a guess before the animation reveals the answer. */
export function Predict({ question, options, answer, why }: { question: string; options: string[]; answer: number; why: string }) {
  const [picked, setPicked] = useState<number | null>(null)
  return (
    <div className="predict">
      <p className="predict-q"><span className="tag">Predict</span> {question}</p>
      <div className="predict-options" role="group" aria-label={question}>
        {options.map((o, i) => (
          <button
            key={o}
            disabled={picked !== null}
            className={`opt ${picked !== null ? (i === answer ? 'right' : i === picked ? 'wrong' : '') : ''}`}
            onClick={() => setPicked(i)}
          >{o}</button>
        ))}
      </div>
      {picked !== null && (
        <p className={`predict-result ${picked === answer ? 'good' : 'bad'}`} role="status">
          {picked === answer ? 'Correct. ' : 'Not quite. '}{why}
        </p>
      )}
    </div>
  )
}
