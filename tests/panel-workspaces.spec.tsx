// @vitest-environment jsdom
// The Workspaces block of the Execution settings: the directories Tickets run in and their repositories.
import { expect, it } from 'vitest'
import { zh } from '../src/client/locales.ts'
import { usePanel, mount, all, find, tab, click, type, text } from './fixtures/panel.tsx'
import { server, ticketSummary } from './fixtures/panel-server.ts'

usePanel()
/** The Workspaces block renders one Section per Workspace, named after it; find one by that name. */
const row = (name: string): HTMLElement => {
  const found = all('.dt-section').find(section => section.querySelector('.dt-section-name')?.textContent === name)
  if (!found) throw new Error(`No Workspace named ${name}`)
  return found
}
const controls = (name: string) => [...row(name).querySelectorAll<HTMLInputElement>('input, textarea')]
const open = async () => {
  await mount()
  await click(tab(zh['tab.settings']))
  await click(find(zh['settingsGroup.execution'], '.dt-settings-link'))
}

it('shows the Workspaces with their directory and repository, and adds one with an id derived from its name', async () => {
  await open()
  const [name, id, directory, repository, prepare] = controls('Web app')
  expect([name!.value, id!.value, directory!.value, repository!.value, prepare!.value])
    .toEqual(['Web app', 'web', '/srv/apps/web', 'acme/web', ''])
  await click(zh.workspaceAdd)
  expect(all('.dt-section-name').map(item => item.textContent)).toContain(zh.workspaceNew)
  const [newName, newId, newDirectory, newRepository] = controls(zh.workspaceNew)
  await type(newName!, 'Docs site')
  expect(newId!.value).toBe('')
  await type(newDirectory!, '/srv/docs')
  await type(newRepository!, 'acme/docs')
  await click(zh.save)
  expect(server.settings.workspaces).toEqual([
    { id: 'web', name: 'Web app', directory: '/srv/apps/web', repository: 'acme/web', prepare: '', enabled: true },
    // A name that a slug can read names the Workspace; the operator can still type the id.
    { id: 'docs-site', name: 'Docs site', directory: '/srv/docs', repository: 'acme/docs', prepare: '', enabled: true },
  ])
})

it('removes a Workspace and keeps the rest, and turns one off without losing its directory', async () => {
  await open()
  const remove = all('button').filter(button => button.textContent === zh.workspaceRemove)
  expect(remove).toHaveLength(1)
  await type(controls('Web app')[3]!, 'acme/site')
  await click(row('Web app').querySelector<HTMLElement>('[role="switch"]')!)
  await click(zh.save)
  expect(server.settings.workspaces).toEqual([{ id: 'web', name: 'Web app', directory: '/srv/apps/web', repository: 'acme/site',
    prepare: '', enabled: false }])
  await click(remove[0]!)
  expect(all('.dt-section-name').map(item => item.textContent)).not.toContain('Web app')
  await click(zh.save)
  expect(server.settings.workspaces).toEqual([])
})

it('names the Workspace a Ticket runs in on its row', async () => {
  server.tickets.open = [ticketSummary({ workspace: 'web' })]
  await mount()
  await click(tab(zh['tab.execution']))
  expect(all('.dt-ticket-meta .dt-lv').map(item => item.textContent)).toContain(`${zh.ticketWorkspaceLabel} web`)
})

it('says that Tickets fall back to the Execution root while no Workspace exists', async () => {
  server.settings = { ...server.settings, workspaces: [] }
  await open()
  expect(text()).toContain('还没有工作目录')
  expect(all('.dt-section').some(section => section.querySelector('.dt-section-name')?.textContent === 'Web app')).toBe(false)
})

it('offers the Workspaces DSH already lists, and adds the chosen one as a bound Workspace', async () => {
  await open()
  // The bound Web app is not offered again; the directory DSH lists but no row binds is.
  const offered = all('.dt-section').find(section => section.querySelector('.dt-section-name')?.textContent === zh.workspaceAvailable)
  expect(offered?.textContent).toContain('/srv/docs')
  expect(offered?.textContent).not.toContain('/srv/apps/web')
  await click([...(offered?.querySelectorAll<HTMLElement>('button') ?? [])].find(button => button.textContent?.trim() === zh.workspaceBind)!)
  expect(all('.dt-section-name').map(item => item.textContent)).toContain('Docs site')
  await click(zh.save)
  expect(server.settings.workspaces.map(item => [item.id, item.directory])).toEqual([
    ['web', '/srv/apps/web'],
    // The id a directory names keeps two Workspaces apart even when their titles are in another script.
    ['docs', '/srv/docs'],
  ])
})
