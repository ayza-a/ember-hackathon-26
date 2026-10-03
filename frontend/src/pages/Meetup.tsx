// OWNER: workstream 3 (Frontend). Shareable meetup page: join form, friends, plan or suggestions, map, places.
import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../api'
import AreaSearch from '../components/AreaSearch'
import FriendCard from '../components/FriendCard'
import MapView from '../components/MapView'
import MeetEventCard from '../components/MeetEventCard'
import PlacesPanel from '../components/PlacesPanel'
import Suggestions from '../components/Suggestions'
import Timeline from '../components/Timeline'
import type { Area, Meetup, MeetupSuggestion, Plan } from '../types'

export default function MeetupPage() {
  const { slug = '' } = useParams()
  const [meetup, setMeetup] = useState<Meetup | null>(null)
  const [plan, setPlan] = useState<Plan | null>(null)
  const [suggestions, setSuggestions] = useState<MeetupSuggestion[]>([])
  const [focus, setFocus] = useState<{ lat: number; lon: number } | null>(null)
  const [name, setName] = useState('')
  const [origin, setOrigin] = useState<Area | null>(null)
  const [departAfter, setDepartAfter] = useState('08:00')

  const refresh = useCallback(async () => {
    const m = await api.getMeetup(slug)
    setMeetup(m)
    if (m.friends.length === 0) return
    if (m.mode === 'arrive') setPlan(await api.getPlan(slug))
    else setSuggestions(await api.getSuggestions(slug))
  }, [slug])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 5000) // friends joining from other phones show up live
    return () => clearInterval(id)
  }, [refresh])

  async function join(e: React.FormEvent) {
    e.preventDefault()
    if (!origin || !meetup) return
    await api.joinMeetup(slug, {
      name,
      origin_area_id: origin.id,
      earliest_departure: meetup.mode === 'suggest' ? `${meetup.date}T${departAfter}:00` : null,
    })
    setName('')
    refresh()
  }

  if (!meetup) return <p className="p-6">Loading…</p>
  const placeAreaIds = plan
    ? [plan.destination.id, ...plan.meet_events.map((e) => e.area.id)]
    : suggestions.map((s) => s.area.id)

  return (
    <main className="mx-auto grid max-w-6xl gap-6 p-6 lg:grid-cols-[1fr_1.2fr]">
      <section className="space-y-4">
        <h1 className="text-2xl font-bold">{meetup.title ?? 'Group trip'}</h1>
        <button className="text-sm text-ember underline" onClick={() => navigator.clipboard.writeText(location.href)}>
          Copy invite link
        </button>
        <form onSubmit={join} className="space-y-2 rounded-xl bg-white p-4 shadow">
          <input className="w-full rounded border p-2" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} required />
          <AreaSearch placeholder="Where are you travelling from?" onSelect={setOrigin} />
          {meetup.mode === 'suggest' && (
            <input className="w-full rounded border p-2" type="time" value={departAfter} onChange={(e) => setDepartAfter(e.target.value)} />
          )}
          <button className="w-full rounded bg-ember p-2 font-semibold text-white disabled:opacity-50" disabled={!origin}>
            Join
          </button>
        </form>
        {meetup.friends.map((f) => (
          <FriendCard key={f.id} friend={f} journey={plan?.friends.find((p) => p.friend_id === f.id)?.journey} />
        ))}
        {plan?.meet_events.map((e, i) => <MeetEventCard key={i} event={e} friends={meetup.friends} />)}
        {meetup.mode === 'suggest' && (
          <Suggestions
            suggestions={suggestions}
            friends={meetup.friends}
            onPick={async (s) => {
              await api.pickSuggestion(slug, { area_id: s.area.id, target_time: s.meet_time })
              refresh()
            }}
          />
        )}
      </section>
      <section className="space-y-4">
        <MapView friends={meetup.friends} plan={plan} suggestions={suggestions} focus={focus} />
        {plan && <Timeline friends={meetup.friends} plan={plan} />}
        <PlacesPanel areaIds={placeAreaIds} onSelectPlace={(lat, lon) => setFocus({ lat, lon })} />
      </section>
    </main>
  )
}
