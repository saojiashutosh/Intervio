import { useState } from 'react'

const SQL_KW = new Set(('select from where and or not null insert into values update set delete create table index unique primary key foreign references ' +
  'on cascade restrict check default constraint alter add drop begin commit rollback savepoint join left right inner outer full group by having order limit ' +
  'offset distinct as case when then else end in exists between like is with over partition rank explain analyze buffers for share nowait skip locked ' +
  'concurrently using gin gist include materialized view refresh partition range of to generated always identity returning conflict do nothing show ' +
  'isolation level repeatable read committed serializable true false asc desc union all any begin transaction no').split(' '))
const PY_KW = new Set(('def class return import from as with if else elif for in not and or is None True False raise try except lambda while pass yield ' +
  'self async await').split(' '))

const SH_KW = new Set(('FROM RUN COPY CMD WORKDIR ENV EXPOSE ENTRYPOINT ARG USER AS on jobs steps uses run name needs runs-on git docker if then fi do done').split(' '))

const JS_KW = new Set(('const let var function return if else for while of in new await async class import from export default null undefined true false this typeof try catch throw').split(' '))

const COMMENT = { sql: '--[^\\n]*', js: '//[^\\n]*', py: '#[^\\n]*', sh: '#[^\\n]*' } as const
const REST = String.raw`('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][A-Za-z0-9_]*)|(\s+|.)`
// One tokenizer per language, so another language's comment marker (Python's // operator) is never taken for a comment.
const TOKENS = {
  sql: new RegExp(`(${COMMENT.sql})|${REST}`, 'g'),
  js: new RegExp(`(${COMMENT.js})|${REST}`, 'g'),
  py: new RegExp(`(${COMMENT.py})|${REST}`, 'g'),
  sh: new RegExp(`(${COMMENT.sh})|${REST}`, 'g'),
}

type Lang = 'sql' | 'py' | 'sh' | 'js'

function highlight(code: string, lang: Lang) {
  const kws = lang === 'sql' ? SQL_KW : lang === 'sh' ? SH_KW : lang === 'js' ? JS_KW : PY_KW
  const out: { t: string; c?: string }[] = []
  for (const m of code.matchAll(TOKENS[lang])) {
    const [text, comment, str, num, word] = m
    if (comment !== undefined) out.push({ t: text, c: 'tok-c' })
    else if (str !== undefined) out.push({ t: text, c: 'tok-s' })
    else if (num !== undefined) out.push({ t: text, c: 'tok-n' })
    else if (word !== undefined && kws.has(lang === 'sql' ? word.toLowerCase() : word)) out.push({ t: text, c: 'tok-k' })
    else out.push({ t: text })
  }
  return out
}

export function CodeBlock({ code, lang = 'sql', title }: { code: string; lang?: Lang; title?: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1200) } catch { /* clipboard blocked */ }
  }
  return (
    <figure className="code">
      <figcaption>
        <span>{title ?? (lang === 'sql' ? 'SQL' : lang === 'sh' ? 'Shell / config' : lang === 'js' ? 'JavaScript' : 'Python')}</span>
        <button className="ghost small" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
      </figcaption>
      <pre><code>{highlight(code, lang).map((p, i) => (p.c ? <span key={i} className={p.c}>{p.t}</span> : p.t))}</code></pre>
    </figure>
  )
}
