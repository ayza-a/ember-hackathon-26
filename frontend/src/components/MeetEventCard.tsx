// OWNER: workstream 4 (Discovery). "Ben boards Anna's bus at Perth" / "25 min together at Glasgow, Café X nearby".
// FROZEN PROPS (used by pages/Meetup.tsx): event, friends.
// STUB: text only. TODO: fetch a top place near event.area for same_change events, friend avatars.
import type { Friend, MeetEvent } from '../types'
import { hhmm } from '../format'

export default function MeetEventCard({ event, friends }: { event: MeetEvent; friends: Friend[] }) {
  const who = event.friend_ids.map((id) => friends.find((f) => f.id === id)).filter(Boolean) as Friend[]
  return (
    <div className="rounded-xl border-2 border-ember bg-white p-3 shadow">
      <p className="text-xs font-semibold uppercase text-ember">{event.kind === 'same_bus' ? 'Same bus' : 'Meet while changing'}</p>
      <p className="font-medium">{event.description}</p>
      <p className="text-sm text-slate-600">
        {event.area.name} · {hhmm(event.start)}–{hhmm(event.end)} · {who.map((f) => f.name).join(' & ')}
      </p>
    </div>
  )
}
