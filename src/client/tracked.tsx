/**
 * The 跟踪 view of a Session: the Tickets the router Session tracks, and, on an executor Session, the Ticket it works on
 * and the way back to the router. Registered into DeepSeek Harness's Conversation views, beside 对话 and 轨迹.
 */
import { useState } from 'react'
import { caller, usePoll, type SessionListView } from './api.ts'
import { Button, Icon, Tag } from './controls.tsx'
import { Hint } from './widgets.tsx'
import type { T } from './text.ts'

type Row = SessionListView['sessions'][number]

const quiet = { offline: 'offline', notRunning: 'not running', serverError: (status: number) => `error ${status}`,
  requestFailed: (status: number) => `error ${status}`, setup: () => 'setup', user: (failure: { code: string }) => failure.code }
/** A Session id is unreadable in full; its tail is what the sidebar shows too. */
const short = (session: string): string => session.length > 26 ? `…${session.slice(-22)}` : session

export function TrackedTasks({ sessionId, open, t }: {
  sessionId: string
  /** Shows a Session; rejects with a message in the interface language. */
  open: (session: string) => Promise<void>
  t: T
}) {
  const listed = usePoll(() => caller(() => quiet)('GET sessions'), [])
  const [failure, setFailure] = useState<string>()
  const go = (session: string) => {
    setFailure(undefined)
    open(session).catch(error => setFailure(error instanceof Error ? error.message : String(error)))
  }
  const rows = listed.data?.sessions ?? []
  const master = listed.data?.master
  const state = (row: Row) => row.live ? t(`stage.${row.action}` as Parameters<T>[0]) : t('sessionsEnded')
  const one = (row: Row) => <li className="dt-row" key={row.session}>
    <div className="dt-row-main">
      <div className="dt-row-title"><button type="button" className="dt-open" onClick={() => go(row.session)}>{row.title}</button></div>
      <div className="dt-row-meta">
        <span className="dt-mono">{short(row.session)}</span>
        {row.workspace && <Tag tone="neutral">{row.workspace}</Tag>}
        <span>{state(row)}</span>
        {row.directory && <span className="dt-mono dt-ellipsis">{row.directory}</span>}
      </div>
    </div>
    <Button variant="outline" size="sm" icon={<Icon name="session" size={14} />} onClick={() => go(row.session)}>{t('sessionsOpen')}</Button>
  </li>
  // The router Session tracks every executor Session; an executor Session is one Ticket, and the way back is the router.
  const mine = rows.find(row => row.session === sessionId)
  const back = master === undefined ? undefined
    : <Button variant="outline" size="sm" icon={<Icon name="session" size={14} />} onClick={() => go(master)}>{t('trackedMaster')}</Button>
  return <div className="dt-column dt-tracked">
    <p className="dt-hint">{master === sessionId ? t('trackedTasks') : mine ? t('trackedOne') : t('trackedForeign')}</p>
    {!listed.data && !listed.error && <Hint>{t('loading')}</Hint>}
    {listed.error && <p className="dt-error" role="alert">{listed.error.message}</p>}
    {failure && <p className="dt-error" role="alert">{failure}</p>}
    {master === sessionId && (rows.length ? <ul className="dt-list">{rows.map(one)}</ul> : <Hint>{t('sessionsEmpty')}</Hint>)}
    {master !== sessionId && mine && <ul className="dt-list">{one(mine)}</ul>}
    {master !== sessionId && listed.data && <div className="dt-actions">{back}</div>}
  </div>
}
