/** Browser plugin entry point registering the sidebar icon, main management panel, the 跟踪 Session view, and Plugin Manager config view. */
import { useCallback, useEffect, useRef } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { SidebarPanelIconOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { PluginConfigViewProps } from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { openTrackedSession, SessionNavigationError } from '../navigation.ts'
import { App } from './app.tsx'
import { PluginConfig, usePageForm } from './deployment.tsx'
import { en, zh } from './locales.ts'
import { TrackedLauncher, TrackedPanel } from './tracked.tsx'
import type { T } from './text.ts'

type ClientContext = Context & { sessions: ISessions }
const NS = 'dshSuperagent'
const PANEL_ID = 'dsh-superagent' as MainPanelId
const ENTRY = 'dsh-superagent'
/** The right column's tab type for the tracked list: its id is also the slot key its body registers under. */
const TRACKED = 'dsh-superagent-tracked'

/** A tab type of the Host's right column, which this plugin does not depend on. */
interface TrackedTabs {
  register(definition: { id: string; kind: string; priority: 'extension' | 'builtin' | 'fallback'; title: (address: string) => string }): () => void
}
interface TrackedSidebar {
  openTab(kind: string): void
}
interface TrackedConversation {
  binding(sessionId: string): { activate(view: string): void }
}

function HammerIcon({ size }: SidebarPanelIconOwnerProps) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M6 3.5h9l3.5 1.75v2.5L15 9.5H6a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1z" /><path d="M10 9.5v10.25a1.75 1.75 0 0 0 3.5 0V9.5" /><path d="M10 15.5h3.5" />
  </svg>
}

/** Mounted panel wrapper; cancels any pending Session navigation when a new one starts or the panel unmounts. */
function Mounted({ ctx, t }: { ctx: ClientContext; t: T }) {
  const pending = useRef<AbortController>(undefined)
  useEffect(() => () => { pending.current?.abort() }, [])
  const openSession = useCallback(async (id: string) => {
    pending.current?.abort()
    const request = new AbortController(); pending.current = request
    try {
      await openTrackedSession(ctx.uiWorkspace, ctx.sessions, id as SessionId, request.signal)
    } catch (error) {
      if (error instanceof SessionNavigationError) throw new Error(t(error.code === 'not-ready' ? 'sessionListNotReady' : 'sessionNotListed'))
      throw error
    }
  }, [ctx, t])
  const form = usePageForm(ctx.get('configForms')?.get<Record<string, unknown>>(ENTRY))
  return <App t={t} openSession={openSession} deploymentForm={form} />
}

export const inject = ['slots', 'locale', 'sessions', 'uiWorkspace']
/** Registers the panel, sidebar icon, Plugin Manager config view, and the Session view that lists the tracked Tickets. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-superagent: dictionaries')
  const t = ctx.locale.bind(NS)
  /** Shows a Session, restoring it first when the Ticket's end archived it. */
  const open = async (session: string): Promise<void> => {
    try {
      await openTrackedSession(ctx.uiWorkspace, ctx.sessions, session as SessionId, new AbortController().signal)
    } catch (error) {
      if (error instanceof SessionNavigationError) throw new Error(t(error.code === 'not-ready' ? 'sessionListNotReady' : 'sessionNotListed'))
      throw error
    }
  }
  ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL_ID, locale: NS, inject: () => ({}) },
    (props: { t: T }) => <Mounted ctx={ctx} t={props.t} />))
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: PANEL_ID, order: 10, label: () => t('panel'), locale: NS }, HammerIcon))
  // The right column shows the list beside the conversation; the view itself only hands over, and stays here alone
  // when the Host has no right column to fill.
  const host = ctx as unknown as {
    get(name: string): unknown
    inject(deps: string[], callback: (scope: Context & { sidebarRightTabs: TrackedTabs }) => void): void
  }
  host.inject(['sidebarRightTabs'], scope => {
    scope.effect(() => scope.sidebarRightTabs.register({ id: TRACKED, kind: TRACKED, priority: 'extension', title: () => t('viewTracked') }),
      'dsh-superagent: 跟踪 tab type')
  })
  ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab', key: TRACKED, locale: NS,
    inject: (sessionId: string) => ({ session: sessionId, open }),
  }, (props: { session: string; t: T; open: (session: string) => Promise<void> }) =>
    <TrackedPanel sessionId={props.session} t={props.t} open={props.open} />))
  // Beside 对话 and 轨迹: the Tickets this Session tracks, shown in the right column.
  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view', id: TRACKED, order: 100, label: () => t('viewTracked'), locale: NS,
    inject: () => ({
      open,
      openPanel: host.get('sidebarRight') ? () => { (host.get('sidebarRight') as TrackedSidebar).openTab(TRACKED) } : undefined,
      showChat: host.get('uiConversation')
        ? (session: string) => { (host.get('uiConversation') as TrackedConversation).binding(session).activate('chat') }
        : undefined,
    }),
  }, (props: { sessionId: string; t: T; open: (session: string) => Promise<void>; openPanel?: () => void; showChat?: (session: string) => void }) =>
    <TrackedLauncher sessionId={props.sessionId} t={props.t} open={props.open} openPanel={props.openPanel} showChat={props.showChat} />))
  ctx.slots.inject('plugins.row.config', () => ctx.slots.register({ name: 'plugins.row.config', key: `${ENTRY}#${ENTRY}`, locale: NS },
    (props: PluginConfigViewProps & { t: T }) => <PluginConfig t={props.t} view={props.view} form={props.form} />))
}
