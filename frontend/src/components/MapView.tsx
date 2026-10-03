// OWNER: workstream 3 (Frontend). Map of friends, their legs, meet points and suggestions.
// STUB: straight lines per leg + origin markers. TODO: real route lines via api.routeLine, pulsing meet markers.
import * as maplibregl from 'maplibre-gl'
import { useEffect, useRef } from 'react'
import type { Friend, MeetupSuggestion, Plan } from '../types'

const STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
}

interface Props {
  friends: Friend[]
  plan?: Plan | null
  suggestions?: MeetupSuggestion[]
  focus?: { lat: number; lon: number } | null // set by PlacesPanel clicks
}

export default function MapView({ friends, plan, suggestions = [], focus }: Props) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const markers = useRef<maplibregl.Marker[]>([])

  useEffect(() => {
    map.current = new maplibregl.Map({ container: el.current!, style: STYLE, center: [-3.9, 56.6], zoom: 6 })
    return () => map.current?.remove()
  }, [])

  useEffect(() => {
    const m = map.current
    if (!m) return
    const draw = () => {
      markers.current.forEach((mk) => mk.remove())
      markers.current = []
      for (const f of friends) {
        if (f.origin.lon == null || f.origin.lat == null) continue
        markers.current.push(new maplibregl.Marker({ color: f.colour }).setLngLat([f.origin.lon, f.origin.lat]).addTo(m))
      }
      for (const s of suggestions) {
        if (s.area.lon == null || s.area.lat == null) continue
        markers.current.push(new maplibregl.Marker({ color: '#30b0a5' }).setLngLat([s.area.lon, s.area.lat]).addTo(m))
      }
      const features = (plan?.friends ?? []).flatMap((fp) => {
        const colour = friends.find((f) => f.id === fp.friend_id)?.colour ?? '#333'
        return (fp.journey?.legs ?? []).map((leg) => ({
          type: 'Feature' as const,
          properties: { colour },
          geometry: { type: 'LineString' as const, coordinates: [[leg.from_area.lon!, leg.from_area.lat!], [leg.to_area.lon!, leg.to_area.lat!]] },
        }))
      })
      const data = { type: 'FeatureCollection' as const, features }
      const src = m.getSource('legs') as maplibregl.GeoJSONSource | undefined
      if (src) src.setData(data)
      else {
        m.addSource('legs', { type: 'geojson', data })
        m.addLayer({ id: 'legs', type: 'line', source: 'legs', paint: { 'line-color': ['get', 'colour'], 'line-width': 4 } })
      }
    }
    if (m.isStyleLoaded()) draw()
    else m.once('load', draw)
  }, [friends, plan, suggestions])

  useEffect(() => {
    if (focus) map.current?.flyTo({ center: [focus.lon, focus.lat], zoom: 15 })
  }, [focus])

  return <div ref={el} className="h-96 w-full overflow-hidden rounded-xl shadow" />
}
