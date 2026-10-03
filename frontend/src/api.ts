// Typed API client. FROZEN SHARED FILE.
// Set VITE_USE_MOCKS=1 (e.g. `VITE_USE_MOCKS=1 npm run dev`) to work without the backend:
// meetup/plan/suggestions then come from src/mocks/*.json.
import arriveMock from './mocks/arrive.json'
import suggestMock from './mocks/suggest.json'
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
const mockFor = (slug: string) => (slug === (suggestMock.meetup as Meetup).slug ? suggestMock : arriveMock)

export const api = {
  searchLocations: (q: string, limit = 8) =>
    req<Area[]>(`/locations/search?q=${encodeURIComponent(q)}&limit=${limit}`),

  createMeetup: (body: MeetupCreate) =>
    USE_MOCKS ? Promise.resolve(arriveMock.meetup as Meetup) : post<Meetup>('/meetups', body),
  getMeetup: (slug: string) =>
    USE_MOCKS ? Promise.resolve(mockFor(slug).meetup as Meetup) : req<Meetup>(`/meetups/${slug}`),
  joinMeetup: (slug: string, body: FriendIn) => post<Friend>(`/meetups/${slug}/friends`, body),
  pickSuggestion: (slug: string, body: PickSuggestion) => post<Meetup>(`/meetups/${slug}/pick`, body),

  getPlan: (slug: string) =>
    USE_MOCKS ? Promise.resolve(arriveMock.plan as Plan) : req<Plan>(`/meetups/${slug}/plan`),
  getSuggestions: (slug: string) =>
    USE_MOCKS ? Promise.resolve(suggestMock.suggestions as MeetupSuggestion[]) : req<MeetupSuggestion[]>(`/meetups/${slug}/suggestions`),

  routeLine: (tripId: string, fromAreaId: number, toAreaId: number) =>
    req<RouteLine>(`/routes/line?trip_id=${encodeURIComponent(tripId)}&from_area_id=${fromAreaId}&to_area_id=${toAreaId}`),
  serviceUpdate: () => req<ServiceUpdate>('/service-update'),

  places: (areaIds: number[], category?: string, limit = 20) =>
    req<Place[]>(`/places?area_ids=${areaIds.join(',')}${category ? `&category=${category}` : ''}&limit=${limit}`),
  placesSummary: (areaIds: number[]) =>
    req<Record<number, Record<string, number>>>(`/places/summary?area_ids=${areaIds.join(',')}`),
}
