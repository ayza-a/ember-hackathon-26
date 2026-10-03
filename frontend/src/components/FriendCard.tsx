// OWNER: workstream 3 (Frontend). One friend + their journey summary.
import { hhmm } from '../format'
import type { Friend, Journey } from '../types'

export default function FriendCard({ friend, journey }: { friend: Friend; journey?: Journey | null }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-white p-3 shadow">
      <span className="h-4 w-4 rounded-full" style={{ background: friend.colour }} />
      <div className="flex-1">
        <p className="font-semibold">{friend.name} <span className="font-normal text-slate-500">from {friend.origin.name}</span></p>
        {journey && (
          <p className="text-sm text-slate-600">
            {hhmm(journey.departure)} → {hhmm(journey.arrival)} · {journey.changes} change{journey.changes === 1 ? '' : 's'} · {journey.total_km} km
            {journey.price_gbp != null && ` · £${journey.price_gbp.toFixed(2)}`}
          </p>
        )}
      </div>
    </div>
  )
}
