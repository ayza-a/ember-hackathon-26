// OWNER: workstream 3 (Frontend). Landing page: pick a mode.
import { Link } from 'react-router-dom'

export default function Home() {
  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-3xl font-bold">Ember Group Journeys</h1>
      <p className="mt-2 text-slate-600">Travel from different towns, arrive together, and discover places along the way.</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Link to="/new/arrive" className="rounded-xl bg-white p-5 shadow hover:shadow-md">
          <h2 className="font-semibold">Meet at a place &amp; time</h2>
          <p className="text-sm text-slate-600">Everyone arrives together, with changes and shared buses.</p>
        </Link>
        <Link to="/new/suggest" className="rounded-xl bg-white p-5 shadow hover:shadow-md">
          <h2 className="font-semibold">Where should we meet?</h2>
          <p className="text-sm text-slate-600">Find the fairest meeting spot for the group.</p>
        </Link>
      </div>
    </main>
  )
}
