/** Sessions page: the router Session and the executor Session of every Ticket, each openable from here. */
import { useEffect, useState } from 'react'
import { caller, usePoll, type SessionListView } from './api.ts'
import { Button, Icon, Tag } from './controls.tsx'
import { usePanel, usePanelData } from './provider.tsx'
import type { T } from './text.ts'
import { Hint, Section } from './widgets.tsx'

type Row = SessionListView['sessions'][number]

/** A Session id is unreadable in full; its tail is what the sidebar shows too. */
const short = (session: string): string => session.length > 26 ? `…${session.slice(-22)}` : session

/** The Ticket's stage in the words the panel already uses for it. */
const state = (t: T, row: Row): string => row.live ? t(`stage.${row.action}` as Parameters<T>[0]) : t('sessionsEnded')

const quiet = { offline: 'offline', notRunning: 'not running', serverError: (status: number) => `error ${status}`,
  requestFailed: (status: number) => `error ${status}`, setup: () => 'setup', user: (failure: { code: string }) => failure.code }
let asked: Promise<string> | undefined
/** The router Session's id, read once: the sidebar row button needs it to tell the router's row from every other row. */
export function useMaster(): string | undefined {
  const [id, setId] = useState<string>()
  useEffect(() => {
    asked ??= caller(() => quiet)('GET state').then(view => view.masterId)
    asked.then(setId, () => { asked = undefined })
  }, [])
  return id
}
/** Hover button on the router Session's sidebar row: opens the page that lists the Sessions it tracks. */
export function TrackedSessionButton({ sessionId, t, open }: { sessionId: string; t: T; open: () => void }) {
  const master = useMaster()
  if (!master || master !== sessionId) return null
  return <button type="button" className="dt-session-action" title={t('sessionsTracked')} aria-label={t('sessionsTracked')}
    onClick={open}><Icon name="session" size={14} /></button>
}

export function SessionsPage() {
  const { t, call, openSession, notify } = usePanel()
  const { state: host } = usePanelData()
  const listed = usePoll(() => call('GET sessions'), [call])
  const open = (session: string) => { openSession(session).catch(failure => notify(failure instanceof Error ? failure.message : String(failure))) }
  const rows = listed.data?.sessions ?? []
  return <div className="dt-column">
    <Section title={t('sessionsMaster')} hint={t('sessionsMasterHint')}>
      <ul className="dt-list">
        <li className="dt-row">
          <div className="dt-row-main">
            <div className="dt-row-title"><span className="dt-mono">{short(host?.masterId ?? listed.data?.master ?? '')}</span></div>
            <div className="dt-row-meta"><Tag tone="outline">{t('term.mainSession')}</Tag></div>
          </div>
          <Button variant="outline" size="sm" icon={<Icon name="session" size={14} />} disabled={!host}
            onClick={() => { if (host) open(host.masterId) }}>{t('sessionsOpen')}</Button>
        </li>
      </ul>
    </Section>
    <Section title={t('sessionsWorkers')} hint={t('sessionsWorkersHint')} count={rows.length}>
      {!rows.length ? <Hint>{t('sessionsEmpty')}</Hint> : <ul className="dt-list">
        {rows.map(row => <li className="dt-row" key={row.session}>
          <div className="dt-row-main">
            <div className="dt-row-title"><button type="button" className="dt-open" onClick={() => open(row.session)}>{row.title}</button></div>
            <div className="dt-row-meta">
              <span className="dt-mono">{short(row.session)}</span>
              {row.workspace && <Tag tone="neutral">{row.workspace}</Tag>}
              <span>{state(t, row)}</span>
              {row.directory && <span className="dt-mono dt-ellipsis">{row.directory}</span>}
            </div>
          </div>
          <Button variant="outline" size="sm" icon={<Icon name="session" size={14} />} onClick={() => open(row.session)}>{t('sessionsOpen')}</Button>
        </li>)}
      </ul>}
    </Section>
    {listed.error && <p className="dt-error" role="alert">{listed.error.message}</p>}
  </div>
}

