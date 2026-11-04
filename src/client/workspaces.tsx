/** Workspaces settings: the working directories Tickets run in, and the repository each one may bind. */
import { usePoll, type SettingsView } from './api.ts'
import { Button, Icon, InfoTip, Input, Switch } from './controls.tsx'
import { SaveBar } from './draft.tsx'
import { LIMITS } from '../limits.ts'
import { usePanel } from './provider.tsx'
import { ConfigHistory, Field, Fields, useBlockDraft, useSettings } from './settings-kit.tsx'
import { Hint, Section } from './widgets.tsx'

type Workspace = SettingsView['blocks']['workspaces']['value'][number]
const EMPTY: Workspace = { id: '', name: '', directory: '', repository: '', prepare: '', enabled: true }

/** A short id the schema accepts, derived from a name a slug can read; names in other scripts fall back to a numbered id. */
const slug = (text: string): string => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)

/** Whether two directories name the same folder; Windows compares case-insensitively, as its file systems do. */
const samePath = (a: string, b: string): boolean => a.replace(/[\\/]+$/, '').toLowerCase() === b.replace(/[\\/]+$/, '').toLowerCase()

/** The last path segment of a directory, which names a Workspace added from DSH's own list. */
const baseName = (path: string): string => path.split(/[\\/]/).filter(Boolean).at(-1) ?? path

/**
 * Turn the edited rows into the value the block stores: every row keeps a unique id (derived from its name when the
 * operator left it empty), and a row with nothing typed into it is a placeholder, not a Workspace.
 */
export function identify(rows: Workspace[]): Workspace[] {
  const used = new Set<string>()
  return rows.flatMap((row, index) => {
    const name = row.name.trim(), directory = row.directory.trim(), repository = row.repository.trim(), prepare = row.prepare.trim()
    if (!name && !directory && !repository) return []
    const base = row.id.trim() || slug(name) || `workspace-${index + 1}`
    let id = base
    for (let suffix = 2; used.has(id); suffix += 1) id = `${base}-${suffix}`
    used.add(id)
    return [{ id, name: name || directory, directory, repository, prepare, enabled: row.enabled }]
  })
}

export function WorkspacesSettings() {
  const { t, call } = usePanel()
  const { blocks, environment } = useSettings().settings
  const saved = blocks.workspaces.value
  const draft = useBlockDraft('workspaces', saved, blocks.workspaces.revision, identify)
  const value = draft.value
  const listed = usePoll(() => call('GET workspaces'), [call])
  const edit = (index: number, next: Partial<Workspace>) => draft.edit(value.map((row, at) => at === index
    ? { ...row, ...next } : row))
  const remove = (index: number) => draft.edit(value.filter((_, at) => at !== index))
  // Folders DSH already lists that no row binds yet: choosing one here keeps the two lists naming the same folder.
  const bound = value.map(row => row.directory.trim()).filter(Boolean)
  const unbound = (listed.data?.workspaces ?? []).filter(entry => !bound.some(directory => samePath(directory, entry.path)))
  const adopt = (entry: { path: string; title: string }) => {
    const name = entry.title || baseName(entry.path)
    draft.edit([...value, { ...EMPTY, id: slug(baseName(entry.path)) || slug(name), name, directory: entry.path }])
  }
  return <div className="dt-form">
    <form className="dt-form" onSubmit={event => { void draft.submit(event) }}>
      <Fields disabled={draft.busy}>
        <div className="dt-form dt-block">
          <h2 className="dt-block-title">{t('workspaces')}<InfoTip text={t('workspacesIntro')} /></h2>
          {unbound.length > 0 && <Section title={t('workspaceAvailable')} hint={t('workspaceAvailableHint')}
            action={<span className="dt-hint">{t('workspaceAvailableCount', { count: String(unbound.length) })}</span>}>
            {unbound.map(entry => <div key={entry.id} className="dt-row dt-lv" style={{ display: 'flex', gap: '12px',
              alignItems: 'center' }}>
              <span className="dt-lv-value dt-mono">{entry.path}</span>
              <span className="dt-lv-label">{entry.title}</span>
              <Button variant="outline" icon={<Icon name="plus" />} onClick={() => adopt(entry)}
                title={t('workspaceBind')}>{t('workspaceBind')}</Button>
            </div>)}
          </Section>}
          {value.length === 0 && <Hint>{t('workspaceEmpty', { root: environment.root })}</Hint>}
          {value.map((row, index) => <Section key={`${row.id}-${index}`} title={row.name || t('workspaceNew')}
            action={<Button variant="ghost" icon={<Icon name="trash" />} title={t('workspaceRemove')}
              onClick={() => remove(index)}>{t('workspaceRemove')}</Button>}>
            <Field label={t('workspaceName')} hint={t('workspaceNameHint')}>
              <Input value={row.name} maxLength={200} onChange={event => edit(index, { name: event.target.value })} />
            </Field>
            <Field label={t('workspaceId')} hint={t('workspaceIdHint')}>
              <Input className="dt-mono" value={row.id} maxLength={64} spellCheck={false}
                placeholder={t('workspaceIdEmpty')} onChange={event => edit(index, { id: event.target.value })} />
            </Field>
            <Field label={t('workspaceDirectory')} hint={t('workspaceDirectoryHint')} note={row.directory ? undefined
              : t('executionDirectoryDefault', { root: environment.root })}>
              <Input className="dt-mono" value={row.directory} spellCheck={false} placeholder={t('workspaceDirectoryEmpty')}
                onChange={event => edit(index, { directory: event.target.value })} />
            </Field>
            <Field label={t('workspaceRepository')} hint={t('workspaceRepositoryHint')}>
              <Input className="dt-mono" value={row.repository} spellCheck={false} placeholder={t('workspaceRepositoryEmpty')}
                onChange={event => edit(index, { repository: event.target.value })} />
            </Field>
            <Field label={t('workspacePrepare')} hint={t('workspacePrepareHint')}>
              <textarea className="dt-textarea dt-mono" rows={3} maxLength={LIMITS.prepareCommand} spellCheck={false}
                placeholder={t('prepareCommandEmpty')} value={row.prepare}
                onChange={event => edit(index, { prepare: event.target.value })} />
            </Field>
            <Field label={t('workspaceEnabled')} hint={t('workspaceEnabledHint')}>
              <Switch checked={row.enabled} label={t('workspaceEnabled')}
                onChange={enabled => edit(index, { enabled })} />
            </Field>
          </Section>)}
          <Button variant="outline" icon={<Icon name="plus" />} onClick={() => draft.edit([...value, EMPTY])}>
            {t('workspaceAdd')}</Button>
        </div>
      </Fields>
      <SaveBar {...draft} onDiscard={draft.discard} />
    </form>
    <ConfigHistory blocks={['workspaces']} />
  </div>
}
