// OWNER: workstream 3 (Frontend). Live Ember disruption banner (hidden when there's nothing to say).
import { useEffect, useState } from 'react'
import { api } from '../api'
import type { ServiceUpdate } from '../types'

export default function ServiceBanner() {
  const [update, setUpdate] = useState<ServiceUpdate | null>(null)
  useEffect(() => {
    api.serviceUpdate().then(setUpdate).catch(() => {})
  }, [])
  if (!update || update.type === 'none' || !update.short_message) return null
  return <div className="bg-amber-100 p-2 text-center text-sm text-amber-900">{update.short_message}</div>
}
