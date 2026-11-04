// DSH's Workspace list as the one list of working directories: reading it, registering a bound directory in it, and
// dropping a finished Ticket's own directory from it.
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { adopt, retire, workspaceEntries, type WorkspaceRecord, type WorkspaceRegistry } from '../src/app/workspaces.ts'

const made: string[] = []
afterEach(() => { for (const path of made.splice(0)) rmSync(path, { recursive: true, force: true }) })
/** A directory that exists, because `sameDirectory` compares canonical paths. */
const directory = (name: string): string => {
  const path = join(...[mkdtempSync(join(tmpdir(), `dsh-workspaces-${name}-`))])
  made.push(path)
  return path
}
/** A registry holding `records`, remembering what was asked of it. */
const registry = (records: WorkspaceRecord[] = []) => {
  const created: { path: string; title?: string }[] = [], deleted: string[] = []
  const service: WorkspaceRegistry = {
    list: () => records,
    create: async (path, title) => { created.push({ path, ...title ? { title } : {} }); return { id: `w${created.length}` } },
    delete: async id => { deleted.push(id); return true },
  }
  return { service, created, deleted }
}
const record = (id: string, path: string, title: string, sessionIds: string[] = []): WorkspaceRecord => ({ id, path, title, sessionIds })

it('reads every Workspace DSH lists with the number of Sessions it holds', () => {
  const web = directory('web'), docs = directory('docs')
  expect(workspaceEntries(registry([record('w1', web, 'Web app', ['s1', 's2']), record('w2', docs, 'Docs')]).service))
    .toEqual([{ id: 'w1', path: web, title: 'Web app', sessions: 2 }, { id: 'w2', path: docs, title: 'Docs', sessions: 0 }])
})

it('registers a bound directory once, and only when DSH does not list it yet', async () => {
  const web = directory('web'), docs = directory('docs')
  const { service, created } = registry([record('w1', web, 'Web app')])
  await adopt(service, web, 'Web app')
  expect(created).toEqual([])
  await adopt(service, docs, 'Docs site')
  // A path that names the same folder as a listed one is that Workspace, however it is spelled.
  await adopt(service, `${web}${process.platform === 'win32' ? '\\' : '/'}`, 'Web app')
  // A Workspace without a directory runs under the Execution root, which DSH does not list.
  await adopt(service, '', 'Default')
  expect(created).toEqual([{ path: docs, title: 'Docs site' }])
})

it('drops the entry of a finished Ticket directory, and leaves every other Workspace listed', async () => {
  const web = directory('web'), ticket = directory('ticket')
  mkdirSync(ticket, { recursive: true })
  const { service, deleted } = registry([record('w1', web, 'Web app'), record('w2', ticket, 'Fix the typo')])
  await retire(service, ticket)
  expect(deleted).toEqual(['w2'])
  // Nothing to drop, and nothing asked of DSH: a directory it does not list, and one that never had a folder.
  await retire(service, join(web, 'nowhere'))
  await retire(service, '')
  expect(deleted).toEqual(['w2'])
})
