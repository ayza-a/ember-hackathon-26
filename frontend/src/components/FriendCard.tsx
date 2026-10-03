// OWNER: workstream 3 (Frontend). One friend's journey as a mini itinerary (opened from the avatar row).
import { hhmm } from '../format'
import type { Area, Friend, FriendPlan } from '../types'
import { Avatar, Icon, RouteBadge } from '../ui/bits'
import { download, EMBER_BOOKING_URL, fmtDur, icsFor, minsBetween, shortName } from '../ui/util'

interface Props {
  friend: Friend
  plan?: FriendPlan | null
  isYou?: boolean
  tripTitle?: string
  onWaitClick?: (a: Area) => void
  onClose?: () => void
}

export default function FriendCard({ friend, plan, isYou, tripTitle = 'Group trip', onWaitClick, onClose }: Props) {
  const j = plan?.journey
  return (
    <div className="card animate-fade-up p-5">
      <div className="flex items-center gap-3">
        <Avatar friend={friend} size={48} you={isYou} />
        <div className="min-w-0 flex-1">
          <p className="display truncate text-xl normal-case">{friend.name}{isYou && <span className="ml-2 align-middle text-xs font-bold text-teal">THAT'S YOU</span>}</p>
          <p className="truncate text-sm text-ink-soft">from {friend.origin.name}</p>
        </div>
        {onClose && (
          <button onClick={onClose} className="rounded-full p-1.5 text-ink-soft hover:bg-surface-2" aria-label="Close">
            <Icon name="close" />
          </button>
        )}
      </div>

      {!plan && <p className="mt-4 text-sm text-ink-soft">Planning {friend.name}'s journey…</p>}
      {plan && !j && <p className="mt-4 rounded-2xl bg-surface-2 p-3 text-sm">🤔 {plan.note ?? 'No bus gets there in time from here.'}</p>}
      {j && j.legs.length === 0 && <p className="mt-4 rounded-2xl bg-surface-2 p-3 text-sm">🏡 {plan?.note ?? 'Already there!'}</p>}

      {j && j.legs.length > 0 && (
        <>
          <div className="mt-4 grid grid-cols-3 divide-x divide-line rounded-2xl bg-surface-2 py-2 text-center">
            <Stat value={`${hhmm(j.departure)}–${hhmm(j.arrival)}`} label="leave · arrive" />
            <Stat value={j.changes === 0 ? 'Direct' : `${j.changes} change${j.changes > 1 ? 's' : ''}`} label={`${Math.round(j.total_km)} km`} />
            <Stat value={j.price_gbp != null ? `£${j.price_gbp.toFixed(2)}` : '—'} label="fare" />
          </div>

          <ol className="mt-4 space-y-0">
            {j.legs.map((l, i) => {
              const next = j.legs[i + 1]
              return (
                <li key={i}>
                  <div className="flex gap-3">
                    <div className="flex flex-col items-center pt-1">
                      <span className="h-3.5 w-3.5 rounded-full border-[3px] border-[#2b2226] bg-white" />
                      <span className="w-1.5 flex-1 rounded" style={{ background: friend.colour }} />
                    </div>
                    <div className="flex-1 pb-3">
                      <p className="text-sm"><b>{hhmm(l.departure)}</b> {l.from_area.name}</p>
                      <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-soft">
                        <RouteBadge route={l.route_id} />
                        {l.headsign && <span>towards {l.headsign}</span>}
                        <span>· {fmtDur(minsBetween(l.departure, l.arrival))} · {Math.round(l.dist_km)} km{l.price_gbp != null && ` · £${l.price_gbp.toFixed(2)}`}</span>
                      </p>
                    </div>
                  </div>
                  {next ? (
                    <div className="flex gap-3">
                      <div className="flex w-3.5 flex-col items-center"><span className="hatch w-1.5 flex-1 rounded" /></div>
                      <button onClick={() => onWaitClick?.(l.to_area)} className="mb-3 flex-1 rounded-xl bg-mint-soft px-3 py-2 text-left text-xs hover:bg-mint/40">
                        ☕ Change at <b>{shortName(l.to_area.name)}</b> · {fmtDur(minsBetween(l.arrival, next.departure))} — <u>things to do</u>
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-3">
                      <span className="mt-0.5 h-3.5 w-3.5 rounded-full border-[3px] border-[#2b2226] bg-pin" />
                      <p className="text-sm"><b>{hhmm(l.arrival)}</b> {l.to_area.name} 🏁</p>
                    </div>
                  )}
                </li>
              )
            })}
          </ol>

          <div className="mt-4 flex flex-wrap gap-2">
            <button className="btn btn-ghost btn-sm" onClick={() => download(`${friend.name}-journey.ics`, icsFor(tripTitle, j, friend.name))}>
              <Icon name="cal" className="h-4 w-4" /> Add to calendar
            </button>
            <a className="btn btn-sm" href={EMBER_BOOKING_URL} target="_blank" rel="noreferrer">
              <Icon name="ticket" className="h-4 w-4" /> Book on Ember
            </a>
          </div>
        </>
      )}
    </div>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="px-2">
      <p className="font-display text-base font-extrabold">{value}</p>
      <p className="text-[11px] text-ink-soft">{label}</p>
    </div>
  )
}
