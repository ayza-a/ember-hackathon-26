// OWNER: workstream 4 (Discovery). One place; curated ones get a Local gem badge.
import type { Place } from '../types'

export default function PlaceCard({ place, onSelect }: { place: Place; onSelect?: () => void }) {
  return (
    <button type="button" onClick={onSelect} className="w-full rounded-lg border p-3 text-left hover:bg-slate-50">
      <p className="font-medium">
        {place.name} {place.source === 'curated' && <span className="text-xs text-amber-600">⭐ Local gem</span>}
      </p>
      <p className="text-xs text-slate-500">
        {place.category}{place.distance_m != null && ` · ${place.distance_m} m from the stop`}
      </p>
      {place.description && <p className="mt-1 text-sm text-slate-600">{place.description}</p>}
    </button>
  )
}
