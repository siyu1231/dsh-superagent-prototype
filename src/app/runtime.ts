/** Application composition root and lifecycle manager for dsh-superagent. */
import { Service, type Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import type {} from '@deepseek-ai/dsh-session-persistence'
import type {} from '@deepseek-ai/dsh-workspace'
import type {} from '@deepseek-ai/dsh-permission-presets'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-skill'
import type {} from '@deepseek-ai/dsh-subprocess'
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, relative } from 'node:path'
import { lockSync } from 'proper-lockfile'
import { Engine, key, reasonText, type EngineForSettings, type ReceiveResult, type Ticket, type Trigger } from '../core/index.ts'
import { allowedSender, policyVersion, settingsPolicy } from '../policy.ts'
import { SourceRegistry } from '../sources/registry.ts'
import { imKind, ROW as CHAT_ROW, SOURCE as CHAT } from '../sources/im.ts'
import { Commands } from '../infra/commands.ts'
import type { Deployment, Machine } from '../deployment.ts'
import { environmentOf, executionRoot, ticketEnvironment, type Variable } from './execution-environment.ts'
import type { SetupProblem } from '../setup.ts'
import { DshExecutor, sourceTrigger, triggerMessage, workerSessionId } from '../executor/dsh.ts'
import { ticketCard } from './cards.ts'
import { MasterAssessor } from './assessment.ts'
import { KV } from '../kv.ts'
import { Store } from './store.ts'
import { evalsHealth } from './views/overview.ts'
import { TextCache } from './cache.ts'
import { Effects } from './effects.ts'
import { handoverText } from './handover.ts'
import { Prompts } from './prompts.ts'
import { registerHttp, type HttpHost } from './http.ts'
import type { LinkTarget } from './views/records.ts'
import { candidateCard, repliedTo, sourceLink, type LinkHost } from './links.ts'
import { eventNotice, followupNotice } from './notices.ts'
import { pullEndNotices } from '../sources/github-pull.ts'
import { HealthBoard } from '../infra/health.ts'
import { Outbox } from './outbox.ts'
import { Passes } from './passes.ts'
import { Setup } from './setup.ts'
import { feishuSettings } from '../sources/feishu.ts'
import { health, type Health, type SourceContext, type SourceHost } from '../sources/host.ts'
import { Sessions } from './sessions.ts'
import { adopt, included, retire, workspaceEntries, workspaceId, type WorkspaceRegistry } from './workspaces.ts'
import { Settings } from './settings.ts'
import { sourceContextOf, type SourceContextDeps } from './source-context.ts'
import type { ResourceHost } from './resources.ts'
import { mainTools, type MainToolsHost } from './tools/main.ts'
import { executorTools, type ExecutorToolsHost } from './tools/executor.ts'

// Source plugins interact with dsh-superagent exclusively through the `SourceHost` service interface.
declare module '@deepseek-ai/cordis' { interface Context { orchestrator: SourceHost } }
const now = (): string => new Date().toISOString()

/** Age at which a state directory lock nobody owns is stolen, in milliseconds. */
const LOCK_STALE_MS = 15_000

/**
 * Composition root of dsh-superagent that connects `Store`, `Setup`, `Engine`, `SourceRegistry`, `Effects`, `Outbox`, `Passes`, `Sessions`, `Settings`, `Prompts`, `DshExecutor`, and `MasterAssessor`.
 * Exposes the `SourceHost` service on the Cordis context for source plugins and coordinates startup, setup checks, HTTP route registration, and graceful shutdown.
 * Locks the state directory before opening SQLite so concurrent processes cannot corrupt or double-migrate state.
 */
