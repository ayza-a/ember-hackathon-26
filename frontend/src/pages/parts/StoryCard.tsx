// OWNER: workstream 3 (Frontend). "The story of your day": the plan told in plain English, in time order.
import { hhmm } from '../../format'
import type { Friend, Plan } from '../../types'
import type { Hover } from '../../components/MapView'
import { TownArt } from '../../ui/art'
import { shortName, buildStory } from '../../ui/util'

export default function StoryCard({ plan, friends, onHover, meId }: { plan: Plan; friends: Friend[]; onHover: (h: Hover) => void; meId?: number | null }) {
  const lines = buildStory(plan, friends)
  return (
    <section className="ticket overflow-hidden" aria-labelledby="story-h">
      <div className="relative">
        <TownArt area={plan.destination} className="h-40 w-full" />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#2b2226]/90 via-[#2b2226]/60 to-transparent px-5 pt-14 pb-3">
          <p className="text-xs font-bold tracking-widest text-mint uppercase">The story of your day</p>
          <h2 id="story-h" className="display text-3xl text-white">Destination: {shortName(plan.destination.name)}</h2>
        </div>
      </div>
      <ol className="relative space-y-1 p-5 pl-6">
        <span className="absolute top-7 bottom-7 left-[38px] w-1 rounded bg-line" aria-hidden />
        {lines.map((l, i) => {
          const mine = meId != null && l.friendIds.includes(meId)
          return (
            <li
              key={i}
              className="animate-fade-up relative flex cursor-default items-start gap-3 rounded-2xl p-2 hover:bg-surface-2"
              style={{ animationDelay: `${i * 70}ms` }}
              onMouseEnter={() => onHover(l.eventIndex != null ? { eventIndex: l.eventIndex } : l.friendIds.length === 1 ? { friendId: l.friendIds[0] } : {})}
              onMouseLeave={() => onHover({})}
            >
              <span className="relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full border-[3px] border-[#2b2226] bg-surface text-base">{l.icon}</span>
              <p className="pt-1 text-sm">
                {l.time && <span className="mr-2 font-display font-extrabold tabular-nums">{hhmm(l.time)}</span>}
                <span className={mine ? 'font-semibold' : ''}>{l.text}</span>
                {mine && <span className="ml-2 rounded-full bg-mint px-1.5 text-[10px] font-bold text-[#2b2226]">YOU</span>}
              </p>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
