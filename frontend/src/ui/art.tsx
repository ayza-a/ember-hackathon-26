// OWNER: workstream 3 (Frontend). Hand-drawn style SVG illustrations: flat colours, thick ink outlines.
import type { Area } from '../types'
import { hash, townOf } from './util'

const INK = '#2b2226'
const S = { stroke: INK, strokeWidth: 3, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const }
const TEAL = '#11937f', TEAL_L = '#30b0a5', MINT = '#9be3d6', RED = '#e5463b', CREAM = '#fdf8f1', MAUVE = '#8f7479', STONE = '#cfc6b8'

// ---------------------------------------------------------------- bus (side view)
export function BusSprite({ className = 'h-10 w-auto', colour = TEAL }: { className?: string; colour?: string }) {
  return (
    <svg viewBox="0 0 120 64" className={className} aria-hidden>
      <rect x="4" y="6" width="110" height="44" rx="12" fill={colour} {...S} />
      <rect x="4" y="34" width="110" height="8" fill={MINT} {...S} strokeWidth={2.5} />
      {[14, 36, 58, 80].map((x) => <rect key={x} x={x} y="14" width="17" height="14" rx="3" fill={CREAM} {...S} strokeWidth={2.5} />)}
      <path d="M100 14 h6 a4 4 0 0 1 4 4 v12 h-10 z" fill={CREAM} {...S} strokeWidth={2.5} />
      <circle cx="28" cy="52" r="8" fill={INK} /><circle cx="28" cy="52" r="3" fill={STONE} />
      <circle cx="90" cy="52" r="8" fill={INK} /><circle cx="90" cy="52" r="3" fill={STONE} />
      <circle cx="112" cy="40" r="2.5" fill={MINT} />
    </svg>
  )
}

export function MapPin({ className = 'h-12 w-auto', colour = RED }: { className?: string; colour?: string }) {
  return (
    <svg viewBox="0 0 40 52" className={className} aria-hidden>
      <path d="M20 49 C 20 49 4 31 4 19 A16 16 0 0 1 36 19 C 36 31 20 49 20 49 Z" fill={colour} {...S} />
      <circle cx="20" cy="19" r="6.5" fill="#fff" {...S} strokeWidth={2.5} />
    </svg>
  )
}

// ---------------------------------------------------------------- town illustrations
type Kind = 'castle' | 'bridge' | 'loch' | 'harbour' | 'city' | 'village'
const KINDS: Record<string, Kind> = {
  edinburgh: 'castle', stirling: 'castle', 'st andrews': 'castle', inveraray: 'castle', urquhart: 'castle',
  dundee: 'bridge', perth: 'bridge', 'dunblane': 'bridge', kinross: 'bridge',
  inverness: 'loch', pitlochry: 'loch', aviemore: 'loch', 'fort william': 'loch', kingussie: 'loch', dunkeld: 'loch', aberfeldy: 'loch',
  oban: 'harbour', aberdeen: 'harbour', thurso: 'harbour', wick: 'harbour', ullapool: 'harbour', mallaig: 'harbour',
  glasgow: 'city', elgin: 'village',
}
const SKIES = ['#d6efe9', '#e6f5f1', '#e4ecef', '#dcefe0']

function townKind(name: string): Kind {
  const t = name.toLowerCase()
  for (const [k, v] of Object.entries(KINDS)) if (t.includes(k)) return v
  return 'village'
}

