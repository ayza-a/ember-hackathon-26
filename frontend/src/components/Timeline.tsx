// OWNER: workstream 3 (Frontend). THE hero visual: one lane per friend, legs on a shared time axis.
// STUB: plain bars. TODO: change markers, meet-event connectors between lanes, labels, animation.
import type { Friend, Plan } from '../types'

export default function Timeline({ friends, plan }: { friends: Friend[]; plan: Plan }) {
  const legs = plan.friends.flatMap((fp) => fp.journey?.legs ?? [])
  if (legs.length === 0) return null
  const t0 = Math.min(...legs.map((l) => +new Date(l.departure)))
  const t1 = Math.max(...legs.map((l) => +new Date(l.arrival)))
  const pct = (iso: string) => ((+new Date(iso) - t0) / (t1 - t0 || 1)) * 100

  return (
    <div className="space-y-2 rounded-xl bg-white p-4 shadow">
      {plan.friends.map((fp) => {
        const f = friends.find((x) => x.id === fp.friend_id)
        return (
          <div key={fp.friend_id} className="flex items-center gap-2">
            <span className="w-16 truncate text-sm">{f?.name}</span>
            <div className="relative h-5 flex-1 rounded bg-slate-100">
              {fp.journey?.legs.map((l, i) => (
                <div
                  key={i}
                  className="absolute top-0 h-5 rounded"
                  style={{ left: `${pct(l.departure)}%`, width: `${pct(l.arrival) - pct(l.departure)}%`, background: f?.colour }}
                  title={`${l.route_id}: ${l.from_area.name} → ${l.to_area.name}`}
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
