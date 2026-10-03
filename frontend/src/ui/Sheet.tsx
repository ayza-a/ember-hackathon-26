// OWNER: workstream 3 (Frontend). Slide-up sheet (bottom on phones, centred card on desktop) with a ticket handle.
import { useEffect, type ReactNode } from 'react'
import { Icon } from './bits'

export default function Sheet({ open, onClose, children, label }: { open: boolean; onClose: () => void; children: ReactNode; label: string }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={label}>
      <button className="absolute inset-0 bg-teal-deep/60 backdrop-blur-[2px]" aria-label="Close" onClick={onClose} />
      <div className="ticket ticket-handle animate-sheet-up relative max-h-[92vh] w-full overflow-y-auto rounded-b-none px-6 pt-10 pb-8 text-teal sm:max-w-md sm:rounded-b-[28px]">
        <button onClick={onClose} className="absolute top-4 right-4 rounded-full p-1.5 text-ink-soft hover:bg-surface-2" aria-label="Close">
          <Icon name="close" />
        </button>
        <div className="text-ink">{children}</div>
      </div>
    </div>
  )
}
