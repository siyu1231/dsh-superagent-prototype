// DSH's Workspace list as the one list of working directories: reading it, registering a bound directory in it, and
// dropping a finished Ticket's own directory from it.
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { adopt, included, retire, workspaceEntries, workspaceId, type WorkspaceRecord, type WorkspaceRegistry } from '../src/app/workspaces.ts'
import type { Workspace } from '../src/policy.ts'

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

const workspace = (id: string, directory: string, repository = ''): Workspace =>
  ({ id, name: id, directory, repository, prepare: '', enabled: true })

it('adds every folder DSH lists to the working directories, and nothing twice', () => {
  const web = directory('web'), docs = directory('docs'), work = directory('work')
  const listed = [{ id: 'w1', path: web, title: 'Web app', sessions: 2 }, { id: 'w2', path: docs, title: '', sessions: 0 }]
  // The configured Web app already names the first folder, however its path is spelled; the second names itself.
  const added = included([workspace('web', `${web}${process.platform === 'win32' ? '\\' : '/'}`)], listed, () => false)!
  expect(added).toHaveLength(2)
  expect(added[0]).toEqual(workspace('web', `${web}${process.platform === 'win32' ? '\\' : '/'}`))
  expect(added[1]).toMatchObject({ directory: docs, repository: '', prepare: '', enabled: true })
  expect(added[1]!.name).toBe(docs.split(/[\\/]/).filter(Boolean).at(-1))
  // A folder that is already a working directory, one a Ticket runs in, and an empty path add nothing.
  expect(included([workspace('web', web)], [listed[0]!, { id: 'w3', path: work, title: 'Ticket', sessions: 1 },
    { id: 'w4', path: '', title: 'Nowhere', sessions: 0 }], path => path === work)).toBeUndefined()
})

it('keeps the ids it derives apart, and accepts a name no slug can read', () => {
  expect(workspaceId([{ id: 'web' }, { id: 'web-2' }], 'Web')).toBe('web-3')
  // A name in another script leaves no letters to slug; the id still starts with one.
  expect(workspaceId([], '工作目录')).toBe('workspace-default')
  expect(workspaceId([{ id: 'workspace-default' }], '工作目录')).toBe('workspace-default-2')
})
