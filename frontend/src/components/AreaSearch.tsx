// OWNER: workstream 3 (Frontend). Station autocomplete backed by /api/locations/search.
import { useEffect, useState } from 'react'
import { api } from '../api'
import type { Area } from '../types'

export default function AreaSearch({ placeholder, onSelect }: { placeholder: string; onSelect: (a: Area) => void }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Area[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!q) return setResults([])
    const t = setTimeout(() => api.searchLocations(q).then(setResults).catch(() => setResults([])), 150)
    return () => clearTimeout(t)
  }, [q])

  return (
    <div className="relative">
      <input
        className="w-full rounded border p-2"
        placeholder={placeholder}
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true) }}
      />
      {open && results.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full rounded border bg-white shadow">
          {results.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                className="w-full p-2 text-left hover:bg-slate-100"
                onClick={() => { onSelect(a); setQ(a.name); setOpen(false) }}
              >
                {a.name} <span className="text-xs text-slate-500">{a.region_name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
