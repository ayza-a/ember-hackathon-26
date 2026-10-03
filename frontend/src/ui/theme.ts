// OWNER: workstream 3 (Frontend). Light/dark theme: follows the OS until the user picks one.
import { useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'
const KEY = 'ember:theme'
const mq = () => window.matchMedia('(prefers-color-scheme: dark)')

function stored(): Theme | null {
  try { const v = localStorage.getItem(KEY); return v === 'light' || v === 'dark' ? v : null } catch { return null }
}

export function useTheme() {
  const [choice, setChoice] = useState<Theme | null>(stored)
  const [os, setOs] = useState<Theme>(() => (mq().matches ? 'dark' : 'light'))
  const theme = choice ?? os

  useEffect(() => {
    const m = mq()
    const on = () => setOs(m.matches ? 'dark' : 'light')
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    window.dispatchEvent(new CustomEvent('ember:theme', { detail: theme }))
  }, [theme])

  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    setChoice(next)
    try { localStorage.setItem(KEY, next) } catch { /* ignore */ }
  }
  return { theme, toggle }
}

/** Current theme for non-React code / components that just need to read it. */
export function useCurrentTheme(): Theme {
  const read = () => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light') as Theme
  const [t, setT] = useState<Theme>(read)
  useEffect(() => {
    const on = () => setT(read())
    window.addEventListener('ember:theme', on)
    return () => window.removeEventListener('ember:theme', on)
  }, [])
  return t
}
