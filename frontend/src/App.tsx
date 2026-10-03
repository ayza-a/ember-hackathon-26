// OWNER: workstream 3 (Frontend)
import { Link, Route, Routes, useLocation } from 'react-router-dom'
import { USE_MOCKS } from './api'
import ServiceBanner from './components/ServiceBanner'
import CreateMeetup from './pages/CreateMeetup'
import Home from './pages/Home'
import MeetupPage from './pages/Meetup'
import { Icon, Logo } from './ui/bits'
import { useTheme } from './ui/theme'
import Toaster from './ui/Toaster'

export default function App() {
  const { theme, toggle } = useTheme()
  const { pathname } = useLocation()
  return (
    <div className="flex min-h-full flex-col">
      <ServiceBanner />
      <header className="sticky top-0 z-40 border-b border-line/70 bg-bg/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
          <span className="flex items-center gap-3">
            <Link to="/" aria-label="ember·together home"><Logo /></Link>
            {USE_MOCKS && (
              <span className="rounded-full bg-mint px-2.5 py-0.5 text-[11px] font-bold text-[#2b2226]" title="VITE_USE_MOCKS=1: trips and friends come from src/mocks, nothing is saved">
                DEMO DATA
              </span>
            )}
          </span>
          <button onClick={toggle} className="rounded-full p-2 text-ink-soft hover:bg-surface-2 hover:text-ink" aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
          </button>
        </div>
      </header>
      <div key={pathname} className="animate-fade-in flex-1">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/new/:mode" element={<CreateMeetup />} />
          <Route path="/m/:slug" element={<MeetupPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </div>
      <footer className="px-4 py-6 text-center text-xs text-ink-soft">
        Timetables from <a className="underline" href="https://www.ember.to" target="_blank" rel="noreferrer">Ember</a> · Places © OpenStreetMap contributors · Made for the Ember hackathon
      </footer>
      <Toaster />
    </div>
  )
}

function NotFound() {
  return (
    <main className="mx-auto max-w-md p-10 text-center">
      <p className="text-6xl">🚏</p>
      <h1 className="display mt-4 text-4xl">Wrong stop!</h1>
      <p className="mt-2 text-ink-soft">This page doesn't exist.</p>
      <Link to="/" className="btn mt-6">Back to the start</Link>
    </main>
  )
}
