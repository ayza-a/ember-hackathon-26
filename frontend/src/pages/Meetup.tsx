// OWNER: workstream 3 (Frontend). Shareable meetup page (/m/{slug}).
// Left: header panel (avatars, stats, invite) → story → timeline → meet-ups → while-you-wait → tickets → places.
// Right: sticky map. A floating "Join this trip" button opens the join sheet. Polls every 5 s for new friends.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, USE_MOCKS } from '../api'
import FriendCard from '../components/FriendCard'
import MapView, { type Hover } from '../components/MapView'
import MeetEventCard from '../components/MeetEventCard'
import PlacesPanel from '../components/PlacesPanel'
import Suggestions from '../components/Suggestions'
import Timeline from '../components/Timeline'
import { hhmm } from '../format'
import type { Area, Friend, FriendPlan, Meetup, MeetupSuggestion, Plan } from '../types'
import { Avatar, Icon, SectionTitle } from '../ui/bits'
import { confetti } from '../ui/confetti'
import Sheet from '../ui/Sheet'
import { toast } from '../ui/toast'
import { co2SavedKg, fmtDur, getMe, planRange, setMe, shortName, type Me } from '../ui/util'
import Invite from './parts/Invite'
import JoinSheet from './parts/JoinSheet'
import StoryCard from './parts/StoryCard'
import TicketSummary from './parts/TicketSummary'
import WaitCard from './parts/WaitCard'

const POLL_MS = 5000
const PLAYBACK_MS = 16000 // how long "Play the day" takes end to end

