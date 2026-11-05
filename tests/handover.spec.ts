// The briefing a successor router Session receives when its predecessor hands over, and the pointer that moves with it.
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { join } from 'node:path'
import type { Decision, Ticket } from '../src/core/index.ts'
import { handoverText, type Handover } from '../src/app/handover.ts'
import { startRuntime, type Host } from './fixtures/host.ts'

const ticket = (id: string, more: Partial<Ticket> = {}): Ticket => ({ id, title: `Ticket ${id}`, decisionId: 'd1', channels: [],
  inputs: [], undelivered: [], mandate: { strength: 'explicit', policyVersion: 'v1', basis: { via: 'listed', sender: 'Alice',
    scope: { workspace: 'web' } as unknown as string }, actor: 'alice' }, assignments: [], createdAt: '2026-09-09T00:00:00Z',
  updatedAt: '2026-09-09T00:00:00Z', origin: { triggerId: `request-${id}`, triggerIds: [`request-${id}`] },
  execution: { name: id, directory: `/worktrees/${id}`, assignment: 'Do it.' }, follows: [], ...more } as Ticket)
const decision = (kind: Decision['kind'], threadKey: string): Decision => ({ id: `d-${threadKey}`, evalId: 'e1', threadKey,
  triggerIds: ['t1'], policyVersion: 'v1', at: '2026-09-09T00:00:00Z', kind, reason: [{ code: 'accepted' } as never],
  strength: 'explicit' })
const briefing = (more: Partial<Handover> = {}): Handover => ({ session: 'orchestrator-1-1', previous: 'orchestrator-1',
  at: '2026-09-09T02:00:00Z', policyVersion: 'v3', paused: false, sources: [], tickets: [], waiting: [], decisions: [], ...more })

it('writes the open tickets, the candidates and the policy a successor needs, and says the predecessor is off duty', () => {
  const text = handoverText(briefing({
    tickets: [ticket('t1'), ticket('t2', { ended: { at: '2026-09-09T01:00:00Z', by: 'executor', reason: 'closed', outcome: 'closed' } })],
    waiting: [{ thread: 'github:9', strength: 'likely', since: '2026-09-09T01:30:00Z', triggers: 2 }],
    decisions: [decision('accept', 'github:12')],
    sources: [{ name: 'github', state: 'ready', detail: '2 notifications' }],
  }))
  expect(text).toContain('# Router handover')
  expect(text).toContain('`orchestrator-1-1` took over router duty at 2026-09-09T02:00:00Z')
  expect(text).toContain('`orchestrator-1` is no longer on duty')
  expect(text).toContain('## Open tickets (1)')
  expect(text).toContain('`t1` **Ticket t1**')
  expect(text).toContain('in `web` at `/worktrees/t1`')
  expect(text).not.toContain('`t2`')
  expect(text).toContain('## Waiting for a decision (1)')
  expect(text).toContain('`github:9` — likely, 2 trigger(s), waiting since 2026-09-09T01:30:00Z')
  expect(text).toContain('## Recent decisions (1)')
  expect(text).toContain('github:12')
  expect(text).toContain('## Policy')
  expect(text).toContain('v3')
  expect(text).not.toContain('processing paused')
  expect(text).toContain('- github: ready — 2 notifications')
})

it('says so when the deployment holds nothing, and marks a paused policy', () => {
  const text = handoverText(briefing({ paused: true }))
  expect(text).toContain('## Open tickets (0)\nNone.')
  expect(text).toContain('## Waiting for a decision (0)\nNone.')
  expect(text).toContain('## Recent decisions (0)\nNone.')
  expect(text).toContain('v3 · processing paused')
  expect(text).toContain('None configured.')
})

it('clips a long report and counts the tickets it did not list', () => {
  const many = Array.from({ length: 21 }, (_, index) => ticket(`t${index}`, {
    attention: { question: 'Which branch should this target? '.repeat(10) } as never }))
  const text = handoverText(briefing({ tickets: many }))
  expect(text).toContain('## Open tickets (21)')
  expect(text).toContain('… and 1 more.')
  expect(text.split('\n').filter(line => line.startsWith('- `t')).length).toBe(20)
  expect(text.length).toBeLessThan(21 * 400)
  expect(text).toContain('…')
})

let h: Host
beforeEach(async () => { h = await startRuntime() })
afterEach(async () => { await h.stop() })

/** Every message DSH delivered to a Session, the briefing included. */
const sent = (session: string) => h.deliveries.mock.calls.map(([call]) => call).filter(call => call.sessionId === session)

it('hands router duty to a successor Session that starts from a briefing of what the deployment holds', async () => {
  const previous = h.runtime.masterId
  const result = await h.runtime.handOver('the context grew long')
  expect(result).toEqual({ previous, session: `${previous}-1` })
  expect(h.runtime.masterId).toBe(result.session)
  const brief = sent(result.session).find(call => call.text.includes('# Router handover'))
  expect(brief?.text).toContain(`\`${previous}\` is no longer on duty`)
  expect(sent(previous).some(call => call.text.includes('# Router handover'))).toBe(false)
})

it('derives the next successor from the same base, and sends later work only to the Session on duty', async () => {
  const first = await h.runtime.handOver('one')
  const second = await h.runtime.handOver('two')
  expect(second.session).toBe(`${first.previous}-2`)
  h.runtime.sessions.relay('r9', JSON.stringify({ kind: 'note', text: 'The deployment moved on.' }))
  await h.runtime.pump()
  await h.runtime.idle()
  expect(sent(second.session).some(call => call.text.includes('The deployment moved on.'))).toBe(true)
  expect(sent(first.session).some(call => call.text.includes('The deployment moved on.'))).toBe(false)
})

it('takes router duty when a person starts a Session in the router directory', async () => {
  const previous = h.runtime.masterId
  const agent = await h.controller.create({ sessionId: 'chat-1', title: 'my own chat' }) as unknown as { id: string }
  h.ctx.emit('agent/created', { agent: h.agents.get(agent.id) } as never)
  // Duty moves before the briefing is written, so wait for the briefing itself rather than the pointer.
  await vi.waitFor(() => expect(sent('chat-1').length).toBeGreaterThan(0))
  expect(h.runtime.masterId).toBe('chat-1')
  const brief = sent('chat-1').find(call => call.text.includes('# Router handover'))
  expect(brief?.text).toContain(`\`${previous}\` is no longer on duty`)
})

it('leaves the Session on duty alone when an older Session in the router directory is opened again', async () => {
  const previous = h.runtime.masterId
  const agent = await h.controller.create({ sessionId: 'chat-old', createdAt: Date.now() - 60_000 }) as unknown as { id: string }
  h.ctx.emit('agent/created', { agent: h.agents.get(agent.id) } as never)
  await new Promise(resolve => setTimeout(resolve, 50))
  expect(h.runtime.masterId).toBe(previous)
  expect(sent('chat-old')).toEqual([])
})

it('does not take router duty for a Session started outside the router directory', async () => {
  const previous = h.runtime.masterId
  const agent = await h.controller.create({ sessionId: 'chat-2', cwd: join(h.directory, 'work', 'somewhere') }) as unknown as { id: string }
  h.ctx.emit('agent/created', { agent: h.agents.get(agent.id) } as never)
  await new Promise(resolve => setTimeout(resolve, 50))
  expect(h.runtime.masterId).toBe(previous)
})


