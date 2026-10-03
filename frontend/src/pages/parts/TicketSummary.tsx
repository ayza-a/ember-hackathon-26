// OWNER: workstream 3 (Frontend). Fares per friend, the group total, a split-the-bill line and booking links.
import type { Friend, Plan } from '../../types'
import { Avatar, Icon, RouteBadge } from '../../ui/bits'
import { co2SavedKg, EMBER_BOOKING_URL } from '../../ui/util'

export default function TicketSummary({ plan, friends, meId }: { plan: Plan; friends: Friend[]; meId?: number | null }) {
  const rows = plan.friends
    .map((fp) => ({ fp, f: friends.find((x) => x.id === fp.friend_id) }))
    .filter((r) => r.f && r.fp.journey && r.fp.journey.legs.length > 0)
  if (rows.length === 0) return null
  const total = plan.total_price_gbp ?? rows.reduce((a, r) => a + (r.fp.journey!.price_gbp ?? 0), 0)
  const km = rows.reduce((a, r) => a + r.fp.journey!.total_km, 0)
  return (
    <section className="card p-5" aria-labelledby="tickets-h">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs font-bold tracking-widest text-teal uppercase">Tickets</p>
          <h2 id="tickets-h" className="display text-2xl">What it costs</h2>
        </div>
        <a className="btn btn-sm" href={EMBER_BOOKING_URL} target="_blank" rel="noreferrer"><Icon name="ticket" className="h-4 w-4" /> Book on Ember</a>
      </div>
      <ul className="mt-4 divide-y divide-dashed divide-line">
        {rows.map(({ fp, f }) => (
          <li key={fp.friend_id} className={`flex items-center gap-3 py-2.5 ${fp.friend_id === meId ? 'font-semibold' : ''}`}>
            <Avatar friend={f!} size={28} you={fp.friend_id === meId} />
            <span className="w-20 truncate text-sm">{f!.name}</span>
            <span className="flex flex-1 flex-wrap gap-1">{fp.journey!.legs.map((l, i) => <RouteBadge key={i} route={l.route_id} />)}</span>
            <span className="font-display text-lg font-extrabold tabular-nums">{fp.journey!.price_gbp != null ? `£${fp.journey!.price_gbp.toFixed(2)}` : '—'}</span>
          </li>
        ))}
      </ul>
      <div className="mt-2 grid grid-cols-3 divide-x divide-line rounded-2xl bg-surface-2 py-3 text-center">
        <div><p className="font-display text-xl font-extrabold">£{total.toFixed(2)}</p><p className="text-[11px] text-ink-soft">group total</p></div>
        <div><p className="font-display text-xl font-extrabold">£{(total / rows.length).toFixed(2)}</p><p className="text-[11px] text-ink-soft">each, split evenly</p></div>
        <div><p className="font-display text-xl font-extrabold text-teal">🌱 {Math.round(co2SavedKg(km))} kg</p><p className="text-[11px] text-ink-soft">CO₂ saved vs driving</p></div>
      </div>
      <p className="mt-2 text-[11px] text-ink-soft">Fares are Ember's standard adult singles from the timetable; book each bus on ember.to.</p>
    </section>
  )
}
