// OWNER: workstream 3 (Frontend). Small pure helpers shared by the pages and components.
import { hhmm } from '../format'
import type { Area, Friend, Journey, Leg, MeetEvent, Plan } from '../types'

export const ms = (iso: string) => +new Date(iso)
export const minsBetween = (a: string, b: string) => Math.round((ms(b) - ms(a)) / 60000)

export function fmtDur(min: number) {
  const m = Math.max(0, Math.round(min))
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  return m % 60 ? `${h}h ${m % 60}m` : `${h}h`
}

/** "Inverness (City Centre)" -> "Inverness", "Aviemore Railway Station" -> "Aviemore" */
export function shortName(name: string) {
  return name
    .replace(/\s*\((City|Town) Centre\)/i, '')
    .replace(/\s+(Railway|Bus) Station$/i, '')
    .replace(/\s+Bus Station$/i, '')
    .trim()
}
/** Best guess at the town for an area (for illustrations, Wikipedia, podcasts). */
export const townOf = (a: Pick<Area, 'name' | 'region_name'>) => shortName(a.region_name || a.name).split(/[,(]/)[0].trim()

export const initials = (name: string) => name.trim().slice(0, 1).toUpperCase() || '?'

export function hash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

export const nameList = (names: string[]) =>
  names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`

export function friendsById(friends: Friend[]) {
  return new Map(friends.map((f) => [f.id, f]))
}

/** Waits between consecutive legs (changes). */
export function waits(j: Journey | null | undefined) {
  if (!j) return []
  const out: { area: Area; start: string; end: string; min: number }[] = []
  for (let i = 0; i + 1 < j.legs.length; i++) {
    const a = j.legs[i], b = j.legs[i + 1]
    out.push({ area: a.to_area, start: a.arrival, end: b.departure, min: minsBetween(a.arrival, b.departure) })
  }
  return out
}

// ---------------------------------------------------------------- "You" identity (per meetup, per browser)
export interface Me { friendId: number; name: string }
export function getMe(slug: string): Me | null {
  try { return JSON.parse(localStorage.getItem(`ember:me:${slug}`) ?? 'null') } catch { return null }
}
export function setMe(slug: string, me: Me | null) {
  try {
    if (me) localStorage.setItem(`ember:me:${slug}`, JSON.stringify(me))
    else localStorage.removeItem(`ember:me:${slug}`)
  } catch { /* private mode */ }
}

// ---------------------------------------------------------------- invite links that work from phones
declare const __LAN_HOST__: string // injected by vite.config.ts: this laptop's wifi IP
declare const __PUBLIC_URL__: string // injected by vite.config.ts: a public tunnel URL, if one is running
const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/
export function defaultInviteOrigin() {
  if (__PUBLIC_URL__) return __PUBLIC_URL__ // works from any network, phones included
  const { protocol, hostname, port } = window.location
  if (LOCAL.test(hostname) && __LAN_HOST__) return `${protocol}//${__LAN_HOST__}${port ? `:${port}` : ''}`
  return window.location.origin
}
export function inviteOrigin() {
  if (__PUBLIC_URL__) return __PUBLIC_URL__
  try { return localStorage.getItem('ember:inviteOrigin') || defaultInviteOrigin() } catch { return defaultInviteOrigin() }
}
export function saveInviteOrigin(origin: string) {
  try { localStorage.setItem('ember:inviteOrigin', origin.replace(/\/$/, '')) } catch { /* ignore */ }
}
export function isLocalOnly(origin: string) {
  try { return LOCAL.test(new URL(origin).hostname) } catch { return false }
}

// ---------------------------------------------------------------- story of the day
export interface StoryLine { icon: string; text: string; time: string; eventIndex?: number; friendIds: number[] }

/** Turns a plan into short plain-English lines, in time order. */
export function buildStory(plan: Plan, friends: Friend[]): StoryLine[] {
  const byId = friendsById(friends)
  const name = (id: number) => byId.get(id)?.name ?? 'Someone'
  const lines: StoryLine[] = []
  const inEvent = new Set(plan.meet_events.flatMap((e) => e.friend_ids))

  for (const fp of plan.friends) {
    const j = fp.journey
    const f = byId.get(fp.friend_id)
    if (!f) continue
    if (!j || j.legs.length === 0) {
      const home = (j && j.legs.length === 0) || /already/i.test(fp.note ?? '')
      // no time: these go at the top of the story
      lines.push({ icon: home ? '🏡' : '🤔', text: `${f.name}: ${fp.note ?? (home ? 'already there' : 'no bus gets there in time')}`, time: '', friendIds: [f.id] })
      continue
    }
    const first = j.legs[0]
    const via = j.legs.length > 1 ? `, changing at ${j.legs.slice(0, -1).map((l) => shortName(l.to_area.name)).join(' & ')}` : ''
    lines.push({
      icon: '🚏',
      text: `${f.name} leaves ${shortName(first.from_area.name)} at ${hhmm(first.departure)} on the ${first.route_id}${inEvent.has(f.id) ? '' : via}`,
      time: first.departure,
      friendIds: [f.id],
    })
  }
  plan.meet_events.forEach((e, i) => {
    lines.push({ icon: e.kind === 'same_bus' ? '🚌' : '☕', text: eventSentence(e, name), time: e.start, eventIndex: i, friendIds: e.friend_ids })
  })
  lines.sort((a, b) => (a.time ? ms(a.time) : 0) - (b.time ? ms(b.time) : 0))
  if (plan.first_arrival && plan.last_arrival) {
    const early = minsBetween(plan.last_arrival, plan.target_time)
    lines.push({
      icon: '🎉',
      text: `Everyone's in ${shortName(plan.destination.name)} between ${hhmm(plan.first_arrival)} and ${hhmm(plan.last_arrival)}${early > 0 ? ` — ${fmtDur(early)} before ${hhmm(plan.target_time)}` : ''}`,
      time: plan.last_arrival,
      friendIds: plan.friends.map((p) => p.friend_id),
    })
  }
  return lines
}

