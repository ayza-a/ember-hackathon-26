// OWNER: workstream 3 (Frontend). Landing page: split hero (pitch + two mode tickets | animated converging routes).
import { Link } from 'react-router-dom'
import { USE_MOCKS } from '../api'
import { ConvergeArt } from '../ui/art'
import { Icon, Tagline } from '../ui/bits'

// The main demo meetup. In mock mode this is the scenario in src/mocks/arrive.json; seed the same slug on the backend for the live demo.
const DEMO_SLUG = 'misty-glen-42'

export default function Home() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:py-14">
      <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_1fr]">
        <section>
          <Tagline className="text-lg sm:text-xl" />
          <h1 className="display mt-5 text-5xl sm:text-6xl xl:text-7xl">
            Travel apart.<br /><span className="text-teal">Arrive together.</span>
          </h1>
          <p className="mt-5 max-w-lg text-lg text-ink-soft">
            Friends in different towns? We plan everyone's buses, changes included, so you all arrive at the same time.
            We also show where you can share a bus, wait together, or stop for a coffee on the way.
          </p>

          <div className="mt-8 grid auto-rows-fr gap-5 sm:grid-cols-2">
            <ModeTicket
              to="/new/arrive"
              tone="teal"
              title="Meet at X by T"
              blurb="You know where and when. We'll get everyone there together."
              stat={['3 friends', 'one arrival time']}
            />
            <ModeTicket
              to="/new/suggest"
              tone="deep"
              title="Where should we meet?"
              blurb="We'll find the fairest town in the middle, with gems to explore."
              stat={['Top 3', 'fairest towns']}
            />
          </div>

          {USE_MOCKS && (
            <Link to={`/m/${DEMO_SLUG}`} className="mt-6 inline-flex items-center gap-2 font-bold text-teal hover:underline">
              <Icon name="play" className="h-4 w-4" /> Try the demo trip: 5 friends to Glasgow
            </Link>
          )}
        </section>

        <section className="relative mx-auto w-full max-w-[520px]">
          <ConvergeArt className="h-auto w-full drop-shadow-[0_18px_30px_rgb(11_90_78_/_0.35)]" />
        </section>
      </div>

      <section className="mt-16 grid gap-4 sm:grid-cols-3" aria-label="How it works">
        {[
          ['1', 'Make a trip', 'Pick a place and time, or let us suggest one.', '🗺️'],
          ['2', 'Share the link', 'Friends scan the QR code and add where they\'re coming from.', '📲'],
          ['3', 'Arrive together', 'Synced buses, shared rides and things to do on the way.', '🎉'],
        ].map(([n, t, d, e]) => (
          <div key={n} className="card flex gap-4 p-5">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-teal-soft text-2xl">{e}</span>
            <div>
              <p className="display text-lg"><span className="text-teal">{n}.</span> {t}</p>
              <p className="text-sm text-ink-soft">{d}</p>
            </div>
          </div>
        ))}
      </section>
    </main>
  )
}

function ModeTicket({ to, tone, title, blurb, stat }: { to: string; tone: 'teal' | 'deep'; title: string; blurb: string; stat: [string, string] }) {
  const panel = tone === 'teal' ? 'bg-teal text-white' : 'bg-sea text-white'
  return (
    <Link to={to} className={`group flex h-full flex-col rounded-[32px] p-3 pt-4 transition hover:-translate-y-1 ${panel}`}>
      <div className="ticket ticket-handle flex flex-1 flex-col px-5 pt-9 pb-5 text-center" style={{ color: tone === 'teal' ? 'var(--teal)' : 'var(--sea)' }}>
        <h2 className="display flex min-h-[3rem] items-center justify-center text-2xl text-ink">{title}</h2>
        <p className="mt-2 mb-4 text-sm text-ink-soft">{blurb}</p>
        <div className="mt-auto grid grid-cols-2 divide-x divide-line border-t border-line pt-3">
          <p className="font-display text-lg font-extrabold text-ink">{stat[0]}</p>
          <p className="self-center text-xs text-ink-soft">{stat[1]}</p>
        </div>
        <span className="btn mt-4 w-full group-hover:translate-y-[-2px]">Get started <Icon name="arrow" className="h-4 w-4" /></span>
      </div>
    </Link>
  )
}
