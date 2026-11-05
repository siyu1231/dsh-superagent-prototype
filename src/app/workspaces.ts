/**
 * DSH's Workspace list is the one place working directories are listed: the same folders the operator sees in DSH's own
 * sidebar. dsh-superagent keeps only what DSH has no room for — the repository a directory binds, the command that
 * prepares a Ticket in it, and whether it may run Tickets at all — and registers a bound directory here so both lists
 * name the same folder.
 */
import { sameDirectory } from '../infra/environment.ts'
import type { Workspace } from '../policy.ts'

/** One Workspace as DSH stores it, narrowed to what dsh-superagent reads. */
export interface WorkspaceRecord {
  id: string
  path: string
  title: string
  sessionIds: readonly string[]
}

/** The part of DSH's Workspace registry dsh-superagent keeps in step. */
export interface WorkspaceRegistry {
  list(): readonly WorkspaceRecord[]
  create(path: string, title?: string): Promise<{ id: string }>
  delete(id: string): Promise<boolean>
}

/** One Workspace as the panel shows it. */
export interface WorkspaceEntry {
  id: string
  path: string
  title: string
  sessions: number
}

/** Every Workspace DSH lists, in its own order, for the panel to offer as a directory a Ticket may run in. */
export const workspaceEntries = (registry: WorkspaceRegistry): WorkspaceEntry[] =>
  registry.list().map(({ id, path, title, sessionIds }) => ({ id, path, title, sessions: sessionIds.length }))

/** A short id the schema accepts, derived from a name; names in other scripts fall back to a numbered id. */
export function workspaceId(workspaces: readonly { id: string }[], name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
  const base = /^[a-z]/.test(slug) ? slug : `workspace-${slug || 'default'}`
  const taken = new Set(workspaces.map(workspace => workspace.id))
  let id = base
  for (let suffix = 2; taken.has(id); suffix += 1) id = `${base}-${suffix}`
  return id
}

/**
 * The configured working directories plus every folder DSH already lists, so the sidebar and the panel name the same
 * directories and a folder someone works in is a working directory without a second step. `skip` leaves out the roots a
 * Ticket runs in, which come and go with their Ticket. Returns `undefined` when there is nothing to add.
 */
export function included(workspaces: readonly Workspace[], entries: readonly WorkspaceEntry[],
  skip: (path: string) => boolean): Workspace[] | undefined {
  const all = [...workspaces]
  let added = false
  for (const entry of entries) {
    if (!entry.path || skip(entry.path)) continue
    if (all.some(row => row.directory !== '' && sameDirectory(row.directory, entry.path))) continue
    const name = entry.title.trim() || entry.path.split(/[\\/]/).filter(Boolean).at(-1) || entry.path
    all.push({ id: workspaceId(all, name), name, directory: entry.path, repository: '', prepare: '', enabled: true })
    added = true
  }
  return added ? all : undefined
}

/**
 * Registers `directory` in DSH's Workspace list when no Workspace holds it yet, so a directory bound in the panel shows
 * up in DSH's sidebar too. A directory DSH cannot resolve is left to fail in the caller: the binding still drives
 * execution, and only the sidebar entry is missing.
 */
export async function adopt(registry: WorkspaceRegistry, directory: string, title?: string): Promise<void> {
  if (!directory || registry.list().some(workspace => sameDirectory(workspace.path, directory))) return
  await registry.create(directory, title)
}

/**
 * Drops the sidebar entry a finished Ticket's own directory left in DSH's Workspace list: one directory per Ticket would
 * otherwise pile up beside the directories a person actually works in. The directory, its worktree and its Session logs
 * stay; only the entry goes.
 */
export async function retire(registry: WorkspaceRegistry, directory: string): Promise<void> {
  if (!directory) return
  const held = registry.list().find(workspace => sameDirectory(workspace.path, directory))
  if (held) await registry.delete(held.id)
}
