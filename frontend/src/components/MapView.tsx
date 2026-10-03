// OWNER: workstream 3 (Frontend). Map of friends' journeys: real route lines, avatar markers, change stops,
// pulsing meet points, destination pin, numbered suggestion pins, a footsteps trail to a selected place,
// hover-linking with the timeline, and journey playback (avatars move along their buses).
import type { Feature, FeatureCollection, Point } from 'geojson'
import * as maplibregl from 'maplibre-gl'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api'
import { hhmm } from '../format'
import type { Area, Friend, FriendPlan, Leg, MeetEvent } from '../types'
import { Icon } from '../ui/bits'
import { baseStyle, SCOTLAND } from '../ui/mapStyle'
import { useCurrentTheme } from '../ui/theme'
import { initials, legKey, ms, shortName } from '../ui/util'

export interface Hover { friendId?: number | null; eventIndex?: number | null; suggestionIndex?: number | null }
type LngLat = [number, number]

interface Props {
  friends: Friend[]
  journeys: FriendPlan[] // the plan's journeys, or the active suggestion's
  destination?: Area | null
  meetEvents?: MeetEvent[]
  suggestions?: Area[] // numbered pins (mode 2)
  hover: Hover
  onHover: (h: Hover) => void
  onSelectSuggestion?: (i: number) => void
  focus?: { lat: number; lon: number } | null // set by PlacesPanel clicks
  anchors?: Area[] // where the footsteps trail to a focused place starts from
  playTime?: number | null // ms timestamp while journey playback is running
  meId?: number | null
  className?: string
}

const lineCache = new Map<string, Promise<LngLat[] | null>>()
function routeCoords(l: Leg): Promise<LngLat[] | null> {
  const k = legKey(l)
  if (!lineCache.has(k)) {
    lineCache.set(k, api.routeLine(l.trip_id, l.from_area.id, l.to_area.id).then((r) => (r.coordinates.length > 1 ? (r.coordinates as LngLat[]) : null)).catch(() => null))
  }
  return lineCache.get(k)!
}
const ll = (a: Pick<Area, 'lat' | 'lon'>): LngLat | null => (a.lat != null && a.lon != null ? [a.lon, a.lat] : null)

/** Point a fraction of the way along a polyline (by length). */
function along(coords: LngLat[], f: number): LngLat {
  if (coords.length < 2 || f <= 0) return coords[0]
  if (f >= 1) return coords[coords.length - 1]
  const seg: number[] = []
  let total = 0
  for (let i = 1; i < coords.length; i++) {
    const d = Math.hypot(coords[i][0] - coords[i - 1][0], (coords[i][1] - coords[i - 1][1]) * 1.7)
    seg.push(d)
    total += d
  }
  let target = f * total
  for (let i = 0; i < seg.length; i++) {
    if (target <= seg[i]) {
      const t = seg[i] ? target / seg[i] : 0
      return [coords[i][0] + (coords[i + 1][0] - coords[i][0]) * t, coords[i][1] + (coords[i + 1][1] - coords[i][1]) * t]
    }
    target -= seg[i]
  }
  return coords[coords.length - 1]
}

const PIN_SVG = (fill: string, label = '') => `
  <svg viewBox="0 0 40 52" width="38" height="49" style="display:block">
    <path d="M20 49 C 20 49 4 31 4 19 A16 16 0 0 1 36 19 C 36 31 20 49 20 49 Z" fill="${fill}" stroke="#2b2226" stroke-width="3" stroke-linejoin="round"/>
    ${label
      ? `<circle cx="20" cy="19" r="10" fill="#fff" stroke="#2b2226" stroke-width="2.5"/><text x="20" y="25" text-anchor="middle" font-family="Barlow,sans-serif" font-weight="800" font-size="16" fill="#2b2226">${label}</text>`
      : '<circle cx="20" cy="19" r="6.5" fill="#fff" stroke="#2b2226" stroke-width="2.5"/>'}
  </svg>`

