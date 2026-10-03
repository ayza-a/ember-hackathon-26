// OWNER: workstream 3 (Frontend). Create a meetup, then go to its shareable page.
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import AreaSearch from '../components/AreaSearch'
import type { Area, Mode } from '../types'

export default function CreateMeetup() {
  const mode = (useParams().mode ?? 'arrive') as Mode
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [time, setTime] = useState('12:00')
  const [dest, setDest] = useState<Area | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    try {
      const m = await api.createMeetup({
        mode,
        title: title || null,
        date,
        destination_area_id: mode === 'arrive' ? dest?.id : null,
        target_time: mode === 'arrive' ? `${date}T${time}:00` : null,
      })
      navigate(`/m/${m.slug}`)
    } catch (err) {
      setError(String(err))
    }
  }

  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="text-2xl font-bold">{mode === 'arrive' ? 'Meet at a place & time' : 'Where should we meet?'}</h1>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <input className="w-full rounded border p-2" placeholder="Name your trip (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input className="w-full rounded border p-2" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        {mode === 'arrive' && (
          <>
            <AreaSearch placeholder="Meeting place" onSelect={setDest} />
            <input className="w-full rounded border p-2" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </>
        )}
        <button className="w-full rounded bg-ember p-2 font-semibold text-white disabled:opacity-50" disabled={mode === 'arrive' && !dest}>
          Create &amp; get invite link
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </main>
  )
}