export class Runtime extends Service implements SourceHost {
  readonly store: Store
  readonly setup: Setup
  readonly prompts: Prompts
  readonly effects: Effects
  readonly sources: SourceRegistry
  readonly commands: Commands
  readonly sessions: Sessions
  readonly settings: Settings
  readonly executor: DshExecutor
  readonly assessor: MasterAssessor
  readonly outbox: Outbox
  readonly engine: Engine
  readonly passes: Passes
  readonly ready: Promise<void>
  private readonly board = new HealthBoard()
  private readonly runtimeHealth = this.board.claim('runtime', { state: 'starting', detail: '' })
  /** The Session on router duty; it changes when a router hands over to a successor. */
  private master = ''
  /** When this Runtime was built: only Sessions created after it may take router duty by being created. */
  readonly startedAt = Date.now()
  /** Router turns in progress, so two callers cannot start two successors at once. */
  private handingOver?: Promise<{ previous: string; session: string }>
  /** Successors this Runtime is creating right now: they take duty through the handover, not by being created. */
  private readonly preparing = new Set<string>()
  private readonly sourceLinks = new TextCache(200_000)
  private readonly stopped = new AbortController()
  private readonly disposers: (() => void)[] = []
  private releaseLock?: () => Promise<void>
  private closingFlag = false
  private stopping?: Promise<void>
  private readonly sourceDeps: SourceContextDeps
  private readonly toolHost: MainToolsHost & ExecutorToolsHost
  /** Non-zero while a main-Session tool is executing an Engine command, suppressing self-triggered domain event notices. */
  private quiet = 0
  constructor(ctx: Context, readonly machine: Machine, restart: () => void) {
    super(ctx, 'orchestrator')
    const runtime = this
    // Lock the state directory before opening the database so another process cannot migrate or write concurrently.
    mkdirSync(machine.stateDir, { recursive: true, mode: 0o700 })
    const compromised = (error: Error) => { this.runtimeHealth.set({ state: 'error', detail: error.message }); this.stopped.abort() }
    // A lock left behind by a killed process would otherwise refuse every restart until it ages out, so it is reclaimed
    // first: the lock names its owner, and a lock whose owner is gone belongs to nobody.
    reclaimLock(machine.stateDir)
    const release = lockSync(machine.stateDir, { stale: LOCK_STALE_MS, onCompromised: compromised })
    writeFileSync(join(machine.stateDir, 'runtime.pid'), String(process.pid))
    this.releaseLock = async () => { release() }
    let opened: Store | undefined
    try {
      const report = (error: unknown) => { ctx.logger.warn('dsh-superagent: %s', String(error)) }
      const store = opened = this.store = new Store(join(machine.stateDir, 'orchestrator.sqlite'), report)
      migrateWorkspaces(store)
      admitChats(store)
      includeWorkspaces(store, ctx.workspaceRegistry, machine)
      const setup = this.setup = new Setup({ context: ctx, machine, lifetime: this.lifetime, restart })
      const deployed = () => setup.configured()
        ? environmentOf({ deployment: setup.deployment, sources: this.sources, settings: store.settings() }) : undefined
      const feishu = () => setup.configured() && !!setup.deployment.feishu
      const prompts = this.prompts = new Prompts(store, () => machine.promptMaxChars.get(), deployed, feishu)
      const masterId = this.master = store.get(KV.runtime.masterId) ?? `orchestrator-${key(machine.stateDir)}`
      store.set(KV.runtime.masterId, masterId)
      // The name a successor is derived from: `orchestrator-<state>`, with the handover count kept beside it.
      store.set(KV.runtime.routerBase, store.get(KV.runtime.routerBase) ?? masterId)
      const commands = this.commands = new Commands(() => setup.deployment, setup.commandEnvironment, this.lifetime)
      const board = this.board
      const effects = this.effects = new Effects(store, board)
      const sources = this.sources = new SourceRegistry(() => store.settings(), board, kind => {
        // Sync source member lists once startup completes when a source plugin loads dynamically.
        if (kind.policy?.sync) void this.ready?.then(() => this.settings.syncable().includes(kind.kind) ? this.settings.sync(kind.kind) : undefined)
          .catch(() => { /* sync() records its failure in health. */ })
        return () => {}
      })
      // The IM Source has no plugin of its own: the bridge relays chats into a Session and `Sessions.hear` records them.
      sources.register(imKind)
      const links: LinkHost = { store, links: this.sourceLinks, commands, sources, lifetime: this.lifetime }
      const link = (trigger: Trigger, signal?: AbortSignal) => sourceLink(links, trigger, signal)
      const environment = (ticket: Ticket) => this.ticketEnvironment(ticket)
      const resources: ResourceHost = { store, pages: new TextCache(4_000_000), prompts, commands, get masterId() { return runtime.masterId }, context: ctx,
        promptVersion: id => this.sessions.promptVersion(id), mayRead: (id, revision) => this.sessions.mayRead(id, revision),
        feishuPageSize: () => feishuSettings(sources).readPageSize, sourceLink: link }
      const sessions = this.sessions = new Sessions({ context: ctx, store, prompts, effects, health: board.claim('models'),
        get masterId() { return runtime.masterId }, routerDirectory: machine.stateDir, startedAt: this.startedAt,
        adoptRouter: (session, title) => this.adoptRouter(session, title), lifetime: this.lifetime,
        receive: trigger => { this.engine.receive(trigger) },
        closing: () => this.closing(), environment,
        tools: (agent, ticket) => ticket ? executorTools(this.toolHost, ticket) : mainTools(this.toolHost, agent) })
      const policyChanged: EngineForSettings['policyChanged'] = (from, to, effects) => { this.engine.policyChanged(from, to, effects) }
      this.settings = new Settings({ store, sources, engine: { policyChanged }, health: board, context: ctx, lifetime: this.lifetime, sessions,
        sourceHost: this, setup, requestPass: () => { this.passes.request() } })
      this.executor = new DshExecutor({ context: ctx, get engine() { return runtime.engine }, store, effects, health: board.claim('worker'), machine,
        lifetime: this.lifetime, sessions, closing: () => this.closing(), paused: () => this.paused(), environment, sourceLink: link,
        repliedTo: trigger => repliedTo({ store, sources }, trigger) })
      this.assessor = new MasterAssessor({ get engine() { return runtime.engine }, commands, get deployment() { return setup.deployment }, effects,
        settings: () => store.settings(), paused: () => this.paused(), threadContext: trigger => sources.threadContext(trigger),
        deliver: (id, text) => sessions.prompt(runtime.masterId, id, text, 'steer'), candidateCard: candidate => candidateCard(links, candidate) })
      const outbox = this.outbox = new Outbox({ store, effects, sources, commands, paused: () => this.paused() })
      const { assessor, executor } = this
      const policy = () => settingsPolicy(store.settings(), sources)
      const engine = this.engine = new Engine({ repo: store, scope: sources, policy, assessor, executor,
        outbox, prepareTicket: (ticket, outcome) => executor.prepare(ticket, outcome), emit: event => {
          // Notify the main Session only about domain events it did not initiate itself.
          const notice = this.quiet ? undefined : eventNotice(event, id => store.tickets.get(id))
          if (notice) sessions.notify(...notice)
          // A person's message that reached an open ticket is the ticket's; the main Session hears of it in the same transaction,
          // and of one for an ended ticket once it resumes, unless it routed the message there itself.
          const followed = !this.quiet && (event.type === 'trigger.received' || event.type === 'ticket.resumed' || event.type === 'trigger.followup')
          const followup = followed ? followupNotice(store, sources, event.data.triggerId) : undefined
          if (followup) sessions.relay(followup.id, followup.text)
          // Notify the ticket's conversations whenever it ends via a pull request.
          const ended = event.type === 'ticket.ended' ? store.tickets.get(event.data.ticketId) : undefined
          // Its own directory leaves DSH's Workspace list, and the Session that ran there stops being an ungrouped entry.
          if (ended?.execution?.directory) void retire(ctx.workspaceRegistry, ended.execution.directory, [workerSessionId(ended.id)]).catch(() => {})
          if (ended && setup.configured()) {
            const request = store.triggers.get(ended.origin.triggerId)?.text ?? ''
            // The notice links the PR in the repository the ticket worked in, which is its Workspace's, not the Source's own.
            const scope = ended.mandate?.basis?.scope as { workspace?: unknown } | undefined
            const workspace = typeof scope?.workspace === 'string' ? setup.deployment.workspaces.find(item => item.id === scope.workspace) : undefined
            for (const message of pullEndNotices(ended, request, workspace?.repository ?? setup.deployment.repository)) outbox.send(message)
          }
        } })
      // Update the `evals` health entry on every pass if an evaluation failed as unavailable within the last hour.
      const evals = board.claim('evals', { state: 'ready', detail: 'No unavailable Eval in the last hour' })
      const evaluateDue = () => { engine.evaluateDue(); evals.set(evalsHealth(store)) }
      const passes = this.passes = new Passes({ engine: { receive: trigger => engine.receive(trigger), evaluateDue }, effects,
        health: this.runtimeHealth, lifetime: this.lifetime, configured: () => setup.configured(), closing: () => this.closing() })
      this.sourceDeps = { store, engine, outbox, commands, sources, get ready() { return runtime.ready },
        get deployment() { return setup.deployment }, configured: () => setup.configured(),
        get setupProblem() { return setup.problem }, get feishuProblem() { return setup.feishuProblem }, receive: trigger => passes.receive(trigger) }
      this.toolHost = { context: ctx, engine, store, prompts, sessions, settings: this.settings, assessor, resources,
        router: { handOver: (reason: string) => this.handOver(reason) },
        get github() { return runtime.context({ kind: 'github', health: ['github'] }) },
        requestPass: () => { passes.request() }, sendReplies: () => outbox.sent(),
        quietly: run => { this.quiet++; try { return run() } finally { this.quiet-- } } }
      this.ready = this.initialize()
    } catch (error) {
      // Release the database and state lock if initialization fails so an in-process restart can reacquire them.
      try { opened?.close() } finally { release() }
      throw error
    }
  }
  get health(): Readonly<Record<string, Health>> { return this.board.all }
  /** The Session on router duty: candidates, reports, relays and notices reach it, and it is the one the panel opens. */
  get masterId(): string { return this.master }
  /** Aborted when dsh-superagent stops or loses its state directory lock, cancelling running reads and subprocesses. */
  get lifetime(): AbortSignal { return this.stopped.signal }
  context(kind: { kind: string; health: readonly string[] }): SourceContext { return sourceContextOf(this.sourceDeps, kind) }
  /** Resolved deployment; throws while waiting for setup (`!configured()`). */
  get deployment(): Deployment { return this.setup.deployment }
  configured(): boolean { return this.setup.configured() }
  get setupProblem(): SetupProblem | undefined { return this.setup.problem }
  /** Why the Feishu bot is unavailable even though the Feishu Source configures a CLI. */
  get feishuProblem(): SetupProblem | undefined { return this.setup.feishuProblem }
  links(): LinkTarget {
    const resolved = this.setup.configured() ? this.setup.deployment : undefined
    const links = resolved ? { repository: resolved.repository, ...(resolved.feishu ? { feishu: resolved.feishu } : {}) } : {}
    return channel => this.sources.link(channel, links)
  }
  ticketEnvironment(ticket: Ticket): Variable[] {
    const trigger = sourceTrigger(this, ticket)
    const { setup: { deployment }, sources } = this
    return ticketEnvironment({ deployment, sources, settings: this.store.settings(), ticket, ...trigger ? { trigger } : {} })
  }
  checkSetup(): void { this.setup.check() }
  /**
   * Hand router duty to a successor Session. A router's context only grows, so it starts a new Session that begins from a
   * briefing of what the deployment holds (open tickets, waiting candidates, recent decisions, policy), the predecessor stops
   * receiving anything, and the candidates it had not decided are delivered again to the successor. Callers that ask at the
   * same time share one handover.
   */
  handOver(reason: string): Promise<{ previous: string; session: string }> {
    this.runtimeHealth.set({ state: 'ready', detail: `Router handover: ${reason}`, at: now() })
    return this.handingOver ??= this.handover().finally(() => { this.handingOver = undefined })
  }
  /**
   * Takes router duty in a Session a person started in the router's own directory, briefing it the way a handover does.
   * Answers whether it took duty; false when it already was the router or another handover moved the pointer first.
   */
  async adoptRouter(sessionId: string, title: string): Promise<boolean> {
    if (sessionId === this.masterId || this.preparing.has(sessionId)) return false
    this.runtimeHealth.set({ state: 'ready', detail: `Router handover: ${title} started in the router directory`, at: now() })
    const moved = await (this.handingOver ??= this.handOverTo(sessionId).finally(() => { this.handingOver = undefined }))
    return moved.session === sessionId
  }
  private async handover(): Promise<{ previous: string; session: string }> {
    const previous = this.masterId
    const base = this.store.get(KV.runtime.routerBase) ?? previous
    const epoch = (this.store.get(KV.runtime.routerEpoch) ?? 0) + 1
    const session = `${base}-${epoch}`
    // A successor is created here, so its decoration must not take duty a second time as a Session made by a person.
    this.preparing.add(session)
    try {
      await this.sessions.ensure(session, this.machine.stateDir, 'dsh-superagent orchestrator', 'orchestrator')
    } finally { this.preparing.delete(session) }
    return this.handOverTo(session, epoch)
  }
  /** Moves router duty to `session`, which already exists, and briefs it; `epoch` names a successor of the recorded base. */
  private async handOverTo(session: string, epoch?: number): Promise<{ previous: string; session: string }> {
    const previous = this.masterId
    this.master = session
    this.store.set(KV.runtime.masterId, session)
    if (epoch !== undefined) this.store.set(KV.runtime.routerEpoch, epoch)
    const policy = settingsPolicy(this.store.settings(), this.sources)
    const text = handoverText({
      session, previous, at: now(), policyVersion: policy.version, paused: policy.paused,
      sources: this.sources.instances().filter(instance => instance.enabled).map(instance => {
        const entry = this.health[instance.kind]
        return { name: instance.kind, state: entry?.state ?? 'unknown', detail: entry?.detail ?? '' }
      }),
      tickets: this.store.tickets.open(),
      waiting: this.store.threads.active().flatMap(thread => thread.evaluating
        ? [{ thread: thread.key, strength: thread.evaluating.strength, since: thread.evaluating.startedAt, triggers: thread.evaluating.triggerIds.length }]
        : []),
      decisions: this.store.read.recentDecisions(0, 12),
    })
    await this.sessions.prompt(session, `handover:${session}`, text, 'queue')
    // The predecessor's undecided candidates belong to the successor: its Session never decided them.
    this.engine.redeliver()
    return { previous, session }
  }
  receive(trigger: Trigger): ReceiveResult { return this.passes.receive(trigger) }
  idle(): Promise<void> { return this.passes.idle() }
  pump(): Promise<void> { return this.passes.pump() }
  sendReplies(): Promise<void> { return this.outbox.sent() }
  private closing(): boolean { return this.closingFlag }
  /** Hold evaluation, dispatch, and outbound delivery while paused or awaiting setup; sources still record incoming triggers. */
  private paused(): boolean { return !this.setup.configured() || this.store.settings().paused }
  private async initialize(): Promise<void> {
    // Register management HTTP routes before setup completes so operators can fix setup problems in the UI.
    this.disposers.push(registerHttp(this.ctx, this.httpHost()))
    if (!await this.setup.run(this.store.settings())) {
      this.runtimeHealth.set({ ...health('paused', 'setupPending'), at: now() })
      return
    }
    this.sessions.install()
    this.executor.install()
    await this.sessions.ensure(this.masterId, this.machine.stateDir, 'dsh-superagent orchestrator', 'orchestrator')
    // The directory of a Ticket that ended while an earlier version ran left its own entry in DSH's Workspace list, and
    // the Session that ran there is still listed: retire them now, so an upgrade tidies the sidebar by itself.
    for (const ended of this.store.tickets.list()) {
      if (ended.ended && ended.execution?.directory) {
        void retire(this.ctx.workspaceRegistry, ended.execution.directory, [workerSessionId(ended.id)]).catch(() => {})
      }
    }
    // A working directory an operator gave a Ticket root of its own is a Workspace of DSH's list too, so both lists name
    // the same folders: register the ones DSH does not list yet. Missing directories are left for the operator to fix.
    for (const workspace of this.store.settings().workspaces) {
      if (workspace.directory) await adopt(this.ctx.workspaceRegistry, workspace.directory, workspace.name).catch(() => {})
    }
    for (const id of this.settings.syncable()) await this.settings.sync(id).catch(() => { /* sync() records its failure in health. */ })
    // If stop() was called while awaiting setup, session creation, or policy sync, do not start background loops.
    if (this.closing()) return
    this.executor.resume()
    this.passes.start()
    this.effects.start()
    this.runtimeHealth.set({ state: 'ready', detail: 'Orchestrator is ready', at: now() })
  }
  private httpHost(): HttpHost {
    const runtime = this
    const { store, sources, prompts, sessions, settings, engine, executor, health, machine, ready, sourceLinks, setup, passes } = this
    return { store, sources, prompts, sessions, settings, engine, executor, health, machine, get masterId() { return runtime.masterId }, ready, sourceLinks,
      router: { handOver: (reason: string) => runtime.handOver(reason) },
      workspaces: this.ctx.workspaceRegistry,
      get deployment() { return setup.deployment },
      get setupProblem() { return setup.problem }, get feishuProblem() { return setup.feishuProblem },
      configured: () => setup.configured(), links: () => runtime.links(), ticketEnvironment: ticket => runtime.ticketEnvironment(ticket),
      checkSetup: () => { setup.check() }, requestPass: () => { passes.request() }, models: () => this.ctx.sessionController.modelCatalog() }
  }
  /** Idempotent stop; concurrent or repeated calls share the same shutdown promise. */
  stop(): Promise<void> { return this.stopping ??= this.shutdown() }
  private async shutdown(): Promise<void> {
    this.closingFlag = true; const passes = this.passes.stop(); this.stopped.abort()
    try {
      this.assessor.stop()
      const ids = [this.masterId, ...this.store.tickets.list().map(ticket => workerSessionId(ticket.id))]
      const agents = ids.map(id => this.ctx.agents.get(id as SessionId)).filter((agent): agent is Agent => agent !== undefined)
      for (const agent of agents) agent.cancel({ kind: 'user' }, { keepInbox: true })
      await Promise.allSettled([passes, this.effects.drain(), ...agents.map(agent => agent.whenIdle())])
      // The workers' jobs and subagents stop too: their ends would start worker turns without the tool limits released below.
      await this.executor.shutdown()
      this.executor.dispose()
      this.sessions.dispose()
      for (const dispose of this.disposers.reverse()) dispose()
      await this.ctx.sessionPersistence.flush()
    } finally {
      // Close the database before releasing the directory lock so another process cannot open the database mid-write; a compromised lock may already be released.
      this.setup.restore()
      try { this.store.close() } finally {
        const unreleased = (error: unknown) => { this.ctx.logger.warn('dsh-superagent could not release its state directory lock: %s',
          String(error)) }
        await this.releaseLock?.().catch(unreleased)
      }
    }
  }
}

