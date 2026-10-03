// API contracts. FROZEN SHARED FILE: mirrors backend/models.py exactly. Additive changes only.
// Datetimes are ISO strings with offset (Europe/London), e.g. "2026-10-10T11:55:00+01:00".

export type Mode = 'arrive' | 'suggest' // arrive = "meet at X by T"; suggest = "where should we meet?"

export interface Area {
  id: number
  name: string
  region_name?: string | null
  lat?: number | null
  lon?: number | null
}

export interface Leg {
  trip_id: string
  route_id: string // e.g. "E1"
  headsign?: string | null
  from_area: Area
  to_area: Area
  departure: string
  arrival: string
  dist_km: number
  price_gbp?: number | null
}

export interface Journey {
  origin_area_id: number
  dest_area_id: number
  departure: string
  arrival: string
  legs: Leg[]
  changes: number
  total_km: number
  price_gbp?: number | null
}

export interface FriendIn {
  name: string
  origin_area_id: number
  earliest_departure?: string | null // mode=suggest
}

export interface Friend {
  id: number
  name: string
  origin: Area
  earliest_departure?: string | null
  colour: string // hex
}

export interface MeetupCreate {
  mode: Mode
  title?: string | null
  date: string // YYYY-MM-DD
  destination_area_id?: number | null // required for arrive
  target_time?: string | null // required for arrive
}

export interface Meetup {
  slug: string
  mode: Mode
  title?: string | null
  date: string
  destination?: Area | null
  target_time?: string | null
  friends: Friend[]
  created_at: string
}

export interface PickSuggestion {
  area_id: number
  target_time: string
}

export interface MeetEvent {
  kind: 'same_bus' | 'same_change'
  area: Area
  start: string
  end: string
  friend_ids: number[]
  trip_id?: string | null
  description: string
}

export interface FriendPlan {
  friend_id: number
  journey?: Journey | null // null = no route found
  note?: string | null
}

export interface Plan {
  meetup_slug: string
  destination: Area
  target_time: string
  first_arrival?: string | null
  last_arrival?: string | null
  spread_min?: number | null
  friends: FriendPlan[]
  meet_events: MeetEvent[]
  total_price_gbp?: number | null
}

export interface MeetupSuggestion {
  area: Area
  meet_time: string
  total_travel_min: number
  total_km: number
  spread_min: number
  score: number // lower is better
  journeys: FriendPlan[]
  places_summary: Record<string, number>
  label?: string | null // "Quickest" | "Fairest" | "Most to do"
}

export interface Place {
  id: number
  name: string
  category: string
  lat: number
  lon: number
  near_area_id?: number | null
  distance_m?: number | null
  description?: string | null
  source: 'osm' | 'curated'
  url?: string | null
}

export interface RouteLine {
  trip_id: string
  from_area_id: number
  to_area_id: number
  coordinates: [number, number][] // [lon, lat]
}

export interface ServiceUpdate {
  type: string // "none" | "custom"
  short_message?: string | null
}