/** A cute little scene for a town. Known demo towns get a landmark; everywhere else gets a varied village. */
export function TownArt({ area, className = 'h-28 w-full' }: { area: Pick<Area, 'name' | 'region_name'>; className?: string }) {
  const town = townOf(area)
  const h = hash(town)
  const kind = townKind(`${town} ${area.name}`)
  const sky = SKIES[h % SKIES.length]
  return (
    // 360 wide so it fills wide cards; the landmark sits in the middle 200, which is what survives on narrow crops
    <svg viewBox="0 0 360 130" className={className} role="img" aria-label={`Illustration of ${town}`} preserveAspectRatio="xMidYMid slice">
      <rect width="360" height="130" fill={sky} />
      <circle cx={40 + (h % 280)} cy="30" r="13" fill={MINT} {...S} />
      <Cloud x={60 + (h % 90)} y={22} />
      <Cloud x={230 + (h % 70)} y={34} />
      <path d={`M-5 ${92 - (h % 9)} Q 90 ${70 + (h % 12)} 180 88 T 365 ${84 + (h % 10)} V 135 H -5 Z`} fill={TEAL_L} {...S} />
      <g transform="translate(80 0)">
        {kind === 'castle' && <Castle />}
        {kind === 'bridge' && <Bridge />}
        {kind === 'loch' && <Loch />}
        {kind === 'harbour' && <Harbour />}
        {kind === 'city' && <City />}
        {kind === 'village' && <Village h={h} />}
      </g>
      {kind !== 'city' && <><Tree x={24} y={96} /><Tree x={44} y={99} s={0.8} /><Tree x={322} y={95} s={0.9} /><Tree x={340} y={98} s={0.7} /></>}
      {/* road + tiny bus */}
      <path d="M-5 118 H 365" stroke={INK} strokeWidth="14" />
      <path d="M-5 118 H 365" stroke="#fff" strokeWidth="9" />
      <path d="M-5 118 H 365" stroke={STONE} strokeWidth="1.5" strokeDasharray="8 8" />
      <g transform={`translate(${90 + (h % 160)} 101)`}><BusMini /></g>
    </svg>
  )
}

