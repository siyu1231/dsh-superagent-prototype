// @vitest-environment jsdom
import { act, createElement, type ComponentType } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { zh } from '../src/client/locales.ts'
import { HistoryTab, historyAddress, historyTarget } from '../src/client/history.tsx'

declare global { var IS_REACT_ACT_ENVIRONMENT: boolean }
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const t = ((key: keyof typeof zh) => zh[key] ?? key) as never
const session = 'worker-t1'
const address = historyAddress(session, 'Fix the README typo')
const asked = { kind: 'asked', at: '2025-12-31T00:00:00.000Z', text: '**Fix the README typo**\n\nCorrect "recieve".' }
const tool = { kind: 'tool', at: '2025-12-31T00:00:01.000Z', text: '', tool: { name: 'pwsh', arguments: '{"command":"git status"}', result: 'nothing to commit' } }
const said = { kind: 'said', at: '2025-12-31T00:00:02.000Z', text: 'Fixed it and opened **PR #12**.' }

const serve = (entries: unknown[]) => vi.stubGlobal('fetch', vi.fn(async (url: string) => {
  const path = new URL(url, 'http://127.0.0.1').pathname.replace('/orchestrator/api/', '')
  if (path === `sessions/${session}/history`) return Response.json({ session, entries })
  return Response.json({ error: 'unavailable' }, { status: 503 })
}))
async function render(props: Record<string, unknown>) {
  const container = document.createElement('div'); document.body.append(container)
  const root = createRoot(container)
  await act(async () => { root.render(createElement(HistoryTab as ComponentType<Record<string, unknown>>, props)) })
  for (let i = 0; i < 5; i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
  return { container, dispose: () => { act(() => { root.unmount() }); container.remove() } }
}
afterEach(() => { vi.unstubAllGlobals() })

it('names the Ticket the tab was opened for, and puts the way into the Session at the foot', async () => {
  serve([asked])
  const view = await render({ address, t, open: async () => {} })
  expect(view.container.textContent).toContain('Fix the README typo')
  const foot = view.container.querySelector('.dt-history-foot .dt-history-open')
  expect(foot?.textContent).toContain(zh.trackedOpen)
  view.dispose()
})

it('reads a conversation back as what was asked, what was said, and the tools it ran', async () => {
  serve([asked, tool, said])
  const view = await render({ address, t, open: async () => {} })
  expect(view.container.textContent).toContain('Correct "recieve".')
  expect(view.container.textContent).toContain('PR #12')
  expect(view.container.querySelectorAll('.dt-history-said .dt-md')).toHaveLength(1)
  expect(view.container.querySelectorAll('.dt-history-asked')).toHaveLength(1)
  const call = view.container.querySelector('.dt-history-call')!
  expect(call.textContent).toContain('pwsh')
  // A call reads as one line: its name and the argument that says what it did.
  expect(call.textContent).toContain('git status')
  expect(call.querySelector('.dt-history-result')?.textContent).toBe('nothing to commit')
  view.dispose()
})

it('keeps the worker\'s reasoning folded away until it is asked for', async () => {
  serve([{ kind: 'thought', at: '2025-12-31T00:00:00.500Z', text: 'The typo is on line 3.' }, said])
  const view = await render({ address, t, open: async () => {} })
  const thought = view.container.querySelector('.dt-history-thought')!
  expect(thought.querySelector('summary')?.textContent).toBe(zh.historyThought)
  expect(thought.querySelector('.dt-md')?.textContent).toContain('The typo is on line 3.')
  view.dispose()
})

it('says so when the log holds nothing to read', async () => {
  serve([])
  const view = await render({ address, t, open: async () => {} })
  expect(view.container.textContent).toContain(zh.historyLogEmpty)
  view.dispose()
})

it('reports a log that could not be read instead of showing an empty conversation', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'not found' }, { status: 404 })))
  const view = await render({ address, t, open: async () => {} })
  expect(view.container.querySelector('[role="alert"]')?.textContent).not.toBe('')
  view.dispose()
})

it('reads the Session and the Ticket title back out of the address it opens', () => {
  expect(historyTarget(address)).toEqual({ session, title: 'Fix the README typo' })
  expect(historyTarget('dsh-resource://subagentchat/session/x?parent=y&mode=unknown')).toBeUndefined()
  expect(historyTarget('dsh-resource://dsh-superagent/history/')).toBeUndefined()
})
