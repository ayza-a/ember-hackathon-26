// OWNER: workstream 3 (Frontend). THE hero visual. One lane per friend on a shared clock:
// leg pills with route badges, hatched waits at changes, shared buses drawn as lanes merging into one band,
// meet-while-changing bands, the target time, and a playback scrubber that drives the map.
// Two views: "Lanes" (horizontal Gantt) and "Metro" (vertical, tube-map style).
import { useMemo, useState, type CSSProperties } from 'react'
import { hhmm } from '../format'
import type { Area, Friend, FriendPlan, MeetEvent, Plan } from '../types'
import { Avatar, Icon, RouteBadge } from '../ui/bits'
import { fmtDur, minsBetween, ms, planRange, shortName } from '../ui/util'
import type { Hover } from './MapView'

interface Props {
  friends: Friend[]
  plan: Plan
  hover: Hover
  onHover: (h: Hover) => void
  playTime: number | null
  playing: boolean
  onTogglePlay: () => void
  onScrub: (t: number) => void
  onWaitClick?: (area: Area) => void
  meId?: number | null
}

const HALF_HOUR = 30 * 60000

/** Lane order: friends who share a bus sit next to each other so their lanes can merge. */
function laneOrder(plan: Plan): FriendPlan[] {
  const parent = new Map<number, number>()
  const find = (x: number): number => (parent.get(x) ?? x) === x ? x : find(parent.get(x)!)
  for (const e of plan.meet_events) for (const id of e.friend_ids.slice(1)) parent.set(find(id), find(e.friend_ids[0]))
  const groups = new Map<number, FriendPlan[]>()
  for (const fp of plan.friends) groups.set(find(fp.friend_id), [...(groups.get(find(fp.friend_id)) ?? []), fp])
  return [...groups.values()].flat()
}