function BusMini() {
  return (
    <g>
      <rect x="0" y="0" width="36" height="16" rx="5" fill={TEAL} {...S} strokeWidth={2.2} />
      <rect x="4" y="3" width="7" height="6" rx="1.5" fill={CREAM} />
      <rect x="14" y="3" width="7" height="6" rx="1.5" fill={CREAM} />
      <rect x="24" y="3" width="7" height="6" rx="1.5" fill={CREAM} />
      <circle cx="9" cy="17" r="3.2" fill={INK} /><circle cx="28" cy="17" r="3.2" fill={INK} />
    </g>
  )
}
function Cloud({ x, y }: { x: number; y: number }) {
  return <path transform={`translate(${x} ${y})`} d="M0 10 a8 8 0 0 1 10-8 a10 10 0 0 1 18 2 a7 7 0 0 1 4 12 H2 a6 6 0 0 1 -2 -6z" fill="#fff" {...S} strokeWidth={2.5} />
}
function Tree({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M0 0 v12" {...S} />
      <circle cx="0" cy="-4" r="8" fill={TEAL} {...S} />
    </g>
  )
}
function Castle() {
  return (
    <g>
      <path d="M40 104 Q 70 70 100 72 Q 140 70 165 104 Z" fill={MAUVE} {...S} />
      <path d="M62 76 V 50 h8 v-6 h6 v6 h8 v-6 h6 v6 h8 v-6 h6 v6 h8 v-6 h6 v6 h8 V 76 Z" fill={STONE} {...S} />
      <path d="M78 76 V 30 h-4 v-6 h6 v4 h6 v-4 h6 v4 h6 v-4 h6 v6 h-4 V 76" fill={CREAM} {...S} />
      <path d="M91 76 v-12 a5 5 0 0 1 10 0 v12" fill={INK} />
      <path d="M96 24 V 8 M96 8 l14 4 -14 4" fill={RED} {...S} strokeWidth={2.5} />
      <rect x="84" y="38" width="5" height="8" rx="2" fill={MINT} {...S} strokeWidth={2} />
      <rect x="103" y="38" width="5" height="8" rx="2" fill={MINT} {...S} strokeWidth={2} />
    </g>
  )
}
function Bridge() {
  return (
    <g>
      <path d="M-85 98 H 285 V 112 H -85 Z" fill="#7cc8e0" {...S} />
      <path d="M-85 70 H 285" {...S} strokeWidth={5} />
      <path d="M-85 70 H 285" stroke={RED} strokeWidth={2.5} />
      {[-70, -30, 10, 50, 90, 130, 170, 210, 250].map((x) => (
        <path key={x} d={`M${x} 70 v 30 M${x} 70 q 20 18 40 0`} fill="none" {...S} />
      ))}
      <path d="M150 56 l10 -16 l10 16 Z" fill={MINT} {...S} strokeWidth={2.5} />
      <rect x="152" y="56" width="16" height="14" fill={CREAM} {...S} strokeWidth={2.5} />
    </g>
  )
}
function Loch() {
  return (
    <g>
      <path d="M-85 92 L -50 58 L -20 80 L 40 40 L 70 72 L 110 26 L 160 84 L 185 56 L 225 88 L 255 62 L 285 92 Z" fill={MAUVE} {...S} />
      <path d="M100 38 l10 -12 l10 14 l-6 -2 l-4 4 l-4 -4 Z" fill="#fff" {...S} strokeWidth={2} />
      <path d="M-85 92 Q 100 84 285 92 V 112 H -85 Z" fill="#7cc8e0" {...S} />
      <path d="M60 100 q8 -4 16 0 M120 104 q8 -4 16 0" fill="none" {...S} strokeWidth={2} />
      {/* a shy loch monster */}
      <path d="M150 100 q4 -14 12 -12 q6 2 4 12" fill={TEAL} {...S} strokeWidth={2.5} />
      <circle cx="160" cy="92" r="1.3" fill={INK} />
      <Tree x={22} y={92} s={0.8} /><Tree x={36} y={94} s={0.7} />
    </g>
  )
}
function Harbour() {
  return (
    <g>
      <path d="M-85 92 H 285 V 112 H -85 Z" fill="#7cc8e0" {...S} />
      <path d="M150 92 V 42 h18 V 92" fill={CREAM} {...S} />
      <path d="M150 58 h18 M150 74 h18" stroke={RED} strokeWidth={7} />
      <path d="M150 42 l9 -10 l9 10" fill={RED} {...S} />
      <path d="M154 30 l-18 -8 M164 30 l18 -8" stroke={MINT} strokeWidth={3} strokeLinecap="round" />
      <path d="M30 90 h56 l-8 12 h-40 Z" fill={RED} {...S} />
      <path d="M56 90 V 60 l20 26 Z" fill="#fff" {...S} strokeWidth={2.5} />
      <path d="M20 102 q8 -4 16 0 M100 104 q8 -4 16 0" fill="none" {...S} strokeWidth={2} />
    </g>
  )
}
function City() {
  return (
    <g>
      {[[-72, 48, 24, STONE], [-44, 62, 24, MAUVE], [-16, 40, 22, CREAM], [12, 50, 26, MINT], [40, 36, 22, CREAM], [204, 60, 24, MAUVE], [232, 42, 22, CREAM], [258, 56, 24, MINT], [64, 58, 28, MAUVE], [124, 44, 24, CREAM], [150, 30, 22, MINT], [174, 54, 24, STONE]].map(([x, y, w, c]) => (
        <g key={x as number}>
          <rect x={x as number} y={y as number} width={w as number} height={104 - (y as number)} fill={c as string} {...S} />
          {Array.from({ length: Math.floor((104 - (y as number)) / 14) }).map((_, i) => (
            <rect key={i} x={(x as number) + 5} y={(y as number) + 6 + i * 14} width={(w as number) - 10} height="5" rx="1.5" fill={INK} opacity=".7" />
          ))}
        </g>
      ))}
      {/* the "armadillo" */}
      <path d="M92 104 q2 -34 30 -40 q-14 12 -10 40 Z" fill="#e7e2da" {...S} />
      <path d="M100 104 q4 -26 22 -34" fill="none" {...S} strokeWidth={2} />
      {/* crane */}
      <path d="M180 54 V 14 h-60 M180 14 l10 0 M150 14 v 20" fill="none" stroke={MINT} strokeWidth={4} strokeLinecap="round" />
    </g>
  )
}
function Village({ h }: { h: number }) {
  const roofs = [RED, MINT, MAUVE, TEAL]
  return (
    <g>
      {[0, 1, 2].map((i) => {
        const x = 30 + i * 52 + ((h >> (i * 3)) % 10)
        const y = 66 + ((h >> (i * 2)) % 10)
        return (
          <g key={i}>
            <rect x={x} y={y} width="34" height={104 - y} fill={CREAM} {...S} />
            <path d={`M${x - 5} ${y + 2} L ${x + 17} ${y - 18} L ${x + 39} ${y + 2} Z`} fill={roofs[(h + i) % roofs.length]} {...S} />
            <rect x={x + 12} y={y + 18} width="10" height={86 - y} fill={INK} />
            <rect x={x + 4} y={y + 6} width="8" height="7" rx="1.5" fill={MINT} {...S} strokeWidth={2} />
          </g>
        )
      })}
      <Tree x={18} y={94} /><Tree x={186} y={92} s={0.9} />
    </g>
  )
}

