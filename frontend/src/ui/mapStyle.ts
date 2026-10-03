// OWNER: workstream 3 (Frontend). OpenFreeMap vector basemaps (free, no API key): Positron for light, Dark for dark.
import type { Theme } from './theme'

export const baseStyle = (theme: Theme) => `https://tiles.openfreemap.org/styles/${theme === 'dark' ? 'dark' : 'positron'}`

export const SCOTLAND: [number, number] = [-4.1, 56.9]
