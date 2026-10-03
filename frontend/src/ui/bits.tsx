// OWNER: workstream 3 (Frontend). Tiny presentational building blocks.
import type { ReactNode } from 'react'
import type { Friend } from '../types'
import { initials } from './util'

export function Logo({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg viewBox="0 0 40 32" className="h-7 w-auto" aria-hidden>
        {/* three routes merging into one, in the chunky "w." style of the reference */}
        <path d="M4 6 L12 26 L20 10 L28 26 L36 6" fill="none" stroke="var(--teal)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="37" cy="27" r="3.5" fill="var(--pin)" />
      </svg>
      <span className="display text-xl normal-case tracking-tight">
        ember<span className="text-teal">·</span>together
      </span>
    </span>
  )
}

export function Avatar({ friend, size = 36, ring = false, you = false }: { friend: Pick<Friend, 'name' | 'colour'>; size?: number; ring?: boolean; you?: boolean }) {
  return (
    <span
      className={`relative inline-grid shrink-0 place-items-center rounded-full font-display font-extrabold text-white ${ring ? 'ring-4 ring-mustard' : ''}`}
      style={{ width: size, height: size, background: friend.colour, fontSize: size * 0.45, border: `${Math.max(2, size / 14)}px solid var(--surface)` }}
      title={friend.name}
    >
      {initials(friend.name)}
      {you && (
        <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 rounded-full bg-ink px-1.5 text-[9px] leading-4 font-bold text-bg">YOU</span>
      )}
    </span>
  )
}

export function RouteBadge({ route }: { route: string }) {
  return <span className="route-badge">{route}</span>
}

export function SectionTitle({ kicker, title, right }: { kicker?: string; title: string; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div>
        {kicker && <p className="text-xs font-bold tracking-widest text-teal uppercase">{kicker}</p>}
        <h2 className="display text-2xl">{title}</h2>
      </div>
      {right}
    </div>
  )
}

type IconName = 'bus' | 'coffee' | 'pin' | 'play' | 'pause' | 'share' | 'copy' | 'qr' | 'moon' | 'sun' | 'check' | 'close' | 'cal' | 'ticket' | 'leaf' | 'clock' | 'users' | 'arrow' | 'back' | 'listen' | 'book' | 'swap'
const PATHS: Record<IconName, ReactNode> = {
  bus: <><rect x="4" y="3" width="16" height="15" rx="3" /><path d="M4 11h16M8 18v2M16 18v2" /><circle cx="8" cy="14.5" r=".8" /><circle cx="16" cy="14.5" r=".8" /></>,
  coffee: <><path d="M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z" /><path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16M8 3v3M12 3v3" /></>,
  pin: <><path d="M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12z" /><circle cx="12" cy="9" r="2.5" /></>,
  play: <path d="M7 4l13 8-13 8z" fill="currentColor" />,
  pause: <><rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor" /><rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor" /></>,
  share: <><circle cx="18" cy="5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="19" r="2.5" /><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4" /></>,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2.5" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>,
  qr: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3M21 14v7h-4M14 18v3" /></>,
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  check: <path d="M5 12.5l4.5 4.5L19 7" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  cal: <><rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  ticket: <><path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4z" /><path d="M14 6v12" strokeDasharray="2 2" /></>,
  leaf: <><path d="M5 19c0-9 6-14 15-14 0 9-5 15-14 15" /><path d="M5 19c3-4 6-6 10-8" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3 2" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><circle cx="17" cy="9" r="2.5" /><path d="M16 14.2A5 5 0 0 1 21.5 19" /></>,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  back: <path d="M19 12H5M11 6l-6 6 6 6" />,
  listen: <><path d="M4 14v-2a8 8 0 0 1 16 0v2" /><rect x="3" y="14" width="4" height="6" rx="1.5" /><rect x="17" y="14" width="4" height="6" rx="1.5" /></>,
  book: <><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" /><path d="M4 19V5" /></>,
  swap: <path d="M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" />,
}
export function Icon({ name, className = 'h-5 w-5' }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {PATHS[name]}
    </svg>
  )
}