// ---------------------------------------------------------------- home hero: three friends converge on one pin
const ROUTES = [
  { d: 'M70 92 C 140 120, 170 230, 262 300', c: '#ef4444', who: 'A', town: 'OBAN', lx: 28, ly: 58, delay: 0 },
  { d: 'M462 86 C 410 170, 330 190, 262 300', c: '#3b82f6', who: 'B', town: 'DUNDEE', lx: 400, ly: 52, delay: 0.6 },
  { d: 'M58 452 C 130 430, 190 350, 262 300', c: '#a855f7', who: 'C', town: 'STIRLING', lx: 22, ly: 490, delay: 1.2 },
]
export function ConvergeArt({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 520 540" className={className} role="img" aria-label="Three friends' bus routes converging on one meeting point">
      <defs>
        <clipPath id="panel"><rect x="0" y="0" width="520" height="540" rx="44" /></clipPath>
      </defs>
      <g clipPath="url(#panel)">
        <rect width="520" height="540" fill={TEAL} />
        <path d="M-10 380 Q 140 330 300 400 T 540 360 V 560 H -10 Z" fill="#0f7f6e" />
        <circle cx="430" cy="440" r="70" fill="#0f7f6e" />
        {/* roads */}
        {ROUTES.map((r) => <path key={r.town} d={r.d} fill="none" stroke={INK} strokeWidth="40" strokeLinecap="round" />)}
        {ROUTES.map((r) => <path key={r.town} d={r.d} fill="none" stroke="#fff" strokeWidth="33" strokeLinecap="round" />)}
        {/* friends' dotted lines */}
        {ROUTES.map((r) => (
          <path key={r.town} d={r.d} fill="none" stroke={r.c} strokeWidth="6" strokeLinecap="round" strokeDasharray="1 13" className="animate-dash" />
        ))}
        {/* trees */}
        {[[120, 250], [140, 270], [380, 300], [400, 280], [330, 430], [205, 120], [300, 90]].map(([x, y]) => (
          <g key={`${x}-${y}`} transform={`translate(${x} ${y})`}>
            <ellipse cx="2" cy="16" rx="12" ry="4" fill={INK} opacity=".25" />
            <path d="M0 0 v14" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />
            <circle cx="0" cy="-6" r="13" fill={TEAL_L} {...S} />
          </g>
        ))}
        {/* moving buses */}
        {ROUTES.map((r) => (
          <g key={r.town}>
            <g>
              <rect x="-15" y="-9" width="30" height="18" rx="6" fill={MINT} {...S} strokeWidth={2.5} />
              <rect x="4" y="-6" width="7" height="12" rx="2" fill={CREAM} />
              <circle cx="-6" cy="0" r="5" fill={r.c} stroke="#fff" strokeWidth="1.5" />
              <animateMotion dur="7s" begin={`${r.delay}s`} repeatCount="indefinite" rotate="auto" path={r.d} keyPoints="0;1;1" keyTimes="0;0.75;1" calcMode="linear" />
            </g>
          </g>
        ))}
        {/* origin avatars + labels */}
        {ROUTES.map((r) => {
          const [, x, y] = r.d.match(/M(\d+) (\d+)/)!.map(Number)
          return (
            <g key={r.town}>
              <circle cx={x} cy={y} r="19" fill={r.c} stroke="#fff" strokeWidth="4" />
              <text x={x} y={y + 7} textAnchor="middle" fontFamily="Barlow" fontWeight="800" fontSize="20" fill="#fff">{r.who}</text>
              <g transform={`translate(${r.lx} ${r.ly})`}>
                <rect x="0" y="-16" width={r.town.length * 12 + 18} height="26" rx="13" fill={INK} />
                <text x="9" y="3" fontFamily="Barlow" fontWeight="800" fontSize="15" fill="#fff" letterSpacing="1">{r.town}</text>
              </g>
            </g>
          )
        })}
        {/* meeting point */}
        <ellipse cx="262" cy="306" rx="34" ry="11" fill={INK} opacity=".3" />
        <g className="animate-bob" style={{ transformBox: 'fill-box' }}>
          <path d="M262 300 C 262 300 232 266 232 244 A30 30 0 0 1 292 244 C 292 266 262 300 262 300 Z" fill={RED} {...S} strokeWidth={4} />
          <circle cx="262" cy="244" r="12" fill="#fff" {...S} />
        </g>
        <g transform="translate(300 330)">
          <rect x="0" y="0" width="190" height="44" rx="22" fill="#fff" {...S} />
          <text x="20" y="29" fontFamily="Barlow" fontWeight="800" fontSize="20" fill={INK}>EDINBURGH · 12:00</text>
        </g>
      </g>
    </svg>
  )
}