/** True while a process with this id is still running, which is why its lock must be left alone. */
function alive(pid: number): boolean {
  try { process.kill(pid, 0); return true } catch { return false }
}

/**
 * Removes the state directory lock of a process that is gone. The lock names its owner in `runtime.pid`, so a restart
 * after a crash or a killed process recovers immediately; a lock with no readable owner is removed only once it is older
 * than the moment `proper-lockfile` itself would steal it, `LOCK_STALE_MS`.
 */
function reclaimLock(stateDir: string): void {
  const lock = `${stateDir}.lock`
  try { if (!statSync(lock).isDirectory()) return } catch { return }
  let owner = 0
  try { owner = Number(readFileSync(join(stateDir, 'runtime.pid'), 'utf8')) } catch { owner = 0 }
  if (owner > 0 && alive(owner)) return
  if (owner <= 0 && Date.now() - statSync(lock).mtimeMs <= LOCK_STALE_MS) return
  rmSync(lock, { recursive: true, force: true })
}

/**
 * Moves a deployment configured before working directories existed onto them: the GitHub Source's repository becomes a
 * bound workspace keeping today's ticket root and prepare command, and the Source stops naming one, because the
 * repositories come from the workspaces from then on. Runs at every start, and does nothing once that is done.
 */
export function migrateWorkspaces(store: Pick<Store, 'blockRevision' | 'settings' | 'saveSettings'>): void {
  const settings = store.settings()
  const configured = settings.sources.github?.config as { repository?: unknown } | undefined
  const repository = typeof configured?.repository === 'string' ? configured.repository.trim() : ''
  if (!repository) return
  const name = repository.split('/').at(-1) ?? repository
  const bound = settings.workspaces.some(workspace => workspace.repository.toLowerCase() === repository.toLowerCase())
  const workspaces = bound ? settings.workspaces : [...settings.workspaces,
    { id: workspaceId(settings.workspaces, name), name, directory: '', repository, prepare: '', enabled: true }]
  const github = settings.sources.github
  const sources = github ? { ...settings.sources, github: { ...github, config: { ...github.config, repository: '' } } } : settings.sources
  store.saveSettings({ ...settings, workspaces, sources },
    { source: 'internal', block: 'workspaces', policyVersion: policyVersion(settings), policyChanged: false, notified: [] })
}

