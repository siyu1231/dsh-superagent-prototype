/**
 * One Ticket's conversation, in a tab of its own: the requests, what the worker said, and the tools it ran. The words
 * come from the Session's own log, because DSH refuses to show another Session's conversation through its chat tab
 * unless that Session is a subagent of the one asking.
 */
import { useEffect, useRef, useState } from 'react'
import { caller, type SessionHistory } from './api.ts'
import { Icon } from './controls.tsx'
import { PanelScope, usePanel } from './provider.tsx'
import { errorText, type T } from './text.ts'
import { Hint, MarkdownLite } from './widgets.tsx'

const quiet = { offline: 'offline', notRunning: 'not running', serverError: (status: number) => `error ${status}`,
  requestFailed: (status: number) => `error ${status}`, setup: () => 'setup', user: (failure: { code: string }) => failure.code }
/** The address a history tab is opened under; the title rides along so the tab and the page name the Ticket. */
export const HISTORY_ADDRESS = 'dsh-resource://dsh-superagent/history/'
export function historyAddress(session: string, title: string): string {
  return `${HISTORY_ADDRESS}${encodeURIComponent(session)}?${new URLSearchParams({ title }).toString()}`
}
/** The Session and Ticket title an address names, or `undefined` when it is not a history address. */
export function historyTarget(address: string): { session: string; title: string } | undefined {
  if (!address.startsWith(HISTORY_ADDRESS)) return undefined
  const [session = '', query = ''] = address.slice(HISTORY_ADDRESS.length).split('?')
  if (session.length === 0) return undefined
  return { session: decodeURIComponent(session), title: new URLSearchParams(query).get('title') ?? '' }
}

function Body({ session }: { session: string }) {
  const { t } = usePanel()
  const [state, setState] = useState<{ data?: SessionHistory; error?: Error }>({})
  useEffect(() => {
    let live = true
    caller(() => quiet)('GET sessions/:session/history', { session }).then(
      data => { if (live) setState({ data }) },
      (failure: unknown) => { if (live) setState({ error: failure instanceof Error ? failure : new Error(errorText(failure)) }) },
    )
    return () => { live = false }
  }, [session])
  const entries = state.data?.entries ?? []
  const end = useRef<HTMLLIElement>(null)
  // A conversation is read from its newest end, as the Session it came from would open.
  useEffect(() => { end.current?.scrollIntoView?.({ block: 'end' }) }, [entries.length])
  return <>
    {!state.data && !state.error && <Hint>{t('loading')}</Hint>}
    {state.error && <p className="dt-error" role="alert">{state.error.message}</p>}
    {state.data && entries.length === 0 && <Hint>{t('historyLogEmpty')}</Hint>}
    <ol className="dt-history-list">{entries.map((entry, index) => <li key={`${index}-${entry.at}`} ref={index === entries.length - 1 ? end : undefined}
      className={`dt-history-entry dt-history-${entry.kind}`}>
      {entry.kind === 'tool'
        ? <details className="dt-history-call">
          <summary><Icon name="session" size={13} /><span className="dt-mono dt-history-name">{entry.tool?.name}</span>
            <span className="dt-history-args">{hint(entry.tool?.arguments)}</span></summary>
          {entry.tool?.result !== undefined && <pre className="dt-history-result">{entry.tool.result}</pre>}
        </details>
        : entry.kind === 'thought'
          ? <details className="dt-history-thought">
            <summary>{t('historyThought')}</summary>
            <div className="dt-history-bubble"><MarkdownLite text={entry.text} /></div>
          </details>
          : <div className="dt-history-bubble"><MarkdownLite text={entry.text} /></div>}
    </li>)}</ol>
  </>
}

/** The way out of a read-only spread: one full-width button at the foot of the tab, as a conversation's own bar. */
function OpenBar({ session, label }: { session: string; label: string }) {
  const { openSession, notify } = usePanel()
  return <button type="button" className="dt-history-open"
    onClick={() => { openSession(session).catch(error => notify(errorText(error))) }}>
    <Icon name="session" size={15} />{label}
  </button>
}

/** The most telling argument of a call, so a tool row reads as one line instead of a wall of JSON. */
function hint(arguments_: string | undefined): string {
  if (!arguments_) return ''
  try {
    const value: unknown = JSON.parse(arguments_)
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const key of ['command', 'description', 'path', 'query', 'resource', 'url']) {
        const found = (value as Record<string, unknown>)[key]
        if (typeof found === 'string' && found.trim().length > 0) return found
      }
    }
  } catch { /* not JSON: show what the log holds */ }
  return arguments_
}

/** The tab body of one history tab: it reads the address the tab was opened under. */
export function HistoryBody({ t, open, useTabInfo }: {
  t: T
  open: (session: string) => Promise<void>
  useTabInfo: () => { tab: { contentId: string } }
}) {
  const { tab } = useTabInfo()
  return <HistoryTab address={tab.contentId} t={t} open={open} />
}

/** The right column body of one history tab. */
export function HistoryTab({ address, t, open }: {
  /** The address the tab was opened under, which names the Session. */
  address: string
  /** Shows a Session; rejects with a message in the interface language. */
  open: (session: string) => Promise<void>
  t: T
}) {
  const target = historyTarget(address)
  if (!target) return null
  return <PanelScope t={t} openSession={open}>
    <div className="dt-column dt-history">
      <div className="dt-history-head">
        <p className="dt-history-title">{target.title || target.session}</p>
      </div>
      <div className="dt-history-scroll"><Body session={target.session} /></div>
      <div className="dt-history-foot">
        <OpenBar session={target.session} label={t('trackedOpen')} />
      </div>
    </div>
  </PanelScope>
}
