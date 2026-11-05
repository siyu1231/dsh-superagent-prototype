/**
 * One Session's conversation, read back from the log DSH wrote for it: what was asked, what the worker said, and the
 * tools it ran. DSH keeps a Session's log as a run of independently compressed zstd frames, so each frame is
 * decompressed on its own; `node:zlib` stops at the first frame of a file.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'

/** One thing a person reads in a conversation: a request, an answer, a passage of reasoning, or a tool the worker ran. */
export interface HistoryEntry {
  kind: 'asked' | 'said' | 'thought' | 'tool'
  /** ISO time of the event, empty when the log did not record one. */
  at: string
  /** The words, already reduced to what a person reads; empty for a tool. */
  text: string
  tool?: { name: string; arguments: string; result?: string }
}
/** A whole conversation, oldest first, capped so one request cannot grow without bound. */
export interface SessionHistoryView { session: string; entries: HistoryEntry[] }

const FRAME = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])
const ENTRIES = 300, TEXT = 12_000, ARGUMENTS = 400, RESULT = 4_000

/** Where DSH keeps sessions: `$DSH_HOME` when the launcher set it, else the user's `~/.dsh`. */
export function dshHome(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.DSH_HOME?.trim()
  return configured && configured.length > 0 ? configured : join(homedir(), '.dsh')
}
/** The log file of one Session: DSH files logs under an encoding of their working directory. */
export function logFile(home: string, session: string): string | undefined {
  const root = join(home, 'sessions')
  if (!existsSync(root)) return undefined
  for (const folder of readdirSync(root)) {
    const file = join(root, folder, session, 'session.v4.jsonl.zstd')
    if (existsSync(file)) return file
  }
  return undefined
}
/**
 * Every frame of a log decompressed in order. A frame's payload may contain the magic bytes by chance, so a slice that
 * does not decompress is widened to the next magic instead of being dropped.
 */
export function frames(buffer: Buffer): string[] {
  const starts: number[] = []
  for (let at = buffer.indexOf(FRAME); at >= 0; at = buffer.indexOf(FRAME, at + FRAME.length)) starts.push(at)
  const text: string[] = []
  let index = 0
  while (index < starts.length) {
    let read = false
    for (let span = 1; span <= 3 && index + span <= starts.length; span += 1) {
      const from = starts[index]!
      const to = index + span < starts.length ? starts[index + span]! : buffer.length
      try {
        text.push(zstdDecompressSync(buffer.subarray(from, to)).toString('utf8'))
        index += span
        read = true
        break
      } catch { /* not a frame boundary after all */ }
    }
    if (!read) index += 1
  }
  return text
}

function clip(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit)}…` : text
}
/** The text parts of a message's content, in order; reasoning and tool calls are dropped. */
function textOf(content: unknown): string {
  if (typeof content === 'string') return content.trim()
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const part of content) {
    if (!part || typeof part !== 'object') continue
    const { type, text } = part as { type?: unknown; text?: unknown }
    if (type === 'text' && typeof text === 'string') parts.push(text)
  }
  return parts.join('\n').trim()
}
/** The reasoning parts of a message's content, joined; these are the thoughts a conversation keeps folded away. */
function reasoningOf(content: unknown): string {
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const part of content) {
    if (!part || typeof part !== 'object') continue
    const { type, text } = part as { type?: unknown; text?: unknown }
    if (type === 'reasoning' && typeof text === 'string') parts.push(text)
  }
  return parts.join('\n').trim()
}

/** The bookkeeping a worker's host writes into its inbox: runtime snapshots, skill reminders and clocks, not what a person asked. */
const SCAFFOLD = /^(\[Compressed conversation section|Current runtime context|Current working directory|Time sampled while preparing|Browser time zone|A skill is a reusable set|<system-reminder>|<acp |Current DSH file policy|Approval prompts are disabled)/

/** True for the messages the host adds around a request, which read as noise in a transcript. */
function scaffold(text: string): boolean {
  return SCAFFOLD.test(text)
}

/** The first message of a worker is the Ticket envelope as JSON; its title and assignment read better than the JSON. */
function askedOf(text: string): string {
  if (!text.startsWith('{')) return text
  try {
    const value: unknown = JSON.parse(text)
    if (!value || typeof value !== 'object' || Array.isArray(value)) return text
    const ticket = value as { title?: unknown; assignment?: unknown; scope?: unknown }
    const title = typeof ticket.title === 'string' ? ticket.title : ''
    if (title.length === 0) return text
    const detail = typeof ticket.assignment === 'string' ? ticket.assignment
      : typeof ticket.scope === 'string' ? ticket.scope : ''
    return detail.length > 0 ? `**${title}**\n\n${detail}` : `**${title}**`
  } catch { return text }
}

/** One Session's conversation, or `undefined` when DSH kept no log for it. */
export function historyView(session: string, home = dshHome()): SessionHistoryView | undefined {
  const file = logFile(home, session)
  if (!file) return undefined
  const entries: HistoryEntry[] = []
  const calls = new Map<string, HistoryEntry>()
  const events: { type?: string; time?: number; data?: Record<string, unknown> }[] = []
  for (const part of frames(readFileSync(file))) {
    for (const line of part.split('\n')) {
      if (line.trim().length === 0) continue
      try { events.push(JSON.parse(line) as never) } catch { /* a torn tail of a frame */ }
    }
  }
  for (const event of events) {
    const data = event.data ?? {}
    const at = typeof event.time === 'number' ? new Date(event.time).toISOString() : ''
    if (event.type === 'user/message') {
      const text = textOf(data.content)
      if (text.length > 0 && !scaffold(text)) entries.push({ kind: 'asked', at, text: clip(askedOf(text), TEXT) })
    } else if (event.type === 'assistant/message') {
      const message = data.message as { content?: unknown } | undefined
      const thought = reasoningOf(message?.content)
      if (thought.length > 0) entries.push({ kind: 'thought', at, text: clip(thought, TEXT) })
      const text = textOf(message?.content)
      if (text.length > 0) entries.push({ kind: 'said', at, text: clip(text, TEXT) })
    } else if (event.type === 'tool/call') {
      const entry: HistoryEntry = { kind: 'tool', at, text: '',
        tool: { name: String(data.name ?? 'tool'), arguments: clip(String(data.arguments ?? ''), ARGUMENTS) } }
      calls.set(String(data.callId), entry)
      entries.push(entry)
    } else if (event.type === 'tool/result') {
      const message = data.message as { toolCallId?: unknown } | undefined
      const entry = calls.get(String(data.toolCallId ?? message?.toolCallId))
      if (entry?.tool) entry.tool.result = clip(textOf(data.content), RESULT)
    }
  }
  return { session, entries: entries.slice(-ENTRIES) }
}
