// @vitest-environment jsdom
import { act, createElement, type ComponentType } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { zh } from '../src/client/locales.ts'
import { TrackedPanel } from '../src/client/tracked.tsx'

declare global { var IS_REACT_ACT_ENVIRONMENT: boolean }
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const t = ((key: keyof typeof zh) => zh[key] ?? key) as never
const master = 'orchestrator-master'
const row = { ticket: 't1', session: 'worker-t1', title: 'Fix the README typo', workspace: 'web',
  directory: '/srv/work/web/fix-the-readme-typo', stage: 'working', action: 'working', live: true,
  at: '2026-01-01T00:00:00.000Z', createdAt: '2025-12-31T00:00:00.000Z', sender: 'alice',
  pull: { thread: 'github:12', number: 12, url: 'https://github.com/acme/web/pull/12' } }
const other = { ...row, ticket: 't2', session: 'worker-t2', title: 'Add a Contributing section', stage: 'ended',
  action: 'ended', live: false, at: '2026-01-02T00:00:00.000Z' }
const serve = (sessions: unknown[] = [row]) => vi.stubGlobal('fetch', vi.fn(async (url: string) => {
  const path = new URL(url, 'http://127.0.0.1').pathname.replace('/orchestrator/api/', '')
  if (path === 'sessions') return Response.json({ master, sessions })
  return Response.json({ error: 'unavailable' }, { status: 503 })
}))
async function render(View: ComponentType<Record<string, unknown>>, props: Record<string, unknown>) {
  const container = document.createElement('div'); document.body.append(container)
  const root = createRoot(container)
  await act(async () => { root.render(createElement(View as never, props)) })
  for (let i = 0; i < 5; i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
  return { container, dispose: () => { act(() => { root.unmount() }); container.remove() } }
}
const panel = (sessionId: string, open: (session: string) => Promise<void>, chat: (session: string) => void = () => {}) =>
  render(TrackedPanel as ComponentType<Record<string, unknown>>, { sessionId, open, chat, t })
const buttons = (container: HTMLElement) => [...container.querySelectorAll('button')]
const entry = (container: HTMLElement, title: string) => buttons(container).find(button => button.textContent?.includes(title))!
afterEach(() => { vi.unstubAllGlobals() })

it('lists the Tickets the router Session tracks, split into what runs and what ended', async () => {
  serve([row, other])
  const view = await panel(master, async () => {})
  expect(view.container.textContent).toContain(zh.trackedTasks)
  expect(view.container.textContent).toContain(zh.trackedRunning)
  expect(view.container.textContent).toContain(zh.trackedFinished)
  expect(view.container.textContent).toContain('Fix the README typo')
  expect(view.container.textContent).toContain('Add a Contributing section')
  expect(view.container.querySelectorAll('.dt-tracked-list')).toHaveLength(2)
  expect(view.container.textContent).toContain('web')
  expect(view.container.textContent).toContain('#12')
  view.dispose()
})

it('opens a Ticket\'s conversation in its own tab when its card is picked, and nothing else', async () => {
  serve([row, other])
  const open = vi.fn(async () => {})
  const chat = vi.fn()
  const view = await panel(master, open, chat)
  await act(async () => { entry(view.container, 'Add a Contributing section').click() })
  expect(chat).toHaveBeenCalledExactlyOnceWith('worker-t2', 'Add a Contributing section')
  expect(open).not.toHaveBeenCalled()
  view.dispose()
})

it('keeps a direct way into the Session on the card', async () => {
  serve([row, other])
  const open = vi.fn(async () => {})
  const view = await panel(master, open)
  await act(async () => {
    const target = top(view.container, 'Add a Contributing section')
    ;[...target.closest('li')!.querySelectorAll('button')].at(-1)!.click()
  })
  expect(open).toHaveBeenCalledExactlyOnceWith('worker-t2')
  view.dispose()
})

it('says so when the Host has no right column to open the conversation in', async () => {
  serve([row])
  const view = await panel(master, async () => {}, () => { throw new Error(zh.trackedChatUnavailable) })
  await act(async () => { entry(view.container, 'Fix the README typo').click() })
  expect(document.body.textContent).toContain(zh.trackedChatUnavailable)
  view.dispose()
})

it('shows the one Ticket an executor Session works on, with the way back to the router', async () => {
  serve()
  const open = vi.fn(async () => {})
  const view = await panel('worker-t1', open)
  expect(view.container.textContent).toContain(zh.trackedOne)
  expect(view.container.textContent).toContain('Fix the README typo')
  expect(view.container.textContent).toContain('web')
  await act(async () => { buttons(view.container).find(button => button.textContent === zh.trackedMaster)!.click() })
  expect(open).toHaveBeenCalledExactlyOnceWith(master)
  view.dispose()
})

it('says so when the Session is not one of the plugin\'s', async () => {
  serve()
  const view = await panel('some-other-session', async () => {})
  expect(view.container.textContent).toContain(zh.trackedForeign)
  expect(view.container.querySelectorAll('.dt-tracked-list')).toHaveLength(0)
  view.dispose()
})

it('says so when no Ticket has run yet', async () => {
  serve([])
  const view = await panel(master, async () => {})
  expect(view.container.textContent).toContain(zh.sessionsEmpty)
  view.dispose()
})

it('reports a failed Session navigation instead of pretending it opened', async () => {
  serve()
  const view = await panel(master, async () => { throw new Error('Session is gone') })
  await act(async () => { buttons(view.container).at(-1)!.click() })
  expect(document.body.textContent).toContain('Session is gone')
  view.dispose()
})

/** The card a title sits in, so a test can press the button that belongs to it. */
const top = (container: HTMLElement, title: string) => buttons(container).find(button => button.textContent?.includes(title))!
