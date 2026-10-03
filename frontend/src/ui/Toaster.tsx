// OWNER: workstream 3 (Frontend). Renders toasts from ui/toast.ts.
import { useEffect, useState } from 'react'
import { onToast, type ToastMsg } from './toast'

export default function Toaster() {
  const [items, setItems] = useState<ToastMsg[]>([])
  useEffect(() => onToast((t) => {
    setItems((xs) => [...xs, t])
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== t.id)), 3200)
  }), [])
  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className="animate-pop flex items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-bg shadow-lg">
          {t.icon && <span className="text-base">{t.icon}</span>}
          {t.text}
        </div>
      ))}
    </div>
  )
}
