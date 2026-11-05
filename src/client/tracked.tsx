/**
 * The 跟踪 tab of the right column: the Tickets the router Session tracks, one card each, and on an executor Session
 * the Ticket it works on with the way back to the router. Picking a card opens that Ticket's conversation in a tab of
 * its own; the button that appears on hover opens the Session itself.
 */
import { caller, usePoll, type SessionListView } from './api.ts'
import { Icon, type DotState, type IconName } from './controls.tsx'
import { PanelScope, usePanel } from './provider.tsx'
import { errorText, type T } from './text.ts'
import { Hint, SessionButton, StageMark, When } from './widgets.tsx'

type Row = SessionListView['sessions'][number]
const quiet = { offline: 'offline', notRunning: 'not running', serverError: (status: number) => `error ${status}`,
  requestFailed: (status: number) => `error ${status}`, setup: () => 'setup', user: (failure: { code: string }) => failure.code }

/** The mark a Ticket's state shows: a running dot while it works, a stop sign once it ended. */
function markOf(row: Row): { state: DotState; icon: IconName } {
  return row.live ? { state: 'ongoing', icon: 'running' } : { state: 'done', icon: 'stop' }
}
function stateOf(t: T, row: Row): string {
  return row.live ? t(`stage.${row.action}` as Parameters<T>[0]) : t('sessionsEnded')
}
/** Where the Ticket ran: the Workspace it belongs to, or the last part of its working directory. */
function whereOf(row: Row): string {
  if (row.workspace) return row.workspace
  const parts = row.directory.split(/[\\/]/).filter(Boolean)
  return parts.at(-1) ?? ''
}

/** One Ticket as a card: what it is, how it went, and where it ran. */
function Card({ row, chat }: { row: Row; chat: (session: string, title: string) => void }) {
  const { t, openSession, notify } = usePanel()
  const mark = markOf(row)
  const where = whereOf(row)
  const pull = row.pull
  return <li className="dt-tracked-item">
    <button type="button" className="dt-tracked-entry" title={t('trackedChat')}
      onClick={() => { try { chat(row.session, row.title) } catch (failure) { notify(errorText(failure)) } }}>
      <span className="dt-tracked-entry-title">{row.title}</span>
      <span className="dt-tracked-entry-meta">
        <StageMark state={mark.state} icon={mark.icon} label={stateOf(t, row)} />
        {where && <span className="dt-tracked-where" title={row.directory || where}>{where}</span>}
        {pull && <span className="dt-tracked-pull"><Icon name="pull" size={12} />{pull.number ? `#${pull.number}` : pull.thread}</span>}
        <When at={row.at} />
      </span>
    </button>
    <button type="button" className="dt-tracked-open" aria-label={t('trackedOpen')} title={t('trackedOpen')}
      onClick={() => { openSession(row.session).catch(failure => notify(errorText(failure))) }}>
      <Icon name="session" size={14} />
    </button>
  </li>
}

function Group({ title, rows, chat }: { title: string; rows: readonly Row[]; chat: (session: string, title: string) => void }) {
  return <>
    <p className="dt-tracked-heading">{title}<span className="dt-count">{rows.length}</span></p>
    <ul className="dt-tracked-list">{rows.map(row => <Card key={row.session} row={row} chat={chat} />)}</ul>
  </>
}

/** The Tickets one Session tracks, as cards; each opens its own conversation in a tab beside this one. */
function Body({ sessionId, chat }: { sessionId: string; chat: (session: string, title: string) => void }) {
  const { t } = usePanel()
  const listed = usePoll(() => caller(() => quiet)('GET sessions'), [])
  const rows = listed.data?.sessions ?? []
  const master = listed.data?.master
  const mine = rows.find(row => row.session === sessionId)
  const router = master === sessionId
  const active = rows.filter(row => row.live)
  const ended = rows.filter(row => !row.live)
  return <div className="dt-column dt-tracked">
    <p className="dt-hint">{router ? t('trackedTasks') : mine ? t('trackedOne') : t('trackedForeign')}</p>
    {!listed.data && !listed.error && <Hint>{t('loading')}</Hint>}
    {listed.error && <p className="dt-error" role="alert">{listed.error.message}</p>}
    {router && listed.data && !rows.length && <Hint>{t('sessionsEmpty')}</Hint>}
    {router && active.length > 0 && <Group title={t('trackedRunning')} rows={active} chat={chat} />}
    {router && ended.length > 0 && <Group title={t('trackedFinished')} rows={ended} chat={chat} />}
    {!router && mine && <ul className="dt-tracked-list"><Card row={mine} chat={chat} /></ul>}
    {!router && listed.data && master && <div className="dt-actions">
      <SessionButton variant="outline" sessionId={master} label={t('trackedMaster')} />
    </div>}
  </div>
}

/** The right column body: the tracked Tickets, and, per card, a tab holding that Ticket's conversation. */
export function TrackedPanel({ sessionId, t, open, chat }: {
  sessionId: string
  /** Shows a Session; rejects with a message in the interface language. */
  open: (session: string) => Promise<void>
  /** Opens one Session's conversation in a tab of its own beside this one. */
  chat: (session: string, title: string) => void
  t: T
}) {
  return <PanelScope t={t} openSession={open}><Body sessionId={sessionId} chat={chat} /></PanelScope>
}
