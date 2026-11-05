/** Session list: the router's own Session and the executor Session each Ticket ran in. */
import { liveTicket, ticketStage, type Ticket } from '../../core/index.ts'
import { workerSessionId } from '../../executor/dsh.ts'
import type { Store } from '../store.ts'
import { newestFirst } from './records.ts'
import { attribute } from './text.ts'

export interface SessionRow {
  ticket: string
  session: string
  title: string
  workspace: string
  directory: string
  stage: string
  action: string
  /** False once the Ticket ended: its Session is archived, and opening it restores it first. */
  live: boolean
  /** When the Ticket was last touched, and when it was accepted. */
  at: string
  createdAt: string
  /** The person or bot the mandate names. */
  sender: string
  /** The pull request the Ticket opened, when a Source made it follow one. */
  pull?: { thread: string; number?: number; url?: string }
}
export interface SessionListView {
  /** The router Session that reads Triggers and opens Tickets. */
  master: string
  sessions: SessionRow[]
}
/** A Ticket appears once an Assignment has actually started, because only then does a Session exist. */
const started = (ticket: Ticket): boolean => ticket.assignments.some(item => item.startedAt)
const text = (value: unknown): string => typeof value === 'string' ? value : ''
/** The numbered Thread of the pull request the Ticket opened, with the link a Source recorded for it. */
function pullRequest(store: Store, ticket: Ticket): SessionRow['pull'] {
  const own = ticket.follows?.find(follow => follow.own)
  if (!own) return undefined
  const number = /(\d+)$/.exec(own.thread)?.[1]
  const thread = store.threads.get(own.thread)
  const url = (thread && attribute(thread.meta.url)) ?? store.read.firstTrigger(own.thread)?.url
  return { thread: own.thread, ...number ? { number: Number(number) } : {}, ...url ? { url } : {} }
}
export function sessionList(store: Store, masterId: string): SessionListView {
  const sessions = store.tickets.list().filter(started).sort(newestFirst).map(ticket => {
    const stage = ticketStage(ticket)
    const pull = pullRequest(store, ticket)
    return { ticket: ticket.id, session: workerSessionId(ticket.id), title: ticket.title,
      workspace: text(ticket.mandate.basis.scope?.workspace), directory: text(ticket.execution?.directory),
      stage: stage.stage, action: ('action' in stage ? stage.action : undefined) ?? stage.stage, live: liveTicket(ticket),
      at: ticket.updatedAt, createdAt: ticket.createdAt, sender: text(ticket.mandate.basis.sender), ...pull ? { pull } : {} }
  })
  return { master: masterId, sessions }
}