export default function MapView(props: Props) {
  const { friends, journeys, destination, meetEvents = [], suggestions = [], hover, onHover, onSelectSuggestion, focus, anchors = [], playTime, meId, className = '' } = props
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const [styleVersion, setStyleVersion] = useState(0) // bumps when the (re)loaded style is ready for our layers
  const [lines, setLines] = useState<Record<string, LngLat[]>>({})
  const theme = useCurrentTheme()
  const onHoverRef = useRef(onHover)
  onHoverRef.current = onHover

  const avatarMarkers = useRef(new Map<number, { marker: maplibregl.Marker; node: HTMLElement }>())
  const meetMarkers = useRef<{ node: HTMLElement; idx: number[] }[]>([])
  const pinMarkers = useRef<{ node: HTMLElement; idx: number }[]>([])
  const other = useRef<maplibregl.Marker[]>([])
  const fitted = useRef('')

  // ------------------------------------------------------------ map lifecycle
  useEffect(() => {
    const m = new maplibregl.Map({ container: el.current!, style: baseStyle(theme), center: SCOTLAND, zoom: 5.6, attributionControl: { compact: true } })
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    m.addControl(new maplibregl.FullscreenControl(), 'top-right')
    m.on('style.load', () => setStyleVersion((v) => v + 1))
    // start with the attribution collapsed to its (i) button so it doesn't cover the map on phones
    m.once('idle', () => el.current?.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show'))
    map.current = m
    return () => m.remove()
    // the theme effect below handles later theme changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const firstTheme = useRef(theme)
  useEffect(() => {
    if (theme === firstTheme.current) return
    firstTheme.current = theme
    map.current?.setStyle(baseStyle(theme))
  }, [theme])

  // ------------------------------------------------------------ fetch real route geometry for every leg
  const legs = useMemo(() => journeys.flatMap((fp) => fp.journey?.legs ?? []), [journeys])
  useEffect(() => {
    let alive = true
    for (const l of legs) {
      const k = legKey(l)
      if (lines[k]) continue
      routeCoords(l).then((c) => {
        // no geometry? fall back to a straight line so the leg still draws
        const coords = c ?? ([ll(l.from_area), ll(l.to_area)].filter(Boolean) as LngLat[])
        if (alive) setLines((prev) => (prev[k] ? prev : { ...prev, [k]: coords }))
      })
    }
    return () => { alive = false }
  }, [legs, lines])

  const colourOf = useCallback((id: number) => friends.find((f) => f.id === id)?.colour ?? '#2b2226', [friends])

  // ------------------------------------------------------------ line + stop layers
  useEffect(() => {
    const m = map.current
    if (!m || !styleVersion) return
    // friends sharing a trip get side-by-side offsets so the shared bus reads as parallel "riding together" lines
    const byTrip = new Map<string, number[]>()
    for (const fp of journeys) for (const l of fp.journey?.legs ?? []) byTrip.set(l.trip_id, [...(byTrip.get(l.trip_id) ?? []), fp.friend_id])
    const features: Feature[] = []
    const stops: Feature[] = []
    for (const fp of journeys) {
      const j = fp.journey
      if (!j) continue
      j.legs.forEach((l, i) => {
        const mates = byTrip.get(l.trip_id) ?? []
        const coords = lines[legKey(l)] ?? [ll(l.from_area), ll(l.to_area)].filter(Boolean)
        features.push({
          type: 'Feature',
          properties: { friendId: fp.friend_id, colour: colourOf(fp.friend_id), offset: (mates.indexOf(fp.friend_id) - (mates.length - 1) / 2) * 5, me: fp.friend_id === meId ? 1 : 0 },
          geometry: { type: 'LineString', coordinates: coords as LngLat[] },
        })
        if (i > 0 && ll(l.from_area)) {
          stops.push({ type: 'Feature', properties: { name: l.from_area.name }, geometry: { type: 'Point', coordinates: ll(l.from_area)! } })
        }
      })
    }
    const legsData: FeatureCollection = { type: 'FeatureCollection', features }
    const stopData: FeatureCollection = { type: 'FeatureCollection', features: stops }
    const src = m.getSource('legs') as maplibregl.GeoJSONSource | undefined
    if (src) {
      src.setData(legsData)
      ;(m.getSource('stops') as maplibregl.GeoJSONSource).setData(stopData)
      return
    }
    m.addSource('legs', { type: 'geojson', data: legsData })
    m.addSource('stops', { type: 'geojson', data: stopData })
    m.addSource('walk', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
    m.addLayer({ id: 'legs-casing', type: 'line', source: 'legs', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 9, 'line-offset': ['get', 'offset'] } })
    m.addLayer({ id: 'legs', type: 'line', source: 'legs', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'colour'], 'line-width': ['case', ['==', ['get', 'me'], 1], 6, 4.5], 'line-offset': ['get', 'offset'] } })
    m.addLayer({ id: 'stops', type: 'circle', source: 'stops', paint: { 'circle-radius': 6, 'circle-color': '#ffffff', 'circle-stroke-color': '#2b2226', 'circle-stroke-width': 3 } })
    m.addLayer({ id: 'walk', type: 'line', source: 'walk', layout: { 'line-cap': 'round' }, paint: { 'line-color': '#8f7479', 'line-width': 5, 'line-dasharray': [0.1, 2.2] } })
    m.on('mousemove', 'legs', (e) => {
      m.getCanvas().style.cursor = 'pointer'
      const id = e.features?.[0]?.properties?.friendId
      if (id != null) onHoverRef.current({ friendId: Number(id) })
    })
    m.on('mouseleave', 'legs', () => { m.getCanvas().style.cursor = ''; onHoverRef.current({}) })
    m.on('click', 'stops', (e) => {
      const f = e.features?.[0]
      if (f) new maplibregl.Popup({ offset: 10 }).setLngLat((f.geometry as Point).coordinates as LngLat).setHTML(`<b>Change at</b><br>${f.properties?.name}`).addTo(m)
    })
  }, [styleVersion, journeys, lines, colourOf, meId])

  // ------------------------------------------------------------ hover highlighting on lines
  useEffect(() => {
    const m = map.current
    if (!m || !styleVersion || !m.getLayer('legs')) return
    const hot = hover.friendId ?? (hover.eventIndex != null ? -1 : null)
    const eventFriends = hover.eventIndex != null ? meetEvents[hover.eventIndex]?.friend_ids ?? [] : []
    const opacity: maplibregl.ExpressionSpecification | number =
      hot == null ? 0.95
        : hot === -1 ? ['case', ['in', ['get', 'friendId'], ['literal', eventFriends]], 1, 0.2]
          : ['case', ['==', ['get', 'friendId'], hot], 1, 0.2]
    m.setPaintProperty('legs', 'line-opacity', opacity)
    m.setPaintProperty('legs-casing', 'line-opacity', opacity)
  }, [hover, styleVersion, meetEvents])

  // ------------------------------------------------------------ DOM markers (avatars, meet points, pins)
  useEffect(() => {
    const m = map.current
    if (!m) return
    avatarMarkers.current.forEach(({ marker }) => marker.remove())
    avatarMarkers.current.clear()
    meetMarkers.current = []
    pinMarkers.current = []
    other.current.forEach((mk) => mk.remove())
    other.current = []

    for (const f of friends) {
      const p = ll(f.origin)
      if (!p) continue
      // maplibre positions the marker element with `transform`, so all styling/animation goes on an inner node
      const wrap = document.createElement('div')
      const node = document.createElement('div')
      node.className = 'mk-avatar'
      node.style.background = f.colour
      node.textContent = initials(f.name)
      if (f.id === meId) node.style.outline = '3px solid var(--mustard)'
      wrap.appendChild(node)
      wrap.addEventListener('mouseenter', () => onHoverRef.current({ friendId: f.id }))
      wrap.addEventListener('mouseleave', () => onHoverRef.current({}))
      const marker = new maplibregl.Marker({ element: wrap }).setLngLat(p)
        .setPopup(new maplibregl.Popup({ offset: 20, closeButton: false }).setHTML(`<b>${f.name}${f.id === meId ? ' (you)' : ''}</b><br>from ${f.origin.name}`))
        .addTo(m)
      avatarMarkers.current.set(f.id, { marker, node })
    }

    // meet events grouped by area so a change + shared bus at the same stop share one marker
    const byArea = new Map<number, number[]>()
    meetEvents.forEach((e, i) => byArea.set(e.area.id, [...(byArea.get(e.area.id) ?? []), i]))
    for (const idx of byArea.values()) {
      const e = meetEvents[idx[0]]
      const p = ll(e.area)
      if (!p) continue
      const change = idx.some((i) => meetEvents[i].kind === 'same_change')
      const wrap = document.createElement('div')
      const node = document.createElement('div')
      wrap.appendChild(node)
      node.className = 'mk-meet'
      const colour = change ? '#fbc95b' : '#11937f'
      node.innerHTML = `<span class="ring" style="background:${colour}"></span><span class="core" style="background:${colour}">${change ? '☕' : '🚌'}</span>`
      wrap.addEventListener('mouseenter', () => onHoverRef.current({ eventIndex: idx[0] }))
      wrap.addEventListener('mouseleave', () => onHoverRef.current({}))
      const html = idx.map((i) => `<div style="margin:2px 0">${meetEvents[i].kind === 'same_bus' ? '🚌' : '☕'} ${meetEvents[i].description}<br><small>${hhmm(meetEvents[i].start)}–${hhmm(meetEvents[i].end)}</small></div>`).join('')
      const mk = new maplibregl.Marker({ element: wrap }).setLngLat(p).setPopup(new maplibregl.Popup({ offset: 18, closeButton: false, maxWidth: '260px' }).setHTML(html)).addTo(m)
      other.current.push(mk)
      meetMarkers.current.push({ node, idx })
    }

    if (destination && ll(destination)) {
      const node = document.createElement('div')
      node.innerHTML = `<div class="mk-pin animate-bob">${PIN_SVG('#e5463b')}</div>`
      other.current.push(new maplibregl.Marker({ element: node, anchor: 'bottom' }).setLngLat(ll(destination)!)
        .setPopup(new maplibregl.Popup({ offset: 40, closeButton: false }).setHTML(`<b>Meeting point</b><br>${destination.name}`)).addTo(m))
    }
    suggestions.forEach((a, i) => {
      const p = ll(a)
      if (!p) return
      const wrap = document.createElement('div')
      wrap.innerHTML = `<div class="mk-pin">${PIN_SVG(i === 0 ? '#fbc95b' : '#ffffff', String(i + 1))}</div>`
      const node = wrap.firstElementChild as HTMLElement
      wrap.addEventListener('mouseenter', () => onHoverRef.current({ suggestionIndex: i }))
      wrap.addEventListener('mouseleave', () => onHoverRef.current({}))
      wrap.addEventListener('click', () => onSelectSuggestion?.(i))
      other.current.push(new maplibregl.Marker({ element: wrap, anchor: 'bottom' }).setLngLat(p).addTo(m))
      pinMarkers.current.push({ node, idx: i })
    })
  }, [friends, meetEvents, destination, suggestions, meId, onSelectSuggestion])

  // hover classes on markers
  useEffect(() => {
    avatarMarkers.current.forEach(({ node }, id) => {
      const hotIds = hover.friendId != null ? [hover.friendId] : hover.eventIndex != null ? meetEvents[hover.eventIndex]?.friend_ids ?? [] : null
      node.classList.toggle('is-hot', !!hotIds?.includes(id))
      node.classList.toggle('is-dim', !!hotIds && !hotIds.includes(id))
    })
    meetMarkers.current.forEach(({ node, idx }) => node.classList.toggle('is-hot', hover.eventIndex != null && idx.includes(hover.eventIndex)))
    pinMarkers.current.forEach(({ node, idx }) => node.classList.toggle('is-hot', hover.suggestionIndex === idx))
  }, [hover, meetEvents])

  // ------------------------------------------------------------ fit everything in view when the cast changes
  const fitAll = useCallback(() => {
    const m = map.current
    if (!m) return
    const pts = [
      ...friends.map((f) => ll(f.origin)),
      destination ? ll(destination) : null,
      ...suggestions.map(ll),
    ].filter(Boolean) as LngLat[]
    if (pts.length === 0) return m.flyTo({ center: SCOTLAND, zoom: 5.6 })
    if (pts.length === 1) return m.flyTo({ center: pts[0], zoom: 10 })
    const b = pts.reduce((bb, p) => bb.extend(p), new maplibregl.LngLatBounds(pts[0], pts[0]))
    m.fitBounds(b, { padding: { top: 60, bottom: 50, left: 50, right: 60 }, maxZoom: 11, duration: 900 })
  }, [friends, destination, suggestions])
  useEffect(() => {
    const key = [friends.map((f) => f.id).join(','), destination?.id, suggestions.map((s) => s.id).join(',')].join('|')
    if (key === fitted.current || !styleVersion) return
    fitted.current = key
    fitAll()
  }, [friends, destination, suggestions, fitAll, styleVersion])

  // ------------------------------------------------------------ footsteps from the nearest stop to a picked place
  useEffect(() => {
    const m = map.current
    if (!m || !focus) return
    m.flyTo({ center: [focus.lon, focus.lat], zoom: 15, speed: 1.3 })
    const near = anchors
      .filter((a) => a.lat != null && a.lon != null)
      .sort((a, b) => Math.hypot(a.lat! - focus.lat, a.lon! - focus.lon) - Math.hypot(b.lat! - focus.lat, b.lon! - focus.lon))[0]
    const node = document.createElement('div')
    node.innerHTML = '<div style="font-size:22px;filter:drop-shadow(0 2px 0 #fff)">👣</div>'
    const mk = new maplibregl.Marker({ element: node }).setLngLat([focus.lon, focus.lat]).addTo(m)
    const setWalk = () => {
      const src = m.getSource('walk') as maplibregl.GeoJSONSource | undefined
      src?.setData({
        type: 'FeatureCollection',
        features: near ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[near.lon!, near.lat!], [focus.lon, focus.lat]] } }] : [],
      })
    }
    setWalk()
    return () => {
      mk.remove()
      ;(m.getSource('walk') as maplibregl.GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: [] })
    }
  }, [focus, anchors, styleVersion])

  // ------------------------------------------------------------ journey playback: move avatars along their buses
  useEffect(() => {
    for (const f of friends) {
      const entry = avatarMarkers.current.get(f.id)
      const origin = ll(f.origin)
      if (!entry || !origin) continue
      const j = journeys.find((fp) => fp.friend_id === f.id)?.journey
      if (playTime == null || !j || j.legs.length === 0) {
        entry.marker.setLngLat(origin)
        continue
      }
      let pos: LngLat | null = ll(j.legs[0].from_area) ?? origin
      for (const l of j.legs) {
        const d = ms(l.departure), a = ms(l.arrival)
        if (playTime < d) break
        const coords = lines[legKey(l)] ?? ([ll(l.from_area), ll(l.to_area)].filter(Boolean) as LngLat[])
        pos = playTime >= a ? ll(l.to_area) ?? pos : along(coords, (playTime - d) / (a - d))
      }
      if (pos) entry.marker.setLngLat(pos)
    }
  }, [playTime, friends, journeys, lines])

  return (
    <div className={`relative overflow-hidden ${className}`}>
      <div ref={el} className="h-full w-full" />
      <button
        onClick={fitAll}
        className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-xs font-bold text-ink shadow-md hover:bg-surface-2"
      >
        <Icon name="users" className="h-4 w-4" /> Show everyone
      </button>
      {legs.length > 0 && legs.some((l) => !lines[legKey(l)]) && (
        <span className="absolute top-3 left-3 rounded-full bg-surface/90 px-3 py-1 text-xs font-semibold text-ink-soft shadow">Drawing routes…</span>
      )}
      {destination && (
        <span className="pointer-events-none absolute top-3 left-1/2 hidden -translate-x-1/2 rounded-full bg-ink px-3 py-1 text-xs font-bold text-bg shadow sm:block">
          📍 {shortName(destination.name)}
        </span>
      )}
    </div>
  )
}
