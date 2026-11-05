/**
 * The 跟踪 view of a Session: the Tickets the router Session tracks, and, on an executor Session, the Ticket it works on
 * and the way back to the router. Picking a row shows that Ticket beside the list; only 打开会话 leaves for the Session
 * itself. The same body fills the right column when the Host has one, which is where the view sends it.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { caller, usePoll, type SessionListView } from './api.ts'
import type { DotState, IconName } from './controls.tsx'
import { PanelScope, usePanel } from './provider.tsx'
import type { T } from './text.ts'
import { ExternalLink, Hint, KeyValues, SessionButton, StageMark, When } from './widgets.tsx'

type Row = SessionListView['sessions'][number]
const quiet = { offline: 'offline', notRunning: 'not running', serverError: (status: number) => `error ${status}`,
  requestFailed: (status: number) => `error ${status}`, setup: () => 'setup', user: (failure: { code: string }) => failure.code }
/** A Session id is unreadable in full; its tail is what the sidebar shows too. */
const short = (session: string): string => session.length > 26 ? `…${session.slice(-22)}` : session

/** The mark a Ticket's state shows: a running dot while it works, a stop sign once it ended. */
function markOf(row: Row): { state: DotState; icon: IconName } {
  return row.live ? { state: 'ongoing', icon: 'running' } : { state: 'done', icon: 'stop' }
}
function stateOf(t: T, row: Row): string {
  return row.live ? t(`stage.${row.action}` as Parameters<T>[0]) : t('sessionsEnded')
}

function Entry({ row, selected, onPick }: { row: Row; selected: boolean; onPick: () => void }) {
  const { t } = usePanel()
  const mark = markOf(row)
  return <li className="dt-tracked-item">
    <button type="button" className="dt-tracked-entry" aria-current={selected ? 'true' : undefined} onClick={onPick}>
      <StageMark state={mark.state} icon={mark.icon} label={stateOf(t, row)} />
      <span className="dt-tracked-entry-text">
        <span className="dt-tracked-entry-title">{row.title}</span>
        <span className="dt-tracked-entry-meta"><When at={row.at} /></span>
      </span>
    </button>
  </li>
}

function Group({ title, rows, selected, onPick }: {
  title: string; rows: readonly Row[]; selected: string | undefined; onPick: (session: string) => void
}) {
  return <>
    <p className="dt-tracked-heading">{title}<span className="dt-count">{rows.length}</span></p>
    <ul className="dt-tracked-list">{rows.map(row =>
      <Entry key={row.session} row={row} selected={row.session === selected} onPick={() => { onPick(row.session) }} />)}</ul>
  </>
}

/** Everything recorded about one Ticket, without leaving this view. */
function Detail({ row }: { row: Row }) {
  const { t } = usePanel()
  const mark = markOf(row)
  const pull = row.pull
  const facts: [string, ReactNode][] = [
    [t('trackedState'), stateOf(t, row)],
    [t('trackedTitle'), row.title],
    [t('ticketWorkspaceLabel'), row.workspace || '—'],
    [t('trackedDirectory'), row.directory ? <span className="dt-mono">{row.directory}</span> : '—'],
    [t('trackedSession'), <span className="dt-mono" title={row.session}>{short(row.session)}</span>],
    [t('trackedPull'), pull
      ? pull.url ? <ExternalLink href={pull.url}>{pull.number ? `#${pull.number}` : pull.thread}</ExternalLink>
        : pull.number ? `#${pull.number}` : pull.thread
      : '—'],
    [t('trackedSender'), row.sender || '—'],
    [t('trackedCreated'), <When at={row.createdAt} />],
    [t('trackedUpdated'), <When at={row.at} />],
  ]
  return <article className="dt-tracked-detail">
    <p className="dt-tracked-detail-head"><StageMark state={mark.state} icon={mark.icon} label={stateOf(t, row)} /></p>
    <KeyValues rows={facts} />
    <div className="dt-actions">
      <SessionButton variant="outline" sessionId={row.session} label={t('trackedOpen')} />
    </div>
  </article>
}

/** The Tickets one Session tracks, and what is known about the picked one. */
function Body({ sessionId, narrow }: { sessionId: string; narrow?: boolean }) {
  const { t } = usePanel()
  const [picked, setPicked] = useState<string | undefined>(undefined)
  const listed = usePoll(() => caller(() => quiet)('GET sessions'), [])
  const rows = listed.data?.sessions ?? []
  const master = listed.data?.master
  const mine = rows.find(row => row.session === sessionId)
  const router = master === sessionId
  const active = rows.filter(row => row.live)
  const ended = rows.filter(row => !row.live)
  const selected = rows.find(row => row.session === picked) ?? mine ?? active[0] ?? rows[0]
  const list = router && rows.length > 0 && <>
    {active.length > 0 && <Group title={t('trackedRunning')} rows={active} selected={selected?.session} onPick={setPicked} />}
    {ended.length > 0 && <Group title={t('trackedFinished')} rows={ended} selected={selected?.session} onPick={setPicked} />}
  </>
  return <div className={narrow ? 'dt-column dt-tracked dt-tracked-narrow' : 'dt-column dt-tracked'}>
    <p className="dt-hint">{router ? t('trackedTasks') : mine ? t('trackedOne') : t('trackedForeign')}</p>
    {!listed.data && !listed.error && <Hint>{t('loading')}</Hint>}
    {listed.error && <p className="dt-error" role="alert">{listed.error.message}</p>}
    {router && !rows.length && listed.data && <Hint>{t('sessionsEmpty')}</Hint>}
    {router && rows.length > 0 && (narrow
      ? <>{list}{selected && <Detail row={selected} />}</>
      : <div className="dt-tracked-body">
        <div className="dt-tracked-side">{list}</div>
        <div className="dt-tracked-main">{selected && <Detail row={selected} />}</div>
      </div>)}
    {!router && mine && <div className={narrow ? '' : 'dt-tracked-body dt-tracked-single'}><Detail row={mine} /></div>}
    {!router && listed.data && master && <div className="dt-actions">
      <SessionButton variant="outline" sessionId={master} label={t('trackedMaster')} />
    </div>}
  </div>
}

/** The Conversation view: hands the list to the right column, and stays here only when the Host has none. */
export function TrackedLauncher({ sessionId, t, open, openPanel, showChat }: {
  sessionId: string
  /** Shows a Session; rejects with a message in the interface language. */
  open: (session: string) => Promise<void>
  /** Opens the right column on the tracked list; absent on a Host without one. */
  openPanel: (() => void) | undefined
  /** Returns the centre to the conversation itself; absent on a Host without one. */
  showChat: ((session: string) => void) | undefined
  t: T
}) {
  const [fallback, setFallback] = useState(!openPanel || !showChat)
  useEffect(() => {
    if (!openPanel || !showChat) return
    try {
      openPanel()
      showChat(sessionId)
    } catch {
      setFallback(true)
      return
    }
    // The Host switches this view out on success; staying mounted means it did not, so fill the centre instead.
    const timer = setTimeout(() => { setFallback(true) }, 400)
    return () => { clearTimeout(timer) }
  }, [openPanel, sessionId, showChat])
  return fallback
    ? <PanelScope t={t} openSession={open}><Body sessionId={sessionId} /></PanelScope>
    : null
}

/** The right column body: the tracked list, the picked Ticket beneath it, and the way into its Session. */
export function TrackedPanel({ sessionId, t, open }: {
  sessionId: string
  open: (session: string) => Promise<void>
  t: T
}) {
  return <PanelScope t={t} openSession={open}><Body sessionId={sessionId} narrow /></PanelScope>
}
