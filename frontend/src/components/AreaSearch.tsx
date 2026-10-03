// OWNER: workstream 3 (Frontend). Station autocomplete backed by /api/locations/search.
// Keyboard: ↑/↓ to move, Enter to pick, Esc to close. Accessible combobox pattern.
import { useEffect, useId, useRef, useState } from 'react'
import { api } from '../api'
import type { Area } from '../types'
import { Icon } from '../ui/bits'

interface Props {
  placeholder: string
  onSelect: (a: Area) => void
  initial?: Area | null
  autoFocus?: boolean
  label?: string
}

function Highlight({ text, q }: { text: string; q: string }) {
  const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1
  if (i < 0) return <>{text}</>
  return <>{text.slice(0, i)}<mark className="rounded bg-mustard/60 px-0.5 text-inherit">{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>
}

export default function AreaSearch({ placeholder, onSelect, initial = null, autoFocus, label }: Props) {
  const [q, setQ] = useState(initial?.name ?? '')
  const [results, setResults] = useState<Area[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [loading, setLoading] = useState(false)
  const [picked, setPicked] = useState<Area | null>(initial)
  const box = useRef<HTMLDivElement>(null)
  const listId = useId()

  useEffect(() => {
    if (!q || q === picked?.name) return // list is hidden in this state anyway
    let alive = true
    const t = setTimeout(() => {
      setLoading(true)
      api.searchLocations(q)
        .then((r) => { if (alive) { setResults(r); setActive(0) } })
        .catch(() => alive && setResults([]))
        .finally(() => alive && setLoading(false))
    }, 150)
    return () => { alive = false; clearTimeout(t) }
  }, [q, picked])

  useEffect(() => {
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  function choose(a: Area) {
    setPicked(a)
    setQ(a.name)
    setOpen(false)
    setLoading(false)
    onSelect(a)
  }
  function onKey(e: React.KeyboardEvent) {
    if (!open || results.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => (i + 1) % results.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => (i - 1 + results.length) % results.length) }
    else if (e.key === 'Enter') { e.preventDefault(); choose(results[active]) }
    else if (e.key === 'Escape') setOpen(false)
  }

  const showList = open && q.length > 0 && q !== picked?.name
  return (
    <div className="relative" ref={box}>
      <div className="relative">
        <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-teal"><Icon name="pin" /></span>
        <input
          className="field pl-11"
          placeholder={placeholder}
          aria-label={label ?? placeholder}
          value={q}
          autoFocus={autoFocus}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && results[active] ? `${listId}-${active}` : undefined}
          onChange={(e) => { setQ(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
        />
        {loading && <span className="absolute top-1/2 right-3.5 h-4 w-4 -translate-y-1/2 animate-spin rounded-full border-2 border-teal border-t-transparent" />}
        {!loading && picked && q === picked.name && <span className="absolute top-1/2 right-3.5 -translate-y-1/2 text-teal"><Icon name="check" /></span>}
      </div>
      {showList && (
        <ul id={listId} role="listbox" className="animate-fade-up absolute z-30 mt-2 max-h-72 w-full overflow-y-auto rounded-2xl border-2 border-line bg-surface p-1.5 shadow-xl">
          {results.map((a, i) => (
            <li key={a.id} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
              <button
                type="button"
                className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left ${i === active ? 'bg-teal-soft' : 'hover:bg-surface-2'}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(a)}
              >
                <span className="text-lg">🚏</span>
                <span className="flex-1">
                  <span className="block font-semibold"><Highlight text={a.name} q={q} /></span>
                  {a.region_name && a.region_name !== a.name && <span className="block text-xs text-ink-soft">{a.region_name}</span>}
                </span>
              </button>
            </li>
          ))}
          {!loading && results.length === 0 && <li className="px-3 py-2 text-sm text-ink-soft">No Ember stops match “{q}”.</li>}
        </ul>
      )}
    </div>
  )
}
