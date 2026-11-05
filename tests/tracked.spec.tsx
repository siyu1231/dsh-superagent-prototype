// @vitest-environment jsdom
import { act, type ComponentType } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { zh } from '../src/client/locales.ts'
import { TrackedTasks } from '../src/client/tracked.tsx'

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
async function render(sessionId: string, open: (session: string) => Promise<void>) {
  const container = document.createElement('div'); document.body.append(container)
  const root = createRoot(container)
  const Tracked = TrackedTasks as ComponentType<Record<string, unknown>>
  await act(async () => { root.render(<Tracked sessionId={sessionId} open={open} t={t} />) })
  for (let i = 0; i < 5; i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
  return { container, dispose: () => { act(() => { root.unmount() }); container.remove() } }
}
const buttons = (container: HTMLElement) => [...container.querySelectorAll('button')]
const entry = (container: HTMLElement, title: string) => buttons(container).find(button => button.textContent?.includes(title))!
afterEach(() => { vi.unstubAllGlobals() })

it('lists the Tickets the router Session tracks and shows the picked one beside the list', async () => {
  serve([row, other])
  const open = vi.fn(async () => {})
  const view = await render(master, open)
  expect(view.container.textContent).toContain(zh.trackedTasks)
  expect(view.container.textContent).toContain('Fix the README typo')
  expect(view.container.textContent).toContain('Add a Contributing section')
  // The first Ticket is selected, so its summary is already on the right.
  expect(view.container.querySelector('.dt-tracked-detail')?.textContent).toContain('/srv/work/web/fix-the-readme-typo')
  expect(view.container.querySelector('.dt-tracked-detail a')?.getAttribute('href')).toBe('https://github.com/acme/web/pull/12')
  await act(async () => { entry(view.container, 'Add a Contributing section').click() })
  expect(open).not.toHaveBeenCalled()
  expect(view.container.querySelector('.dt-tracked-detail')?.textContent).toContain('Add a Contributing section')
  expect(view.container.querySelector('.dt-tracked-entry[aria-current="true"]')?.textContent)
    .toContain('Add a Contributing section')
  view.dispose()
})

it('opens the selected Ticket only when its own button is pressed', async () => {
  serve([row, other])
  const open = vi.fn(async () => {})
  const view = await render(master, open)
  await act(async () => { entry(view.container, 'Add a Contributing section').click() })
  await act(async () => { buttons(view.container).find(button => button.textContent === zh.trackedOpen)!.click() })
  expect(open).toHaveBeenCalledExactlyOnceWith('worker-t2')
  view.dispose()
})

it('shows the one Ticket an executor Session works on, with the way back to the router', async () => {
  serve()
  const open = vi.fn(async () => {})
  const view = await render('worker-t1', open)
  expect(view.container.textContent).toContain(zh.trackedOne)
  expect(view.container.textContent).toContain('Fix the README typo')
  expect(view.container.textContent).toContain(zh.trackedSender)
  await act(async () => { buttons(view.container).find(button => button.textContent === zh.trackedMaster)!.click() })
  expect(open).toHaveBeenCalledExactlyOnceWith(master)
  view.dispose()
})

it('says so when the Session is not one of the plugin\'s', async () => {
  serve()
  const view = await render('some-other-session', async () => {})
  expect(view.container.textContent).toContain(zh.trackedForeign)
  expect(view.container.querySelectorAll('.dt-tracked-list')).toHaveLength(0)
  view.dispose()
})

it('says so when no Ticket has run yet', async () => {
  serve([])
  const view = await render(master, async () => {})
  expect(view.container.textContent).toContain(zh.sessionsEmpty)
  view.dispose()
})

it('reports a failed Session navigation instead of pretending it opened', async () => {
  serve()
  const view = await render(master, async () => { throw new Error('Session is gone') })
  await act(async () => { buttons(view.container).find(button => button.textContent === zh.trackedOpen)!.click() })
  expect(document.body.textContent).toContain('Session is gone')
  view.dispose()
})
