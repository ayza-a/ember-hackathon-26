// Typed API client. FROZEN SHARED FILE.
// Set VITE_USE_MOCKS=1 (e.g. `VITE_USE_MOCKS=1 npm run dev`) to work without the backend.
// Mock scenarios (built from the real Ember timetable) live in src/mocks/; see src/mocks/README.md for the slugs.
import arriveMock from './mocks/arrive.json'
import arriveEdgeMock from './mocks/arrive_edge.json'
import emptyMock from './mocks/empty.json'
import routesMock from './mocks/routes.json'
import suggestMock from './mocks/suggest.json'
import suggestPickedMock from './mocks/suggest_picked.json'
import type {
  Area, Friend, FriendIn, Meetup, MeetupCreate, MeetupSuggestion, PickSuggestion, Place, Plan, RouteLine,
  ServiceUpdate,
} from './types'

export const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === '1'

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`)
  return res.json() as Promise<T>
}

const post = <T>(path: string, body: unknown) => req<T>(path, { method: 'POST', body: JSON.stringify(body) })

// ---------------------------------------------------------------- mock mode
interface MockScenario { meetup: unknown; plan?: unknown; suggestions?: unknown }
const SCENARIOS: Record<string, MockScenario> = Object.fromEntries(
  [arriveMock, arriveEdgeMock, emptyMock, suggestMock, suggestPickedMock].map((m) => [(m.meetup as Meetup).slug, m]),
)
const SUGGEST_SLUG = (suggestMock.meetup as Meetup).slug
let suggestPicked = false // after "Pick this", the suggest scenario turns into its picked (arrive) version
const scenario = (slug: string): MockScenario =>
  slug === SUGGEST_SLUG && suggestPicked ? suggestPickedMock : SCENARIOS[slug] ?? arriveMock
const mock = <T>(value: unknown) => new Promise<T>((r) => setTimeout(() => r(value as T), 300)) // fake latency
const MOCK_AREAS: Area[] = [
  ...new Map(
    Object.values(SCENARIOS)
      .flatMap((s) => [(s.meetup as Meetup).destination, ...(s.meetup as Meetup).friends.map((f) => f.origin)])
      .filter((a): a is Area => !!a)
      .map((a) => [a.id, a]),
  ).values(),
]
let mockFriendId = 1000

export const api = {
  searchLocations: (q: string, limit = 8) =>
    USE_MOCKS
      ? mock<Area[]>(MOCK_AREAS.filter((a) => a.name.toLowerCase().includes(q.toLowerCase())).slice(0, limit))
      : req<Area[]>(`/locations/search?q=${encodeURIComponent(q)}&limit=${limit}`),

  createMeetup: (body: MeetupCreate) =>
    USE_MOCKS ? mock<Meetup>(body.mode === 'suggest' ? suggestMock.meetup : arriveMock.meetup) : post<Meetup>('/meetups', body),
  getMeetup: (slug: string) =>
    USE_MOCKS ? mock<Meetup>(scenario(slug).meetup) : req<Meetup>(`/meetups/${slug}`),
  joinMeetup: (slug: string, body: FriendIn) =>
    USE_MOCKS
      ? mock<Friend>({ id: mockFriendId++, name: body.name, origin: MOCK_AREAS.find((a) => a.id === body.origin_area_id) ?? MOCK_AREAS[0], earliest_departure: body.earliest_departure, colour: '#14b8a6' })
      : post<Friend>(`/meetups/${slug}/friends`, body),
  pickSuggestion: (slug: string, body: PickSuggestion) => {
    if (!USE_MOCKS) return post<Meetup>(`/meetups/${slug}/pick`, body)
    suggestPicked = true
    return mock<Meetup>(suggestPickedMock.meetup)
  },

  getPlan: (slug: string) =>
    USE_MOCKS ? mock<Plan>(scenario(slug).plan ?? arriveMock.plan) : req<Plan>(`/meetups/${slug}/plan`),
  getSuggestions: (slug: string) =>
    USE_MOCKS ? mock<MeetupSuggestion[]>(scenario(slug).suggestions ?? []) : req<MeetupSuggestion[]>(`/meetups/${slug}/suggestions`),

  routeLine: (tripId: string, fromAreaId: number, toAreaId: number) => {
    if (!USE_MOCKS) {
      return req<RouteLine>(`/routes/line?trip_id=${encodeURIComponent(tripId)}&from_area_id=${fromAreaId}&to_area_id=${toAreaId}`)
    }
    const line = (routesMock.lines as unknown as Record<string, RouteLine>)[`${tripId}:${fromAreaId}:${toAreaId}`]
    return line ? mock<RouteLine>(line) : Promise.reject(new Error('no mock route line'))
  },
  serviceUpdate: () =>
    USE_MOCKS
      ? mock<ServiceUpdate>({ type: 'custom', short_message: '(Sample banner) Some services are running with minor delays today.' })
      : req<ServiceUpdate>('/service-update'),

  places: (areaIds: number[], category?: string, limit = 20) =>
    req<Place[]>(`/places?area_ids=${areaIds.join(',')}${category ? `&category=${category}` : ''}&limit=${limit}`),
  placesSummary: (areaIds: number[]) =>
    req<Record<number, Record<string, number>>>(`/places/summary?area_ids=${areaIds.join(',')}`),
}
