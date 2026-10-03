// Shared formatting helpers. FROZEN SHARED FILE (additive changes only).
export const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
