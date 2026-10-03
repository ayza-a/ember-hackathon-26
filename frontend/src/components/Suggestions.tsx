// OWNER: workstream 3 (Frontend). Mode 2: top meeting-place suggestions.
// STUB: plain cards. TODO: time/km/fairness bars, places summary chips, nicer "Pick this".
import type { Friend, MeetupSuggestion } from '../types'
import { hhmm } from '../format'

interface Props {
  suggestions: MeetupSuggestion[]
  friends: Friend[]
  onPick: (s: MeetupSuggestion) => void
}

export default function Suggestions({ suggestions, onPick }: Props) {
  if (suggestions.length === 0) return <p className="text-sm text-slate-500">Add friends to see suggestions.</p>
  return (
    <div className="space-y-3">
      {suggestions.map((s, i) => (
        <div key={s.area.id} className="rounded-xl bg-white p-4 shadow">
          <p className="font-semibold">#{i + 1} {s.area.name} · {hhmm(s.meet_time)}</p>
          <p className="text-sm text-slate-600">
            {s.total_travel_min} min total travel · {s.total_km} km · {s.spread_min} min apart
          </p>
          <button className="mt-2 rounded bg-ember px-3 py-1 text-sm font-semibold text-white" onClick={() => onPick(s)}>
            Pick this
          </button>
        </div>
      ))}
    </div>
  )
}
