// OWNER: workstream 3 (Frontend). Fire-and-forget toasts: toast('Copied!').
export interface ToastMsg { id: number; text: string; icon?: string }
type Listener = (t: ToastMsg) => void
const listeners = new Set<Listener>()
let nextId = 1

export function toast(text: string, icon?: string) {
  const t = { id: nextId++, text, icon }
  listeners.forEach((l) => l(t))
}
export function onToast(l: Listener) {
  listeners.add(l)
  return () => { listeners.delete(l) }
}