export default function Timeline(props: Props) {
  const { plan, playTime, playing, onTogglePlay, onScrub } = props
  const [view, setView] = useState<'lanes' | 'metro'>('lanes')
  const lanes = useMemo(() => laneOrder(plan), [plan])
  const legs = plan.friends.flatMap((fp) => fp.journey?.legs ?? [])

  const [t0, t1] = useMemo(() => planRange(plan), [plan])

  if (legs.length === 0) {
    return <p className="rounded-2xl bg-surface-2 p-4 text-sm text-ink-soft">No journeys to show yet.</p>
  }
  const shared = { ...props, lanes, t0, t1 }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex rounded-full bg-surface-2 p-1" role="tablist" aria-label="Timeline view">
          {(['lanes', 'metro'] as const).map((v) => (
            <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)}
              className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide transition ${view === v ? 'bg-ink text-bg' : 'text-ink-soft hover:text-ink'}`}>
              {v === 'lanes' ? 'Lanes' : 'Metro map'}
            </button>
          ))}
        </div>
        <button onClick={onTogglePlay} className="btn btn-teal btn-sm ml-auto" aria-label={playing ? 'Pause playback' : 'Play the day'}>
          <Icon name={playing ? 'pause' : 'play'} className="h-4 w-4" />
          {playing ? 'Pause' : playTime == null ? 'Play the day' : playTime >= t1 ? 'Replay' : 'Resume'}
        </button>
      </div>

      {view === 'lanes' ? <Lanes {...shared} /> : <Metro {...shared} />}

      <div className="mt-3 flex items-center gap-3">
        <span className="w-12 text-right font-display text-sm font-extrabold tabular-nums">{hhmm(new Date(playTime ?? t0).toISOString())}</span>
        <input
          type="range" min={t0} max={t1} step={60000} value={playTime ?? t0}
          onChange={(e) => onScrub(Number(e.target.value))}
          className="h-2 flex-1 cursor-pointer accent-[var(--teal)]"
          aria-label="Scrub through the day"
        />
        <span className="w-12 font-display text-sm font-extrabold tabular-nums text-ink-soft">{hhmm(new Date(t1).toISOString())}</span>
      </div>
      <Legend />
    </div>
  )
}

function Legend() {
  return (
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-soft">
      <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-6 rounded-full bg-ink-soft" /> on a bus</span>
      <span className="flex items-center gap-1.5"><span className="hatch inline-block h-3 w-6 rounded-full border border-line" /> changing (tap for things to do)</span>
      <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-6 rounded-md border-2 border-dashed border-teal bg-teal/15" /> same bus</span>
      <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-6 rounded-md border-2 border-dashed border-mustard-deep bg-mustard/30" /> waiting together</span>
    </div>
  )
}

type Inner = Props & { lanes: FriendPlan[]; t0: number; t1: number }

/** Contiguous lane rows covered by an event, or null if its friends aren't adjacent. */
function rowSpan(e: MeetEvent, lanes: FriendPlan[]) {
  const rows = e.friend_ids.map((id) => lanes.findIndex((l) => l.friend_id === id)).filter((r) => r >= 0).sort((a, b) => a - b)
  if (rows.length < 2 || rows[rows.length - 1] - rows[0] !== rows.length - 1) return null
  return [rows[0], rows[rows.length - 1]] as const
}
function hotFriends(hover: Hover, plan: Plan): number[] | null {
  if (hover.friendId != null) return [hover.friendId]
  if (hover.eventIndex != null) return plan.meet_events[hover.eventIndex]?.friend_ids ?? null
  return null
}

// ================================================================ horizontal lanes
const LANE_H = 70
const LABEL_W = 104

function Lanes({ friends, plan, lanes, t0, t1, hover, onHover, playTime, onWaitClick, meId }: Inner) {
  const pct = (t: number | string) => ((typeof t === 'string' ? ms(t) : t) - t0) / (t1 - t0) * 100
  const ticks: number[] = []
  for (let t = t0; t <= t1; t += HALF_HOUR) ticks.push(t)
  const hot = hotFriends(hover, plan)
  const byId = new Map(friends.map((f) => [f.id, f]))

  return (
    <div className="-mx-1 overflow-x-auto px-1 pb-1">
      <div style={{ minWidth: 600 }}>
        {/* time axis */}
        <div className="relative h-7" style={{ marginLeft: LABEL_W }}>
          {ticks.map((t) => (
            <span key={t} className={`absolute -translate-x-1/2 text-xs tabular-nums ${new Date(t).getMinutes() ? 'text-ink-soft/50' : 'font-bold text-ink-soft'}`} style={{ left: `${pct(t)}%` }}>
              {new Date(t).getMinutes() ? '·' : hhmm(new Date(t).toISOString())}
            </span>
          ))}
        </div>

        <div className="relative">
          {/* track area: grid lines, bands, target + playhead, all behind/over the lanes */}
          <div className="pointer-events-none absolute inset-y-0 right-0" style={{ left: LABEL_W }}>
            {ticks.map((t) => (
              <span key={t} className={`absolute inset-y-0 w-px ${new Date(t).getMinutes() ? 'bg-line/50' : 'bg-line'}`} style={{ left: `${pct(t)}%` }} />
            ))}
          </div>
          <div className="absolute inset-y-0 right-0" style={{ left: LABEL_W }}>
            {plan.meet_events.map((e, i) => {
              const span = rowSpan(e, lanes)
              if (!span) return null
              const bus = e.kind === 'same_bus'
              const isHot = hover.eventIndex === i
              return (
                <button
                  key={i}
                  onMouseEnter={() => onHover({ eventIndex: i })}
                  onMouseLeave={() => onHover({})}
                  onFocus={() => onHover({ eventIndex: i })}
                  onBlur={() => onHover({})}
                  onClick={() => !bus && onWaitClick?.(e.area)}
                  aria-label={e.description}
                  className={`absolute rounded-2xl border-2 border-dashed transition ${bus ? 'border-teal bg-teal/12' : 'border-mustard-deep bg-mustard/30'} ${isHot ? 'z-20 ring-4 ring-mustard/60' : 'z-0'}`}
                  style={{
                    left: `calc(${pct(e.start)}% - 6px)`,
                    width: `calc(${Math.max(pct(e.end) - pct(e.start), 0.8)}% + 12px)`,
                    top: span[0] * LANE_H + 6,
                    height: (span[1] - span[0]) * LANE_H + 38,
                  }}
                >
                  <span className={`absolute -top-2.5 left-2 rounded-full px-2 text-[10px] leading-4 font-extrabold whitespace-nowrap uppercase ${bus ? 'bg-teal text-white' : 'bg-mustard text-[#2b2226]'}`}>
                    {bus ? '🚌 same bus' : `☕ ${fmtDur(minsBetween(e.start, e.end))} together`}
                  </span>
                </button>
              )
            })}
          </div>

          {lanes.map((fp, row) => {
            const f = byId.get(fp.friend_id)
            if (!f) return null
            const j = fp.journey
            const dim = hot && !hot.includes(f.id)
            return (
              <div
                key={fp.friend_id}
                className={`relative flex items-start transition-opacity ${dim ? 'opacity-30' : ''}`}
                style={{ height: LANE_H }}
                onMouseEnter={() => onHover({ friendId: f.id })}
                onMouseLeave={() => onHover({})}
              >
                <div className="flex shrink-0 items-center gap-2 pt-1.5" style={{ width: LABEL_W }}>
                  <Avatar friend={f} size={30} you={f.id === meId} />
                  <span className={`truncate text-sm ${f.id === meId ? 'font-extrabold' : 'font-semibold'}`}>{f.name}</span>
                </div>
                <div className="pointer-events-none relative h-full flex-1">
                  {!j && <span className="absolute top-3 left-0 rounded-full border-2 border-dashed border-line px-3 py-0.5 text-xs text-ink-soft">{fp.note ?? 'No route found'}</span>}
                  {j && j.legs.length === 0 && <span className="absolute top-3 left-0 rounded-full bg-surface-2 px-3 py-0.5 text-xs text-ink-soft">🏡 {fp.note ?? 'Already there'}</span>}
                  {j?.legs.map((l, i) => {
                    const left = pct(l.departure), w = Math.max(pct(l.arrival) - left, 0.6)
                    const next = j.legs[i + 1]
                    return (
                      <div key={i}>
                        <div
                          className="animate-grow-x absolute top-3 z-10 flex h-[26px] items-center gap-1 overflow-hidden rounded-full border-2 border-[#2b2226] px-1"
                          style={{ left: `${left}%`, width: `${w}%`, background: f.colour, animationDelay: `${row * 90 + i * 140}ms` } as CSSProperties}
                          title={`${l.route_id}: ${l.from_area.name} ${hhmm(l.departure)} → ${l.to_area.name} ${hhmm(l.arrival)}`}
                        >
                          <RouteBadge route={l.route_id} />
                          {w > 9 && <span className="truncate text-[11px] font-bold text-white">→ {shortName(l.to_area.name)}</span>}
                        </div>
                        {/* stop names, always visible */}
                        <span className="absolute top-[42px] max-w-[110px] truncate text-[11px] leading-tight text-ink-soft" style={{ left: `${left}%` }}>
                          <b className="text-ink">{hhmm(l.departure)}</b> {shortName(l.from_area.name)}
                        </span>
                        {!next && (
                          <span className="absolute top-[42px] max-w-[110px] -translate-x-full truncate text-right text-[11px] leading-tight text-ink-soft" style={{ left: `${pct(l.arrival)}%` }}>
                            <b className="text-ink">{hhmm(l.arrival)}</b> 🏁
                          </span>
                        )}
                        {next && (
                          <button
                            className="hatch pointer-events-auto absolute top-[15px] z-10 flex h-[22px] items-center justify-center rounded-md border border-line text-[11px] hover:bg-mustard/30"
                            style={{ left: `${pct(l.arrival)}%`, width: `${Math.max(pct(next.departure) - pct(l.arrival), 0.6)}%` }}
                            onClick={() => onWaitClick?.(l.to_area)}
                            title={`Change at ${l.to_area.name}: ${fmtDur(minsBetween(l.arrival, next.departure))}. Tap for things to do.`}
                            aria-label={`Change at ${l.to_area.name}, ${fmtDur(minsBetween(l.arrival, next.departure))}. Things to do while you wait.`}
                          >
                            ☕
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}

          <div className="pointer-events-none absolute inset-y-0 right-0" style={{ left: LABEL_W }}>
            <div className="absolute -top-1 bottom-0 z-30 border-l-2 border-dashed border-pin" style={{ left: `${pct(plan.target_time)}%` }}>
              <span className="absolute -top-6 -translate-x-1/2 rounded-full bg-pin px-2 text-[11px] leading-5 font-extrabold whitespace-nowrap text-white">🎯 {hhmm(plan.target_time)}</span>
            </div>
            {playTime != null && (
              <div className="absolute inset-y-0 z-30 w-[3px] -translate-x-1/2 rounded bg-teal-deep dark:bg-mustard" style={{ left: `${pct(playTime)}%` }}>
                <span className="absolute -bottom-1 left-1/2 h-3 w-3 -translate-x-1/2 rounded-full bg-teal-deep dark:bg-mustard" />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ================================================================ vertical metro map
const COL_W = 132
const TOP = 66
const H = 560

function Metro({ friends, plan, lanes, t0, t1, hover, onHover, playTime, onWaitClick, meId }: Inner) {
  const y = (t: number | string) => TOP + ((typeof t === 'string' ? ms(t) : t) - t0) / (t1 - t0) * H
  const x = (row: number) => 56 + row * COL_W
  const width = x(lanes.length - 1) + 120
  const byId = new Map(friends.map((f) => [f.id, f]))
  const hot = hotFriends(hover, plan)
  const hours: number[] = []
  for (let t = Math.ceil(t0 / 3600000) * 3600000; t <= t1; t += 3600000) hours.push(t)

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${TOP + H + 30}`} style={{ minWidth: Math.min(width, 900), width: '100%' }} className="font-sans" role="img" aria-label="Metro-map view of everyone's journeys">
        {hours.map((t) => (
          <g key={t}>
            <line x1={30} x2={width} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeDasharray="2 6" />
            <text x={0} y={y(t) + 4} fontSize="11" fontWeight="700" fill="var(--ink-soft)">{hhmm(new Date(t).toISOString())}</text>
          </g>
        ))}

        {plan.meet_events.map((e, i) => {
          const span = rowSpan(e, lanes)
          if (!span) return null
          const bus = e.kind === 'same_bus'
          return (
            <rect key={i} x={x(span[0]) - 22} width={x(span[1]) - x(span[0]) + 44} y={y(e.start) - 8} height={Math.max(y(e.end) - y(e.start), 4) + 16} rx="22"
              fill={bus ? 'var(--teal)' : 'var(--mustard)'} fillOpacity={bus ? 0.14 : 0.3}
              stroke={bus ? 'var(--teal)' : 'var(--mustard-deep)'} strokeWidth={hover.eventIndex === i ? 4 : 2} strokeDasharray="6 5"
              onMouseEnter={() => onHover({ eventIndex: i })} onMouseLeave={() => onHover({})}
              onClick={() => !bus && onWaitClick?.(e.area)} style={{ cursor: bus ? 'default' : 'pointer' }}>
              <title>{e.description}</title>
            </rect>
          )
        })}

        <line x1={30} x2={width} y1={y(plan.target_time)} y2={y(plan.target_time)} stroke="var(--pin)" strokeWidth="2" strokeDasharray="6 4" />
        <text x={width - 4} y={y(plan.target_time) - 6} textAnchor="end" fontSize="12" fontWeight="800" fill="var(--pin)">🎯 {hhmm(plan.target_time)}</text>

        {lanes.map((fp, row) => {
          const f = byId.get(fp.friend_id)
          if (!f) return null
          const cx = x(row)
          const j = fp.journey
          const dim = hot && !hot.includes(f.id)
          return (
            <g key={fp.friend_id} opacity={dim ? 0.25 : 1} onMouseEnter={() => onHover({ friendId: f.id })} onMouseLeave={() => onHover({})} style={{ transition: 'opacity .2s' }}>
              <circle cx={cx} cy={24} r={f.id === meId ? 20 : 17} fill={f.colour} stroke="var(--surface)" strokeWidth="3" />
              <text x={cx} y={30} textAnchor="middle" fontFamily="Barlow" fontWeight="800" fontSize="17" fill="#fff">{f.name[0]?.toUpperCase()}</text>
              <text x={cx} y={56} textAnchor="middle" fontSize="12" fontWeight={f.id === meId ? 800 : 600} fill="var(--ink)">{f.name}{f.id === meId ? ' (you)' : ''}</text>
              {!j && <text x={cx} y={TOP + 30} textAnchor="middle" fontSize="11" fill="var(--ink-soft)">{fp.note ?? 'No route'}</text>}
              {j && j.legs.length === 0 && <text x={cx} y={TOP + 30} textAnchor="middle" fontSize="11" fill="var(--ink-soft)">🏡 {fp.note ?? 'Already there'}</text>}
              {j?.legs.map((l, i) => {
                const next = j.legs[i + 1]
                return (
                  <g key={i}>
                    <line x1={cx} x2={cx} y1={y(l.departure)} y2={y(l.arrival)} stroke="#2b2226" strokeWidth="13" strokeLinecap="round" />
                    <line x1={cx} x2={cx} y1={y(l.departure)} y2={y(l.arrival)} stroke={f.colour} strokeWidth="8" strokeLinecap="round" />
                    <g transform={`translate(${cx - 14} ${(y(l.departure) + y(l.arrival)) / 2 - 10})`}>
                      <rect width="28" height="20" rx="6" fill="var(--ink)" />
                      <text x="14" y="14.5" textAnchor="middle" fontFamily="Barlow" fontWeight="800" fontSize="12" fill="var(--bg)">{l.route_id}</text>
                    </g>
                    {next && (
                      <line x1={cx} x2={cx} y1={y(l.arrival)} y2={y(next.departure)} stroke="var(--ink-soft)" strokeWidth="3" strokeDasharray="2 5" strokeLinecap="round"
                        onClick={() => onWaitClick?.(l.to_area)} style={{ cursor: 'pointer' }} />
                    )}
                    <Stop cx={cx} cy={y(l.departure)} label={`${hhmm(l.departure)} ${shortName(l.from_area.name)}`} />
                    {!next && <Stop cx={cx} cy={y(l.arrival)} label={`${hhmm(l.arrival)} 🏁`} />}
                  </g>
                )
              })}
            </g>
          )
        })}

        {playTime != null && (
          <g>
            <line x1={30} x2={width} y1={y(playTime)} y2={y(playTime)} stroke="var(--teal)" strokeWidth="3" />
            <circle cx={30} cy={y(playTime)} r="6" fill="var(--teal)" />
          </g>
        )}
      </svg>
    </div>
  )
}

function Stop({ cx, cy, label }: { cx: number; cy: number; label: string }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r="7" fill="#fff" stroke="#2b2226" strokeWidth="3" />
      <text x={cx + 12} y={cy + 4} fontSize="11" fontWeight="600" fill="var(--ink)" paintOrder="stroke" stroke="var(--surface)" strokeWidth="4">{label}</text>
    </g>
  )
}
