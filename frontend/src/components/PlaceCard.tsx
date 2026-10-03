// OWNER: workstream 4 (Discovery). One place; curated ones get a Local gem badge.
import type { Place } from '../types'
import { categoryMeta, walkMin } from './placeMeta'

export default function PlaceCard({ place, onSelect }: { place: Place; onSelect?: () => void }) {
  const gem = place.source === 'curated'
  const { emoji, label } = categoryMeta(place.category)
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSelect?.())}
      title="Show on map"
      className={`flex cursor-pointer gap-3 rounded-lg border p-3 text-left transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ember ${
        gem ? 'border-amber-300 bg-amber-50/60' : 'border-slate-200 bg-white'
      }`}
    >
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xl ${gem ? 'bg-amber-100' : 'bg-slate-100'}`}
        aria-hidden
      >
        {emoji}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium leading-tight">{place.name}</p>
          {gem && (
            <span className="shrink-0 rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-950">
              ⭐ Local gem
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-slate-500">
          {label}
          {place.distance_m != null && ` · 🚶 ${walkMin(place.distance_m)} min walk`}
          {place.url && (
            <>
              {' · '}
              <a
                href={place.url}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-ember underline-offset-2 hover:underline"
              >
                Website ↗
              </a>
            </>
          )}
        </p>
        {place.description && <p className="mt-1 line-clamp-2 text-sm text-slate-600">{place.description}</p>}
      </div>
    </div>
  )
}
