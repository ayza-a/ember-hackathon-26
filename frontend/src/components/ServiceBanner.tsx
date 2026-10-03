// OWNER: workstream 3 (Frontend). Live Ember disruption banner (hidden when there's nothing to say; dismissible).
import { useEffect, useState } from 'react'
import { api } from '../api'
import type { ServiceUpdate } from '../types'
import { Icon } from '../ui/bits'

export default function ServiceBanner() {
  const [update, setUpdate] = useState<ServiceUpdate | null>(null)
  const [hidden, setHidden] = useState(false)
  useEffect(() => {
    api.serviceUpdate().then(setUpdate).catch(() => {})
  }, [])
  if (hidden || !update || update.type === 'none' || !update.short_message) return null
  return (
    <div className="flex items-center gap-3 bg-teal px-4 py-2 text-sm font-medium text-white" role="status">
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white text-xs font-bold text-teal">!</span>
      <p className="flex-1">
        <b className="mr-1">Ember service update:</b>
        {update.short_message}
      </p>
      <button onClick={() => setHidden(true)} className="rounded-full p-1 hover:bg-white/15" aria-label="Dismiss service update">
        <Icon name="close" className="h-4 w-4" />
      </button>
    </div>
  )
}
