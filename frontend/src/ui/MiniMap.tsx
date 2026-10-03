// OWNER: workstream 3 (Frontend). Small preview map for the create wizard: flies to and drops a pin on a station.
import * as maplibregl from 'maplibre-gl'
import { useEffect, useRef } from 'react'
import type { Area } from '../types'
import { baseStyle, SCOTLAND } from './mapStyle'
import { useCurrentTheme } from './theme'

const PIN = `<svg viewBox="0 0 40 52" width="44" height="57"><path d="M20 49 C 20 49 4 31 4 19 A16 16 0 0 1 36 19 C 36 31 20 49 20 49 Z" fill="#e5463b" stroke="#2b2226" stroke-width="3" stroke-linejoin="round"/><circle cx="20" cy="19" r="6.5" fill="#fff" stroke="#2b2226" stroke-width="2.5"/></svg>`

export default function MiniMap({ area, className = '' }: { area: Area | null; className?: string }) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const pin = useRef<maplibregl.Marker | null>(null)
  const theme = useCurrentTheme()

  useEffect(() => {
    const m = new maplibregl.Map({ container: el.current!, style: baseStyle(theme), center: SCOTLAND, zoom: 5.4, attributionControl: { compact: true } })
    map.current = m
    return () => m.remove()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => { map.current?.setStyle(baseStyle(theme)) }, [theme])

  useEffect(() => {
    const m = map.current
    pin.current?.remove()
    pin.current = null
    if (!m || !area || area.lat == null || area.lon == null) {
      m?.flyTo({ center: SCOTLAND, zoom: 5.4 })
      return
    }
    const node = document.createElement('div')
    node.innerHTML = `<div class="animate-pop" style="transform-origin:bottom center">${PIN}</div>` // inner node: maplibre owns the outer transform
    pin.current = new maplibregl.Marker({ element: node, anchor: 'bottom' }).setLngLat([area.lon, area.lat]).addTo(m)
    m.flyTo({ center: [area.lon, area.lat], zoom: 11.5, speed: 1.4 })
  }, [area])

  return <div ref={el} className={`h-full w-full ${className}`} />
}
