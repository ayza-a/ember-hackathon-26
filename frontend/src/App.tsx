// OWNER: workstream 3 (Frontend)
import { Route, Routes } from 'react-router-dom'
import ServiceBanner from './components/ServiceBanner'
import CreateMeetup from './pages/CreateMeetup'
import Home from './pages/Home'
import MeetupPage from './pages/Meetup'

export default function App() {
  return (
    <div className="min-h-full">
      <ServiceBanner />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/new/:mode" element={<CreateMeetup />} />
        <Route path="/m/:slug" element={<MeetupPage />} />
      </Routes>
    </div>
  )
}
