// OWNER: workstream 3 (Frontend). "Join this trip" slide-up sheet: explains the idea, then name + start + (mode 2) leave-after.
import { useState } from 'react'
import { api } from '../../api'
import AreaSearch from '../../components/AreaSearch'
import type { Area, Friend, Meetup } from '../../types'
import { Icon } from '../../ui/bits'
import { confetti } from '../../ui/confetti'
import Sheet from '../../ui/Sheet'
import { toast } from '../../ui/toast'
import { setMe, shortName } from '../../ui/util'

interface Props { meetup: Meetup; open: boolean; onClose: () => void; onJoined: (f: Friend) => void }

export default function JoinSheet({ meetup, open, onClose, onJoined }: Props) {
  const [name, setName] = useState('')
  const [origin, setOrigin] = useState<Area | null>(null)
  const [leave, setLeave] = useState('08:00')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formKey, setFormKey] = useState(0) // bump to clear the form (incl. the station search) after a join
  const suggest = meetup.mode === 'suggest'

  async function join(e: React.FormEvent) {
    e.preventDefault()
    if (!origin || !name.trim()) return
    setBusy(true)
    setError(null)
    try {
      const f = await api.joinMeetup(meetup.slug, {
        name: name.trim(),
        origin_area_id: origin.id,
        earliest_departure: suggest ? `${meetup.date}T${leave}:00` : null,
      })
      setMe(meetup.slug, { friendId: f.id, name: f.name })
      onJoined(f)
      toast(`You're in, ${f.name}! Planning your buses…`, '🎉')
      confetti(0.5, 0.6, 90)
      setName('')
      setOrigin(null)
      setFormKey((k) => k + 1)
      onClose()
    } catch (err) {
      setError(`Couldn't join. ${err instanceof Error ? err.message : ''}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} label="Join this trip">
      <p className="text-xs font-bold tracking-widest text-teal uppercase">{meetup.title ?? 'Group trip'}</p>
      <h2 className="display mt-1 text-3xl">Join this trip</h2>
      <ol className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
        {[['👋', 'Say who you are'], ['🚏', 'Where you start'], ['🚌', 'We sync the buses']].map(([e, t], i) => (
          <li key={t} className="rounded-2xl bg-surface-2 p-2.5">
            <span className="block text-xl">{e}</span>
            <span className="font-semibold"><span className="text-teal">{i + 1}.</span> {t}</span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-sm text-ink-soft">
        {suggest
          ? 'Tell us where you\'re starting and when you can leave. We\'ll find the fairest place for everyone to meet.'
          : <>Everyone's heading to <b className="text-ink">{shortName(meetup.destination?.name ?? 'the meeting point')}</b>. We'll pick your buses so you all arrive together.</>}
      </p>
      <form onSubmit={join} className="mt-5 space-y-3">
        <input className="field" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={24} aria-label="Your name" autoFocus />
        <AreaSearch key={formKey} placeholder="Where are you travelling from?" onSelect={setOrigin} />
        {suggest && (
          <label className="block">
            <span className="text-xs font-bold tracking-widest text-ink-soft uppercase">Leave after</span>
            <input className="field mt-1" type="time" value={leave} onChange={(e) => setLeave(e.target.value)} />
          </label>
        )}
        {error && <p className="rounded-2xl bg-pin/10 p-3 text-sm text-pin" role="alert">{error}</p>}
        <button className="btn btn-teal w-full" disabled={!origin || !name.trim() || busy}>
          {busy ? 'Joining…' : <>Count me in <Icon name="arrow" className="h-4 w-4" /></>}
        </button>
      </form>
    </Sheet>
  )
}
