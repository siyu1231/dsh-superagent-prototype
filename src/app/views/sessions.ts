/** Session list: the router's own Session and the executor Session each Ticket ran in. */
import { liveTicket, ticketStage, type Ticket } from '../../core/index.ts'
import { workerSessionId } from '../../executor/dsh.ts'
import type { Store } from '../store.ts'
import { newestFirst } from './records.ts'

export interface SessionRow {
  ticket: string
  session: string
  title: string
  workspace: string
  directory: string
  stage: string
  action: string
  /** False once the Ticket ended: its Session is archived, and opening it shows the record only. */
  live: boolean
  at: string
}
export interface SessionListView {
  /** The router Session that reads Triggers and opens Tickets. */
  master: string
  sessions: SessionRow[]
}
/** A Ticket appears once an Assignment has actually started, because only then does a Session exist. */
const started = (ticket: Ticket): boolean => ticket.assignments.some(item => item.startedAt)
const text = (value: unknown): string => typeof value === 'string' ? value : ''
export function sessionList(store: Store, masterId: string): SessionListView {
  const sessions = store.tickets.list().filter(started).sort(newestFirst).map(ticket => {
    const stage = ticketStage(ticket)
    return { ticket: ticket.id, session: workerSessionId(ticket.id), title: ticket.title,
      workspace: text(ticket.mandate.basis.scope?.workspace), directory: text(ticket.execution?.directory),
      stage: stage.stage, action: ('action' in stage ? stage.action : undefined) ?? stage.stage, live: liveTicket(ticket), at: ticket.updatedAt }
  })
  return { master: masterId, sessions }
}
