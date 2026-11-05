// The Session list behind the Sessions page: which Tickets have a Session, and what the page shows for each.
import { expect, it } from 'vitest'
import type { Ticket } from '../src/core/index.ts'
import { sessionList } from '../src/app/views/sessions.ts'
import type { Store } from '../src/app/store.ts'

const ticket = (id: string, more: Partial<Ticket> = {}): Ticket => ({ id, title: `Ticket ${id}`, decisionId: 'd1', channels: [], inputs: [],
  undelivered: [], mandate: { strength: 'explicit', policyVersion: 'v1', basis: { via: 'listed', sender: 'Alice',
    scope: { workspace: 'web' } as unknown as string }, actor: 'alice' }, assignments: [], createdAt: '2026-09-09T00:00:00Z',
  updatedAt: '2026-09-09T00:00:00Z', origin: { triggerId: `request-${id}`, triggerIds: [`request-${id}`] },
  execution: { name: id, directory: `/worktrees/${id}`, assignment: 'Do it.' }, follows: [], ...more } as Ticket)
const started = (id: string, more: Partial<Ticket> = {}) => ticket(id, { ...more,
  assignments: [{ id: 'a1', state: 'running', createdAt: '2026-09-09T00:00:00Z', startedAt: '2026-09-09T00:00:00Z' }] } as Partial<Ticket>)
const list = (tickets: Ticket[]) => ({ tickets: { list: () => tickets } } as unknown as Store)

it('lists one executor Session per Ticket that started an Assignment, and skips the rest', () => {
  const queued = ticket('t2')
  const view = sessionList(list([started('t1'), queued]), 'orchestrator-1')
  expect(view.master).toBe('orchestrator-1')
  expect(view.sessions).toEqual([{ ticket: 't1', session: 'worker-t1', title: 'Ticket t1', workspace: 'web',
    directory: '/worktrees/t1', stage: 'working', action: 'working', live: true, at: '2026-09-09T00:00:00Z' }])
})

it('keeps an ended Ticket in the list, marked as no longer live', () => {
  const view = sessionList(list([started('t1', { ended: { at: '2026-09-09T01:00:00Z', by: 'executor', reason: 'closed', outcome: 'closed' } })]),
    'orchestrator-1')
  expect(view.sessions[0]).toMatchObject({ ticket: 't1', stage: 'ended', live: false })
})