export function eventSentence(e: MeetEvent, name: (id: number) => string) {
  const who = nameList(e.friend_ids.map(name))
  const where = shortName(e.area.name)
  if (e.kind === 'same_change') return `${who} wait together at ${where} for ${fmtDur(minsBetween(e.start, e.end))}`
  return `${who} ride the same bus from ${where} at ${hhmm(e.start)}`
}

// ---------------------------------------------------------------- numbers for the stats strip
// UK gov conversion factors (2024): average car ~0.166 kg CO2e per vehicle-km, coach ~0.027 per passenger-km.
export const co2SavedKg = (km: number) => Math.max(0, km * (0.166 - 0.027))

export const legKey = (l: Pick<Leg, 'trip_id' | 'from_area' | 'to_area'>) => `${l.trip_id}:${l.from_area.id}:${l.to_area.id}`

// ---------------------------------------------------------------- calendar file
export function icsFor(title: string, j: Journey, friendName: string) {
  const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const events = j.legs.map((l, i) => [
    'BEGIN:VEVENT',
    `UID:${l.trip_id}-${i}-${hash(friendName)}@ember-group-journeys`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(l.departure)}`,
    `DTEND:${stamp(l.arrival)}`,
    `SUMMARY:🚌 Ember ${l.route_id}: ${shortName(l.from_area.name)} → ${shortName(l.to_area.name)}`,
    `LOCATION:${l.from_area.name}`,
    `DESCRIPTION:${title} — ${friendName}'s journey`,
    'END:VEVENT',
  ].join('\r\n'))
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Ember Group Journeys//EN', ...events, 'END:VCALENDAR'].join('\r\n')
}

export function download(filename: string, text: string, type = 'text/calendar') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ---------------------------------------------------------------- "while you wait": a bit of local history
export interface WikiSummary { title: string; extract: string; url: string; thumb?: string }
const wikiCache = new Map<string, Promise<WikiSummary | null>>()
export function wikiSummary(town: string) {
  if (!wikiCache.has(town)) {
    wikiCache.set(
      town,
      fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(town.replace(/ /g, '_'))}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d && d.type !== 'disambiguation' && d.extract
          ? { title: d.title, extract: d.extract, url: d.content_urls?.desktop?.page ?? '', thumb: d.thumbnail?.source }
          : null)
        .catch(() => null),
    )
  }
  return wikiCache.get(town)!
}

export const podcastSearchUrl = (town: string) => `https://open.spotify.com/search/${encodeURIComponent(`${town} history`)}/podcasts`
/** Copy text; falls back to a hidden textarea where the async clipboard API is missing or blocked (e.g. plain-http LAN URLs). */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch { /* fall through to the legacy path */ }
  const ta = Object.assign(document.createElement('textarea'), { value: text, readOnly: true })
  Object.assign(ta.style, { position: 'fixed', top: '0', left: '0', opacity: '0' })
  document.body.appendChild(ta)
  ta.select()
  let ok = false
  try { ok = document.execCommand('copy') } catch { ok = false }
  ta.remove()
  return ok
}

export const EMBER_BOOKING_URL = 'https://www.ember.to/'

/** Time window shown on the timeline (and played back): first departure → last arrival / target, on half hours. */
export function planRange(plan: Plan): [number, number] {
  const HALF = 30 * 60000
  const legs = plan.friends.flatMap((fp) => fp.journey?.legs ?? [])
  const target = ms(plan.target_time)
  const lo = Math.min(...legs.map((l) => ms(l.departure)), target - 3600000) - 10 * 60000
  const hi = Math.max(...legs.map((l) => ms(l.arrival)), target) + 10 * 60000
  return [Math.floor(lo / HALF) * HALF, Math.ceil(hi / HALF) * HALF]
}
