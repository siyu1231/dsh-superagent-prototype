/**
 * The 跟踪 view of a Session: the Tickets the router Session tracks, and, on an executor Session, the Ticket it works on
 * and the way back to the router. The list on the left selects a Ticket; only 打开会话 leaves for the Session itself.
 */
import { useState, type ReactNode } from 'react'
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

function Body({ sessionId }: { sessionId: string }) {
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
  return <div className="dt-column dt-tracked">
    <p className="dt-hint">{router ? t('trackedTasks') : mine ? t('trackedOne') : t('trackedForeign')}</p>
    {!listed.data && !listed.error && <Hint>{t('loading')}</Hint>}
    {listed.error && <p className="dt-error" role="alert">{listed.error.message}</p>}
    {router && !rows.length && listed.data && <Hint>{t('sessionsEmpty')}</Hint>}
    {router && rows.length > 0 && <div className="dt-tracked-body">
      <div className="dt-tracked-side">
        {active.length > 0 && <Group title={t('trackedRunning')} rows={active} selected={selected?.session} onPick={setPicked} />}
        {ended.length > 0 && <Group title={t('trackedFinished')} rows={ended} selected={selected?.session} onPick={setPicked} />}
      </div>
      <div className="dt-tracked-main">{selected && <Detail row={selected} />}</div>
    </div>}
    {!router && mine && <div className="dt-tracked-body dt-tracked-single"><Detail row={mine} /></div>}
    {!router && listed.data && master && <div className="dt-actions">
      <SessionButton variant="outline" sessionId={master} label={t('trackedMaster')} />
    </div>}
  </div>
}

export function TrackedTasks({ sessionId, open, t }: {
  sessionId: string
  /** Shows a Session; rejects with a message in the interface language. */
  open: (session: string) => Promise<void>
  t: T
}) {
  return <PanelScope t={t} openSession={open}><Body sessionId={sessionId} /></PanelScope>
}
