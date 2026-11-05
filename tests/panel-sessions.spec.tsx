// @vitest-environment jsdom
// The Sessions page: the router Session and the executor Session of each Ticket, each openable from the page.
import { expect, it } from 'vitest'
import { zh } from '../src/client/locales.ts'
import { all, click, find, mount, tab, usePanel } from './fixtures/panel.tsx'
import { server } from './fixtures/panel-server.ts'

usePanel()

it('lists the router Session and one executor Session per Ticket, and opens either', async () => {
  await mount()
  await click(tab(zh['tab.sessions']))
  expect(all('.dt-section-name').map(item => item.textContent)).toEqual([zh.sessionsMaster, zh.sessionsWorkers])
  const [master, workers] = all('.dt-section')
  expect(master!.textContent).toContain('master')
  // The worker row names its Ticket, Session, Workspace, state and directory.
  expect(workers!.textContent).toContain('Fix the README typo')
  expect(workers!.textContent).toContain('worker-t1')
  expect(workers!.textContent).toContain(zh['stage.working'])
  expect(workers!.textContent).toContain('/srv/work/web/fix-the-readme-typo')
  await click(find(zh.sessionsOpen, '.dt-section:nth-of-type(2) button'))
  expect(server.opened).toEqual(['worker-t1'])
  await click(find(zh.sessionsOpen, '.dt-section:nth-of-type(1) button'))
  expect(server.opened).toEqual(['worker-t1', 'master'])
})

it('says so while no Ticket has run, and keeps the router reachable', async () => {
  server.sessions = []
  await mount()
  await click(tab(zh['tab.sessions']))
  expect(all('.dt-section:nth-of-type(2)')[0]!.textContent).toContain(zh.sessionsEmpty)
  await click(find(zh.sessionsOpen, '.dt-section:nth-of-type(1) button'))
  expect(server.opened).toEqual(['master'])
})
