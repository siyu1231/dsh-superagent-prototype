/** The briefing a new router Session starts with: what the deployment holds, without reading its predecessor's log. */
import { latestReport, reasonText, ticketStage, type Decision, type Ticket } from '../core/index.ts'

/** How much of one ticket's title, report or decision reason a briefing keeps. */
const CLIP = 160
/** How many open tickets, waiting candidates and decisions a briefing lists. */
const LISTED = 20, DECISIONS = 12

const clip = (text: string | undefined, limit = CLIP): string => {
  const trimmed = (text ?? '').replace(/\s+/g, ' ').trim()
  return trimmed.length > limit ? `${trimmed.slice(0, limit - 1)}…` : trimmed
}

/** A candidate that waits for a decision, as the briefing names it. */
export interface Waiting {
  thread: string
  strength: string
  since: string
  triggers: number
}

/** What the briefing is built from; `Runtime` gathers it, so this stays a function of plain data. */
export interface Handover {
  /** The Session that took over, and the one that handed over. */
  session: string
  previous: string
  at: string
  policyVersion: string
  paused: boolean
  sources: readonly { name: string; state: string; detail: string }[]
  tickets: readonly Ticket[]
  waiting: readonly Waiting[]
  decisions: readonly Decision[]
}

/** How a ticket reads in the briefing: its id, title, stage, and where its worker works. */
function line(ticket: Ticket): string {
  const stage = ticketStage(ticket)
  const where = (ticket.mandate.basis.scope as { workspace?: string } | undefined)?.workspace
  const report = latestReport(ticket)
  const parts = [`\`${ticket.id}\``, `**${clip(ticket.title, 100)}**`, `— ${'action' in stage ? stage.action : stage.stage}`]
  if (where) parts.push(`in \`${where}\``)
  if (ticket.execution?.directory) parts.push(`at \`${ticket.execution.directory}\``)
  if (ticket.attention) parts.push(`· asks: ${clip(ticket.attention.question, 100)}`)
  if (report) parts.push(`· last report (${report.state}): ${clip(report.summary)}`)
  return `- ${parts.join(' ')}`
}

/**
 * Writes the briefing a successor router Session receives: the open tickets, the candidates still waiting for a decision,
 * the latest decisions, and the policy it works under. It holds no history of the predecessor's conversation, which is the
 * point of handing over: a new router starts from what the deployment holds, not from how the last one talked.
 */
export function handoverText(handover: Handover): string {
  const open = handover.tickets.filter(ticket => !ticket.ended)
  const listed = handover.decisions.slice(0, DECISIONS)
  const lines = [
    '# Router handover',
    '',
    `Session \`${handover.session}\` took over router duty at ${handover.at}. \`${handover.previous}\` is no longer on duty; its history stays readable, but nothing new reaches it.`,
    'Candidates, reports and notices arrive here as messages, as before. Nothing in the predecessor\'s Session needs reading.',
    '',
    `## Open tickets (${open.length})`,
    ...(open.length ? open.slice(0, LISTED).map(line) : ['None.']),
    ...(open.length > LISTED ? [`… and ${open.length - LISTED} more.`] : []),
    '',
    `## Waiting for a decision (${handover.waiting.length})`,
    ...(handover.waiting.length
      ? handover.waiting.slice(0, LISTED).map(waiting => `- \`${waiting.thread}\` — ${waiting.strength}, ${waiting.triggers} trigger(s), waiting since ${waiting.since}`)
      : ['None.']),
    '',
    `## Recent decisions (${listed.length})`,
    ...(listed.length ? listed.map(decision => `- ${decision.at} · ${decision.kind} · \`${decision.threadKey}\` — ${clip(reasonText(decision.reason))}`) : ['None.']),
    '',
    '## Policy',
    `${handover.policyVersion}${handover.paused ? ' · processing paused' : ''}`,
    '',
    '## Sources',
    ...(handover.sources.length
      ? handover.sources.map(source => `- ${source.name}: ${source.state}${source.detail ? ` — ${clip(source.detail)}` : ''}`)
      : ['None configured.']),
  ]
  return lines.join('\n')
}