/**
 * Lets anyone who mentions the agent in a chat originate work: the `chat` row of the IM Source admits an unlisted sender
 * who addresses the agent as an explicit request. Runs at every start and writes once, so a Policy edited later wins.
 */
export function admitChats(store: Pick<Store, 'settings' | 'saveSettings'>): void {
  const settings = store.settings()
  const part = settings.policy.sources[CHAT]
  if (part?.admission?.[CHAT_ROW]?.unlistedAddressed) return
  const policy = {
    ...settings.policy,
    sources: {
      ...settings.policy.sources,
      [CHAT]: {
        ...part,
        allowed: part?.allowed ?? [],
        admission: { ...part?.admission, [CHAT_ROW]: { ...part?.admission?.[CHAT_ROW], unlistedAddressed: 'explicit' as const } },
      },
    },
  }
  store.saveSettings({ ...settings, policy },
    { source: 'internal', block: 'policy', policyVersion: policyVersion(settings), policyChanged: false, notified: [] })
}

/**
 * Adds every folder DSH already lists to the working directories, so a folder someone works in is one already and the
 * panel shows the same folders as DSH's sidebar. The roots Tickets run in are left out: each comes and goes with its own
 * Ticket. Runs at every start, and does nothing while DSH lists no new folder.
 */
export function includeWorkspaces(store: Pick<Store, 'settings' | 'saveSettings'>, registry: WorkspaceRegistry,
  machine: Pick<Machine, 'stateDir'>): void {
  const settings = store.settings()
  const root = executionRoot(settings, machine.stateDir)
  const workspaces = included(settings.workspaces, workspaceEntries(registry), path => within(root, path))
  if (!workspaces) return
  store.saveSettings({ ...settings, workspaces },
    { source: 'internal', block: 'workspaces', policyVersion: policyVersion(settings), policyChanged: false, notified: [] })
}

/** True when `path` is `parent` itself or a directory below it. */
function within(parent: string, path: string): boolean {
  if (!parent) return false
  const rest = relative(parent, path)
  return rest === '' || (!rest.startsWith('..') && !isAbsolute(rest))
}
