// The Session list behind the 跟踪 view: which Tickets have a Session, and what the view shows for each.
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
const list = (tickets: Ticket[]): Store => ({ tickets: { list: () => tickets } } as unknown as Store)

it('lists one executor Session per Ticket that started an Assignment, and skips the rest', () => {
  const queued = ticket('t2')
  const view = sessionList(list([started('t1'), queued]), 'orchestrator-1')
  expect(view.master).toBe('orchestrator-1')
  expect(view.sessions).toEqual([{ ticket: 't1', session: 'worker-t1', title: 'Ticket t1', workspace: 'web',
    directory: '/worktrees/t1', stage: 'working', action: 'working', live: true, at: '2026-09-09T00:00:00Z',
    createdAt: '2026-09-09T00:00:00Z', sender: 'Alice' }])
})

it('keeps an ended Ticket in the list, marked as no longer live', () => {
  const view = sessionList(list([started('t1', { ended: { at: '2026-09-09T01:00:00Z', by: 'executor', reason: 'closed', outcome: 'closed' } })]),
    'orchestrator-1')
  expect(view.sessions[0]).toMatchObject({ ticket: 't1', stage: 'ended', live: false })
})

it('names the pull request a Ticket opened, from the Thread it follows', () => {
  const followed = started('t1', { follows: [{ thread: 'github:12', own: true }] } as Partial<Ticket>)
  const store = { ...list([followed]),
    threads: { get: (key: string) => key === 'github:12' ? { key, meta: { url: 'https://github.com/acme/web/pull/12' } } : undefined },
    read: { firstTrigger: () => undefined } } as unknown as Store
  expect(sessionList(store, 'orchestrator-1').sessions[0]?.pull)
    .toEqual({ thread: 'github:12', number: 12, url: 'https://github.com/acme/web/pull/12' })
})

it('leaves the pull request out when the Ticket opened none', () => {
  expect(sessionList(list([started('t1')]), 'orchestrator-1').sessions[0]?.pull).toBeUndefined()
})
