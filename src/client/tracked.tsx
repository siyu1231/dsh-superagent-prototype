/**
 * The 跟踪 view of a Session: the Tickets the router Session tracks, and, on an executor Session, the Ticket it works on
 * and the way back to the router. Registered into DeepSeek Harness's Conversation views, beside 对话 and 轨迹.
 */
import { caller, usePoll, type SessionListView } from './api.ts'
import type { DotState, IconName } from './controls.tsx'
import { PanelScope, usePanel } from './provider.tsx'
import type { T } from './text.ts'
import { Hint, LabelValue, SessionButton, StageMark, When } from './widgets.tsx'

type Row = SessionListView['sessions'][number]
const quiet = { offline: 'offline', notRunning: 'not running', serverError: (status: number) => `error ${status}`,
  requestFailed: (status: number) => `error ${status}`, setup: () => 'setup', user: (failure: { code: string }) => failure.code }
/** A Session id is unreadable in full; its tail is what the sidebar shows too. */
const short = (session: string): string => session.length > 26 ? `…${session.slice(-22)}` : session

function Line({ row }: { row: Row }) {
  const { t, openSession } = usePanel()
  const mark: { state: DotState; icon: IconName } = row.live ? { state: 'ongoing', icon: 'running' } : { state: 'done', icon: 'stop' }
  return <li className="dt-row dt-ticket" data-state={row.live ? 'ongoing' : undefined}>
    <div className="dt-ticket-stage"><StageMark state={mark.state} icon={mark.icon}
      label={row.live ? t(`stage.${row.action}` as Parameters<T>[0]) : t('sessionsEnded')} /></div>
    <div className="dt-ticket-body">
      <div className="dt-row-title"><button type="button" className="dt-open" onClick={() => {
        openSession(row.session).catch(() => { /* reported by the panel's toast */ })
      }}>{row.title}</button></div>
      <div className="dt-row-meta dt-ticket-meta">
        {row.workspace && <LabelValue label={t('ticketWorkspaceLabel')} value={row.workspace} />}
        <span className="dt-mono" title={row.session}>{short(row.session)}</span>
        {row.directory && <span className="dt-mono dt-ellipsis" title={row.directory}>{row.directory}</span>}
        <When at={row.at} />
      </div>
      <div className="dt-ticket-actions">
        <SessionButton variant="outline" sessionId={row.session} label={t('sessionsOpen')} />
      </div>
    </div>
  </li>
}

function Group({ title, rows }: { title: string; rows: readonly Row[] }) {
  return <>
    <p className="dt-tracked-heading">{title}<span className="dt-count">{rows.length}</span></p>
    <ul className="dt-list">{rows.map(row => <Line key={row.session} row={row} />)}</ul>
  </>
}

function Body({ sessionId }: { sessionId: string }) {
  const { t, openSession } = usePanel()
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
    {router && !rows.length && listed.data && <Hint>{t('sessionsEmpty')}</Hint>}
    {router && active.length > 0 && <Group title={t('trackedRunning')} rows={active} />}
    {router && ended.length > 0 && <Group title={t('trackedFinished')} rows={ended} />}
    {!router && mine && <ul className="dt-list"><Line row={mine} /></ul>}
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
