// OWNER: workstream 3 (Frontend). Invite link + QR code. Phones scan it and land on /m/{slug} to join.
import { QRCodeSVG } from 'qrcode.react'
import { useState } from 'react'
import { Icon } from '../../ui/bits'
import { toast } from '../../ui/toast'
import { copyText, inviteOrigin, isLocalOnly, saveInviteOrigin } from '../../ui/util'

export default function Invite({ slug, compact = false }: { slug: string; compact?: boolean }) {
  const [origin, setOrigin] = useState(inviteOrigin)
  const [editing, setEditing] = useState(false)
  const url = `${origin}/m/${slug}`
  const localOnly = isLocalOnly(origin)

  async function copy() {
    if (await copyText(url)) toast('Invite link copied', '📋')
    else toast('Couldn\'t copy automatically. Select the link and copy it', '⚠️')
  }
  async function share() {
    try { await navigator.share({ title: 'Join our Ember trip', text: 'Add where you\'re travelling from and we\'ll sync our buses 🚌', url }) } catch { /* cancelled */ }
  }

  return (
    <div className={compact ? '' : 'text-center'}>
      <div className={`mx-auto w-fit rounded-3xl border-4 border-[#2b2226] bg-white p-3 ${compact ? '' : 'shadow-[0_6px_0_rgb(43_34_38/0.2)]'}`}>
        <QRCodeSVG value={url} size={compact ? 150 : 200} fgColor="#2b2226" level="M" marginSize={0}
          imageSettings={{ src: 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" rx="10" fill="#11937f"/><rect x="8" y="11" width="24" height="15" rx="4" fill="#fff"/><rect x="11" y="14" width="5" height="5" rx="1" fill="#11937f"/><rect x="18" y="14" width="5" height="5" rx="1" fill="#11937f"/><rect x="25" y="14" width="4" height="5" rx="1" fill="#11937f"/><circle cx="14" cy="28" r="3" fill="#fff"/><circle cx="26" cy="28" r="3" fill="#fff"/></svg>'), height: 36, width: 36, excavate: true }} />
      </div>
      <p className="mt-3 text-sm text-ink-soft">Point a phone camera at the code to join</p>

      <div className="mt-3 flex items-center gap-2 rounded-2xl bg-surface-2 p-1.5 pl-3">
        <span className="min-w-0 flex-1 truncate text-left font-mono text-xs select-all">{url}</span>
        <button onClick={copy} className="btn btn-sm" aria-label="Copy invite link"><Icon name="copy" className="h-4 w-4" /> Copy</button>
        {'share' in navigator && <button onClick={share} className="btn btn-teal btn-sm" aria-label="Share invite"><Icon name="share" className="h-4 w-4" /></button>}
      </div>

      {(localOnly || editing) ? (
        <div className="mt-3 rounded-2xl bg-mint-soft p-3 text-left text-xs">
          {localOnly && <p className="mb-2"><b>Heads up:</b> phones can't open <code>localhost</code>. Put this laptop's wifi address here (e.g. <code>http://192.168.1.20:5173</code>).</p>}
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); saveInviteOrigin(origin); setEditing(false); toast('Invite address saved', '✅') }}>
            <input className="field py-1.5 text-xs" value={origin} onChange={(e) => setOrigin(e.target.value)} aria-label="Address phones should open" />
            <button className="btn btn-sm">Save</button>
          </form>
        </div>
      ) : (
        <button onClick={() => setEditing(true)} className="mt-2 text-xs text-ink-soft underline">Phones can't open it? Change the address</button>
      )}
    </div>
  )
}
