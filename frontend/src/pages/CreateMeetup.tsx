// OWNER: workstream 3 (Frontend). Create a meetup as a bus journey: one question per stop
// (Where? → When? → Name it → Done), the bus drives to the next stop as you answer, and a live map drops a pin.
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import AreaSearch from '../components/AreaSearch'
import type { Area, Meetup, Mode } from '../types'
import { BusSprite } from '../ui/art'
import { Icon } from '../ui/bits'
import { confetti } from '../ui/confetti'
import MiniMap from '../ui/MiniMap'
import { shortName } from '../ui/util'
import Invite from './parts/Invite'

type Step = 'where' | 'when' | 'name' | 'done'
const LABEL: Record<Step, string> = { where: 'Where?', when: 'When?', name: 'Name it', done: 'Done' }

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
function dateChips() {
  const today = new Date()
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)
  const sat = new Date(today); sat.setDate(today.getDate() + ((6 - today.getDay() + 7) % 7 || 7))
  return [['Today', iso(today)], ['Tomorrow', iso(tomorrow)], ['This Saturday', iso(sat)]] as const
}
const prettyDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })

export default function CreateMeetup() {
  const mode = (useParams().mode === 'suggest' ? 'suggest' : 'arrive') as Mode
  const steps: Step[] = mode === 'arrive' ? ['where', 'when', 'name', 'done'] : ['when', 'name', 'done']
  const navigate = useNavigate()
  const chips = useMemo(() => dateChips(), [])
  const [i, setI] = useState(0)
  const [dest, setDest] = useState<Area | null>(null)
  const [date, setDate] = useState<string>(chips[2][1])
  const [time, setTime] = useState('12:00')
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<Meetup | null>(null)
  const step = steps[i]
  const teal = mode === 'arrive'

  const suggestedTitle = mode === 'arrive' && dest
    ? `${new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long' })} in ${shortName(dest.name)}`
    : 'Where shall we meet?'

  async function create() {
    setBusy(true)
    setError(null)
    try {
      const m = await api.createMeetup({
        mode,
        title: title.trim() || suggestedTitle,
        date,
        destination_area_id: mode === 'arrive' ? dest?.id : null,
        target_time: mode === 'arrive' ? `${date}T${time}:00` : null,
      })
      setCreated(m)
      setI(steps.indexOf('done'))
      setTimeout(() => confetti(0.3, 0.4), 500)
    } catch (err) {
      setError(`Couldn't create the trip. ${err instanceof Error ? err.message : ''}`)
    } finally {
      setBusy(false)
    }
  }
  const canNext = step === 'where' ? !!dest : step === 'when' ? !!date && (mode === 'suggest' || !!time) : true
  const next = () => (step === 'name' ? create() : setI((x) => Math.min(x + 1, steps.length - 1)))

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-10">
      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <section className={`rounded-[36px] p-4 sm:p-6 ${teal ? 'bg-teal' : 'bg-mustard'}`}>
          <div className="flex items-center justify-between">
            <Link to="/" className={`flex items-center gap-1 text-sm font-bold ${teal ? 'text-white/85 hover:text-white' : 'text-[#2b2226]/80 hover:text-[#2b2226]'}`}>
              <Icon name="back" className="h-4 w-4" /> Back
            </Link>
            <Link to={`/new/${teal ? 'suggest' : 'arrive'}`} className={`rounded-full px-3 py-1 text-xs font-bold ${teal ? 'bg-white/15 text-white hover:bg-white/25' : 'bg-black/10 text-[#2b2226] hover:bg-black/15'}`}>
              <Icon name="swap" className="mr-1 inline h-3.5 w-3.5" />{teal ? 'Not sure where? Let us suggest' : 'Know where? Meet at X by T'}
            </Link>
          </div>

          <BusRoad steps={steps} index={i} light={teal} onJump={(k) => k < i && step !== 'done' && setI(k)} />

          <div className="ticket ticket-handle mt-2 px-5 pt-10 pb-6 sm:px-8" style={{ color: teal ? 'var(--teal)' : 'var(--mustard-deep)' }}>
            <div key={step} className="animate-fade-up text-ink">
              {step === 'where' && (
                <>
                  <h1 className="display text-4xl">Where are we meeting?</h1>
                  <p className="mt-2 text-ink-soft">Pick any Ember stop. We'll plan everyone's buses to it.</p>
                  <div className="mt-6"><AreaSearch placeholder="Search a town or stop, e.g. Edinburgh" onSelect={setDest} initial={dest} autoFocus /></div>
                </>
              )}
              {step === 'when' && (
                <>
                  <h1 className="display text-4xl">{mode === 'arrive' ? 'When should everyone arrive?' : 'Which day?'}</h1>
                  <p className="mt-2 text-ink-soft">{mode === 'arrive' ? 'We aim for everyone to arrive close together, just before this time.' : 'Friends add their own earliest departure when they join.'}</p>
                  <p className="mt-6 text-xs font-bold tracking-widest text-ink-soft uppercase">Day</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {chips.map(([l, d]) => <button key={l} type="button" className="chip" aria-pressed={date === d} onClick={() => setDate(d)}>{l}</button>)}
                  </div>
                  <input className="field mt-3" type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" />
                  {mode === 'arrive' && (
                    <>
                      <p className="mt-5 text-xs font-bold tracking-widest text-ink-soft uppercase">Arrive by</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {['10:00', '12:00', '14:00', '16:00', '18:00'].map((t) => <button key={t} type="button" className="chip" aria-pressed={time === t} onClick={() => setTime(t)}>{t}</button>)}
                      </div>
                      <input className="field mt-3" type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Arrive by" />
                    </>
                  )}
                </>
              )}
              {step === 'name' && (
                <>
                  <h1 className="display text-4xl">Give it a name</h1>
                  <p className="mt-2 text-ink-soft">Optional, but it makes the invite feel like an event.</p>
                  <input className="field mt-6 text-lg" placeholder={suggestedTitle} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus
                    onKeyDown={(e) => e.key === 'Enter' && !busy && create()} aria-label="Trip name" />
                  <div className="mt-3 flex flex-wrap gap-2">
                    {['Birthday day out 🎂', 'Reunion 🥳', 'Hike & pub 🥾', 'Gig night 🎸'].map((t) => (
                      <button key={t} type="button" className="chip" onClick={() => setTitle(t)}>{t}</button>
                    ))}
                  </div>
                  <Summary mode={mode} dest={dest} date={date} time={time} />
                </>
              )}
              {step === 'done' && created && (
                <>
                  <h1 className="display text-4xl">You're all set! 🎉</h1>
                  <p className="mt-2 mb-5 text-ink-soft">Share this with your friends. Everyone adds where they're coming from, and the plan updates live.</p>
                  <Invite slug={created.slug} />
                  <button className="btn btn-teal mt-6 w-full" onClick={() => navigate(`/m/${created.slug}`)}>
                    Go to the trip <Icon name="arrow" className="h-4 w-4" />
                  </button>
                </>
              )}

              {error && <p className="mt-4 rounded-2xl bg-pin/10 p-3 text-sm text-pin" role="alert">{error}</p>}

              {step !== 'done' && (
                <div className="mt-8 flex gap-3">
                  {i > 0 && <button className="btn btn-ghost" onClick={() => setI(i - 1)}><Icon name="back" className="h-4 w-4" /></button>}
                  <button className="btn flex-1" disabled={!canNext || busy} onClick={next}>
                    {busy ? 'Creating…' : step === 'name' ? 'Create trip & get invite' : 'Next stop'} {!busy && <Icon name="arrow" className="h-4 w-4" />}
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="relative min-h-[320px] overflow-hidden rounded-[36px] border-4 border-[#2b2226] lg:min-h-0">
          <MiniMap area={mode === 'arrive' ? dest : null} />
          <div className="pointer-events-none absolute inset-x-4 top-4 flex justify-center">
            <span className="rounded-full bg-ink px-4 py-2 text-sm font-bold text-bg shadow-lg">
              {mode === 'suggest' ? '🧭 We\'ll find the spot once friends join' : dest ? `📍 ${dest.name}` : 'Your meeting point will appear here'}
            </span>
          </div>
        </section>
      </div>
    </main>
  )
}

function Summary({ mode, dest, date, time }: { mode: Mode; dest: Area | null; date: string; time: string }) {
  return (
    <div className="mt-6 grid grid-cols-2 divide-x divide-line rounded-2xl bg-surface-2 py-3 text-center">
      <div className="px-3">
        <p className="font-display text-lg font-extrabold">{mode === 'arrive' ? shortName(dest?.name ?? '—') : 'To be found'}</p>
        <p className="text-xs text-ink-soft">meeting point</p>
      </div>
      <div className="px-3">
        <p className="font-display text-lg font-extrabold">{mode === 'arrive' ? time : 'Flexible'}</p>
        <p className="text-xs text-ink-soft">{prettyDate(date)}</p>
      </div>
    </div>
  )
}

/** The progress bar: a road with a bus stop per step. The bus drives to the current stop. */
function BusRoad({ steps, index, light, onJump }: { steps: Step[]; index: number; light: boolean; onJump: (i: number) => void }) {
  const pct = (k: number) => 8 + (k / (steps.length - 1)) * 84
  const ink = light ? 'text-white' : 'text-[#2b2226]'
  return (
    <div className="relative mt-4 h-32" aria-label={`Step ${index + 1} of ${steps.length}: ${LABEL[steps[index]]}`} role="progressbar" aria-valuenow={index + 1} aria-valuemin={1} aria-valuemax={steps.length}>
      <div className="absolute inset-x-0 bottom-3 h-6 rounded-full border-[3px] border-[#2b2226] bg-[#3a3135]">
        <div className="absolute inset-x-3 top-1/2 h-0 -translate-y-1/2 border-t-2 border-dashed border-white/50" />
      </div>
      {steps.map((s, k) => (
        <button
          key={s}
          type="button"
          onClick={() => onJump(k)}
          className={`absolute bottom-[30px] flex -translate-x-1/2 flex-col items-center ${ink}`}
          style={{ left: `${pct(k)}%` }}
          tabIndex={k < index ? 0 : -1}
        >
          <span className={`rounded-lg border-[3px] border-[#2b2226] px-2 py-0.5 font-display text-xs font-extrabold whitespace-nowrap uppercase transition ${k <= index ? 'bg-white text-[#2b2226]' : 'bg-white/30 text-[#2b2226]/60'}`}>
            {s === 'done' ? '🏁 ' : k < index ? '✓ ' : ''}{LABEL[s]}
          </span>
          <span className="h-11 w-[3px] bg-[#2b2226]" />
        </button>
      ))}
      <div
        className="absolute bottom-[18px] z-10 transition-[left] duration-[900ms] ease-[cubic-bezier(.5,0,.2,1)]"
        style={{ left: `calc(${pct(index)}% - 38px)` }}
      >
        <BusSprite className="animate-bob h-10 w-auto drop-shadow-md" colour={light ? '#fbc95b' : '#11937f'} />
      </div>
    </div>
  )
}