export default function MeetupPage() {
  const { slug = '' } = useParams()
  const [meetup, setMeetup] = useState<Meetup | null>(null)
  const [plan, setPlan] = useState<Plan | null>(null)
  const [suggestions, setSuggestions] = useState<MeetupSuggestion[]>([])
  const [loadingResult, setLoadingResult] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [offline, setOffline] = useState(false)
  const [localFriends, setLocalFriends] = useState<Friend[]>([]) // mock mode doesn't persist joins
  const [me, setMeState] = useState<Me | null>(() => getMe(slug))

  const [hover, setHover] = useState<Hover>({})
  const [selectedFriend, setSelectedFriend] = useState<number | null>(null)
  const [activeSuggestion, setActiveSuggestion] = useState(0)
  const [waitArea, setWaitArea] = useState<Area | null>(null)
  const [focus, setFocus] = useState<{ lat: number; lon: number } | null>(null)
  const [joinOpen, setJoinOpen] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [playTime, setPlayTime] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)

  // ------------------------------------------------------------ data + polling
  const sig = useRef('')
  const meetupRef = useRef<Meetup | null>(null)
  useEffect(() => { meetupRef.current = meetup }, [meetup])
  const knownIds = useRef<Set<number> | null>(null)
  const refresh = useCallback(async () => {
    try {
      const m = await api.getMeetup(slug)
      setOffline(false)
      setError(null)
      setMeetup(m)
      // toast new arrivals (not on first load, not yourself)
      const ids = new Set(m.friends.map((f) => f.id))
      if (knownIds.current) {
        for (const f of m.friends) {
          if (!knownIds.current.has(f.id) && f.id !== getMe(slug)?.friendId) toast(`${f.name} just joined from ${shortName(f.origin.name)}`, '🎉')
        }
      }
      knownIds.current = ids
      // only re-plan when something that affects the plan changed
      const s = [m.mode, m.destination?.id, m.target_time, m.friends.map((f) => `${f.id}@${f.origin.id}@${f.earliest_departure}`).join(',')].join('|')
      if (s === sig.current) return
      sig.current = s
      if (m.friends.length === 0) { setPlan(null); setSuggestions([]); return }
      setLoadingResult(true)
      try {
        if (m.mode === 'arrive') { setPlan(await api.getPlan(slug)); setSuggestions([]) }
        else { setSuggestions(await api.getSuggestions(slug)); setPlan(null) }
      } finally {
        setLoadingResult(false)
      }
    } catch (err) {
      if (!meetupRef.current) setError(err instanceof Error ? err.message : String(err))
      else setOffline(true)
      sig.current = '' // retry the plan next time
    }
  }, [slug])
  useEffect(() => {
    sig.current = ''
    knownIds.current = null
    refresh()
    const id = setInterval(() => { if (!document.hidden) refresh() }, POLL_MS) // friends joining from other phones show up live
    const onVis = () => !document.hidden && refresh()
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis) }
  }, [slug, refresh])

  // ------------------------------------------------------------ journey playback
  const range = useMemo(() => (plan ? planRange(plan) : null), [plan])
  useEffect(() => {
    if (!playing || !range) return
    let raf = 0, last = performance.now()
    const step = (now: number) => {
      const dt = now - last
      last = now
      setPlayTime((t) => {
        const next = (t ?? range[0]) + (dt * (range[1] - range[0])) / PLAYBACK_MS
        if (next >= range[1]) { setPlaying(false); return range[1] }
        return next
      })
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [playing, range])
  const togglePlay = () => {
    if (!range) return
    if (!playing && (playTime == null || playTime >= range[1])) setPlayTime(range[0])
    setPlaying((p) => !p)
  }

  // ------------------------------------------------------------ derived
  const friends = useMemo(() => {
    if (!meetup) return []
    const ids = new Set(meetup.friends.map((f) => f.id))
    return [...meetup.friends, ...localFriends.filter((f) => !ids.has(f.id))]
  }, [meetup, localFriends])
  const meId = me && friends.some((f) => f.id === me.friendId) ? me.friendId : null

  const activeS = suggestions[Math.min(activeSuggestion, suggestions.length - 1)]
  const journeys: FriendPlan[] = plan?.friends ?? activeS?.journeys ?? []
  const suggestionAreas = useMemo(() => suggestions.map((s) => s.area), [suggestions])
  const changeAreas = useMemo(() => {
    const m = new Map<number, Area>()
    for (const fp of plan?.friends ?? []) for (const l of fp.journey?.legs.slice(0, -1) ?? []) m.set(l.to_area.id, l.to_area)
    return [...m.values()]
  }, [plan])
  const placeAreas = useMemo<Area[]>(() => {
    if (plan) {
      const m = new Map<number, Area>([[plan.destination.id, plan.destination]])
      for (const e of plan.meet_events) m.set(e.area.id, e.area)
      for (const a of changeAreas) m.set(a.id, a)
      return [...m.values()]
    }
    return suggestionAreas
  }, [plan, changeAreas, suggestionAreas])
  const placeAreaIds = useMemo(() => placeAreas.map((a) => a.id), [placeAreas])

  const onSelectPlace = useCallback((lat: number, lon: number) => setFocus({ lat, lon }), [])
  const onSelectSuggestion = useCallback((i: number) => setActiveSuggestion(i), [])

  async function pick(s: MeetupSuggestion) {
    try {
      const m = await api.pickSuggestion(slug, { area_id: s.area.id, target_time: s.meet_time })
      setMeetup(m)
      sig.current = ''
      await refresh()
      confetti(0.5, 0.3)
      toast(`It's ${shortName(s.area.name)}! Buses synced for everyone`, '📍')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      toast(`Couldn't pick that: ${err instanceof Error ? err.message : err}`, '⚠️')
    }
  }

  // ------------------------------------------------------------ render
  if (error && !meetup) {
    return (
      <main className="mx-auto max-w-md p-10 text-center">
        <p className="text-6xl">🚏</p>
        <h1 className="display mt-4 text-4xl">Trip not found</h1>
        <p className="mt-2 text-sm text-ink-soft">{error.startsWith('404') ? 'This invite link doesn\'t match a trip. Check the link with whoever sent it.' : 'We couldn\'t reach the server. Is the backend running?'}</p>
        <Link to="/" className="btn mt-6">Start a new trip</Link>
      </main>
    )
  }
  if (!meetup) return <PageSkeleton />

  const arrive = meetup.mode === 'arrive'
  const selected = friends.find((f) => f.id === selectedFriend)

  return (
    <main className="mx-auto grid max-w-7xl gap-6 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] lg:py-8">
      {/* ======================= map (sticky on desktop, on top on phones) */}
      <aside className="order-first lg:order-last">
        <div className="lg:sticky lg:top-20">
          <MapView
            className="h-[46vh] rounded-[32px] border-4 border-[#2b2226] lg:h-[calc(100vh-7rem)]"
            friends={friends}
            journeys={journeys}
            destination={arrive ? (plan?.destination ?? meetup.destination) : null}
            meetEvents={plan?.meet_events ?? []}
            suggestions={arrive ? [] : suggestionAreas}
            hover={hover}
            onHover={setHover}
            onSelectSuggestion={onSelectSuggestion}
            focus={focus}
            anchors={placeAreas}
            playTime={playTime}
            meId={meId}
          />
        </div>
      </aside>

      {/* ======================= content column */}
      <div className="min-w-0 space-y-6 pb-24">
        <HeaderPanel
          meetup={meetup} plan={plan} friends={friends} meId={meId} offline={offline}
          selectedFriend={selectedFriend}
          onSelectFriend={(id) => { setSelectedFriend((cur) => (cur === id ? null : id)); setHover(id != null ? { friendId: id } : {}) }}
          onHoverFriend={(id) => setHover(id != null ? { friendId: id } : {})}
          onInvite={() => setInviteOpen(true)}
          onLeave={() => { setMe(slug, null); setMeState(null) }}
        />

        {selected && (
          <FriendCard
            friend={selected}
            plan={(plan?.friends ?? activeS?.journeys)?.find((p) => p.friend_id === selected.id) ?? null}
            isYou={selected.id === meId}
            tripTitle={meetup.title ?? 'Group trip'}
            onWaitClick={setWaitArea}
            onClose={() => setSelectedFriend(null)}
          />
        )}

        {friends.length === 0 && <EmptyState slug={slug} onJoin={() => setJoinOpen(true)} />}

        {arrive && friends.length > 0 && (
          loadingResult && !plan ? <div className="space-y-4"><div className="skeleton h-64" /><div className="skeleton h-72" /></div> : plan && (
            <>
              <StoryCard plan={plan} friends={friends} onHover={setHover} meId={meId} />

              <section className="card p-5" aria-labelledby="tl-h">
                <SectionTitle kicker="Everyone's day" title="Timeline" />
                <span id="tl-h" className="sr-only">Timeline</span>
                <Timeline
                  friends={friends} plan={plan} hover={hover} onHover={setHover}
                  playTime={playTime} playing={playing} onTogglePlay={togglePlay}
                  onScrub={(t) => { setPlaying(false); setPlayTime(t) }}
                  onWaitClick={setWaitArea} meId={meId}
                />
              </section>

              {waitArea && <WaitCard area={waitArea} plan={plan} friends={friends} onClose={() => setWaitArea(null)} />}

              {plan.meet_events.length > 0 && (
                <section aria-labelledby="meet-h">
                  <SectionTitle kicker="Better together" title="Meet-ups on the way" />
                  <span id="meet-h" className="sr-only">Meet-ups on the way</span>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {plan.meet_events.map((e, i) => (
                      <div key={i} className={`rounded-2xl transition ${hover.eventIndex === i ? 'ring-4 ring-mint' : ''}`}
                        onMouseEnter={() => setHover({ eventIndex: i })} onMouseLeave={() => setHover({})}>
                        <MeetEventCard event={e} friends={friends} />
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {changeAreas.length > 0 && !waitArea && (
                <section className="card flex flex-wrap items-center gap-3 p-4">
                  <span className="text-2xl">☕</span>
                  <p className="flex-1 text-sm"><b>Changing buses?</b> Make the wait part of the trip: local history, podcasts and coffee spots.</p>
                  <div className="flex flex-wrap gap-2">
                    {changeAreas.map((a) => <button key={a.id} className="chip hover:bg-mint-soft" onClick={() => setWaitArea(a)}>{shortName(a.name)}</button>)}
                  </div>
                </section>
              )}

              <TicketSummary plan={plan} friends={friends} meId={meId} />
            </>
          )
        )}

        {!arrive && friends.length > 0 && (
          <section aria-labelledby="sugg-h">
            <SectionTitle kicker="Where should we meet?" title="Top picks for the group" />
            <span id="sugg-h" className="sr-only">Suggestions</span>
            <Suggestions
              suggestions={suggestions} friends={friends} onPick={pick}
              hover={hover} onHover={setHover} active={activeSuggestion} onSelect={onSelectSuggestion}
              loading={loadingResult && suggestions.length === 0}
            />
          </section>
        )}

        {placeAreaIds.length > 0 && <PlacesPanel areaIds={placeAreaIds} onSelectPlace={onSelectPlace} />}
      </div>

      {/* ======================= floating join button + sheets */}
      {!meId ? (
        <button onClick={() => setJoinOpen(true)} className="btn btn-teal fixed bottom-5 ring-4 ring-white/70 left-1/2 z-40 -translate-x-1/2 px-7 py-4 text-base shadow-2xl lg:left-[calc(50%-25%)]">
          <Icon name="users" /> Join this trip
        </button>
      ) : null}
      <JoinSheet meetup={meetup} open={joinOpen} onClose={() => setJoinOpen(false)}
        onJoined={(f) => {
          setMeState({ friendId: f.id, name: f.name })
          if (USE_MOCKS) setLocalFriends((xs) => [...xs, f])
          sig.current = ''
          refresh()
        }} />
      <Sheet open={inviteOpen} onClose={() => setInviteOpen(false)} label="Invite friends">
        <h2 className="display mb-4 text-3xl">Invite the crew</h2>
        <Invite slug={slug} />
      </Sheet>
    </main>
  )
}

// ================================================================ header panel
interface HeaderProps {
  meetup: Meetup; plan: Plan | null; friends: Friend[]; meId: number | null; offline: boolean
  selectedFriend: number | null
  onSelectFriend: (id: number | null) => void
  onHoverFriend: (id: number | null) => void
  onInvite: () => void
  onLeave: () => void
}
function HeaderPanel({ meetup, plan, friends, meId, offline, selectedFriend, onSelectFriend, onHoverFriend, onInvite, onLeave }: HeaderProps) {
  const arrive = meetup.mode === 'arrive'
  const date = new Date(`${meetup.date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
  const me = friends.find((f) => f.id === meId)
  const legsKm = plan?.friends.reduce((a, fp) => a + (fp.journey?.total_km ?? 0), 0) ?? 0
  return (
    <section className={`rounded-[36px] p-3 ${arrive ? 'bg-teal text-white' : 'bg-teal-deep text-white'}`}>
      <div className="px-3 pt-3 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold tracking-widest uppercase opacity-80">{date}{offline && ' · reconnecting…'}</p>
            <h1 className="display mt-1 text-4xl break-words sm:text-5xl">{meetup.title ?? 'Group trip'}</h1>
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-semibold">
              {arrive && meetup.destination ? (
                <><span>📍 {meetup.destination.name}</span>{meetup.target_time && <span>⏰ arrive by {hhmm(meetup.target_time)}</span>}</>
              ) : <span>🧭 Finding the fairest place to meet</span>}
            </p>
          </div>
          <button onClick={onInvite} className={`btn btn-sm shrink-0 ${arrive ? '' : ''}`} aria-label="Invite friends">
            <Icon name="qr" className="h-4 w-4" /> Invite
          </button>
        </div>
      </div>

      <div className="ticket ticket-handle px-5 pt-9 pb-5 text-ink" style={{ color: 'var(--teal)' }}>
        <div className="text-ink">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex -space-x-2.5" role="list" aria-label="Friends on this trip">
              {friends.map((f) => (
                <button
                  key={f.id}
                  role="listitem"
                  onClick={() => onSelectFriend(f.id)}
                  onMouseEnter={() => onHoverFriend(f.id)}
                  onMouseLeave={() => onHoverFriend(null)}
                  className={`animate-pop rounded-full transition hover:z-10 hover:-translate-y-1 ${selectedFriend === f.id ? 'z-10 -translate-y-1' : ''}`}
                  aria-pressed={selectedFriend === f.id}
                  aria-label={`${f.name} from ${f.origin.name}${f.id === meId ? ' (you)' : ''}`}
                >
                  <Avatar friend={f} size={46} ring={selectedFriend === f.id} you={f.id === meId} />
                </button>
              ))}
              <button onClick={onInvite} className="grid h-[46px] w-[46px] place-items-center rounded-full border-[3px] border-dashed border-line bg-surface-2 text-xl text-ink-soft hover:text-ink" aria-label="Invite more friends">+</button>
            </div>
            <div className="text-sm">
              <p className="font-display text-lg font-extrabold">{friends.length} {friends.length === 1 ? 'friend' : 'friends'}</p>
              <p className="text-xs text-ink-soft">{friends.length ? 'Tap a face to see their journey' : 'No one yet. Share the invite!'}</p>
            </div>
          </div>

          {arrive && plan && plan.spread_min != null && (
            <div className="mt-5 grid grid-cols-2 gap-y-3 border-t border-line pt-4 text-center sm:grid-cols-4 sm:divide-x sm:divide-line">
              <Stat value={fmtDur(plan.spread_min)} label="between arrivals" />
              <Stat value={plan.total_price_gbp != null ? `£${plan.total_price_gbp.toFixed(2)}` : '—'} label="all tickets" />
              <Stat value={String(plan.meet_events.length)} label={plan.meet_events.length === 1 ? 'meet-up on the way' : 'meet-ups on the way'} />
              <Stat value={`${Math.round(co2SavedKg(legsKm))} kg`} label="CO₂ saved 🌱" />
            </div>
          )}

          {me && (
            <div className="mt-4 flex items-center gap-2 rounded-2xl bg-teal-soft px-3 py-2 text-sm">
              <Icon name="check" className="h-4 w-4 text-teal" />
              <span className="flex-1">You're in as <b>{me.name}</b></span>
              <button onClick={onLeave} className="text-xs text-ink-soft underline">Not you?</button>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="px-2">
      <p className="font-display text-2xl font-extrabold">{value}</p>
      <p className="text-[11px] text-ink-soft">{label}</p>
    </div>
  )
}

function EmptyState({ slug, onJoin }: { slug: string; onJoin: () => void }) {
  return (
    <section className="card p-6 text-center">
      <p className="text-xs font-bold tracking-widest text-teal uppercase">Waiting for friends</p>
      <h2 className="display mt-1 text-3xl">Get the crew on board</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm text-ink-soft">Share the code or link. Everyone adds where they're starting from, and the plan builds itself here, live.</p>
      <div className="mt-5"><Invite slug={slug} /></div>
      <button className="btn btn-teal mt-5" onClick={onJoin}>I'm going too</button>
    </section>
  )
}

function PageSkeleton() {
  return (
    <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-2">
      <div className="space-y-4">
        <div className="skeleton h-56 rounded-[36px]" />
        <div className="skeleton h-72" />
        <div className="skeleton h-48" />
      </div>
      <div className="skeleton order-first h-[46vh] rounded-[32px] lg:order-last lg:h-[calc(100vh-7rem)]" />
    </main>
  )
}
