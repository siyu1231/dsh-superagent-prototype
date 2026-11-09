import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { isoTime } from '../core/model.ts'
import type { ThreadRef, Trigger } from '../core/model.ts'

/**
 * A chat that the IM bridge has bound to a Session. Only the fields the orchestrator reads are named; the bridge may
 * describe more, and none of it is trusted beyond an identity and a sender.
 */
export interface Conversation {
  /** Stable identity of the chat: a group's id, or a direct message's pair of open ids. */
  conversationKey: string
  /** The person who wrote the message, in the chat's own namespace. */
  senderId?: string
  /** How the message reached the agent: a mention in a group, or a direct message. */
  addressed?: 'mention' | 'direct'
  /** The chat's display name, for logs and candidate cards. */
  title?: string
}

/** The one thread a chat message belongs to: the chat itself, not the topic inside it. */
export const chatThread = (conversationKey: string): ThreadRef => ({ source: 'im', id: conversationKey })

/**
 * Whether a message is the harness's own bookkeeping rather than something a person wrote: the runtime context, the
 * compression notes, a skill reminder, or the bridge's reply quoting. DSH delivers those as user messages too, and they
 * are not requests.
 */
export const scaffolding = (text: string): boolean =>
  /^(\[Compressed conversation section|Current runtime context|Current working directory|Time sampled while preparing|Browser time zone|A skill is a reusable set|<system-reminder>|<acp |Current DSH file policy|Approval prompts are disabled|<hindsight_|<dsh_im_reply_to>)/.test(text.trimStart())

/**
 * The Trigger a message written in a chat becomes. A chat message is a request like any other: it carries an actor, an
 * address and a place, so it can be deduplicated, filtered by the admission rules, and remembered as a Decision — the
 * conversation only decides how it is answered.
 *
 * The turn, together with the Session, keeps one message from being recorded twice when a transcript is replayed.
 */
export function chatTrigger(
  conversation: Conversation,
  text: string,
  at: string,
  session: string,
  turn: number,
): Trigger | undefined {
  const body = text.trim()
  if (!body || scaffolding(body)) return undefined
  return {
    id: 'im:' + conversation.conversationKey + ':' + session + ':' + turn,
    source: 'im',
    threads: [chatThread(conversation.conversationKey)],
    actor: { source: 'im', id: conversation.senderId ?? 'unknown' },
    human: true,
    ...(conversation.addressed ? { addressed: conversation.addressed } : {}),
    at: isoTime(at),
    text: body,
    meta: {
      conversation: conversation.conversationKey,
      session,
      turn,
      ...(conversation.title ? { title: conversation.title } : {}),
    },
  }
}

/**
 * The chats the IM bridge has already bound to Sessions, read from its own records (state.json under each bot).
 * A binding is announced when it is made, so after a restart the announcements are gone while the Sessions stay: this
 * recovers them. A topic key looks like group:chat:managed:topic; the chat is everything before the managed part.
 */
export function storedChats(home: string): Map<string, Conversation> {
  const chats = new Map<string, Conversation>()
  const root = join(home, 'integrations')
  let bridges: string[] = []
  try { bridges = readdirSync(root) } catch { return chats }
  for (const bridge of bridges) {
    const bots = join(root, bridge, 'bots')
    let ids: string[] = []
    try { ids = readdirSync(bots) } catch { continue }
    for (const bot of ids) {
      let state: { sessions?: Record<string, string> } = {}
      try { state = JSON.parse(readFileSync(join(bots, bot, 'state.json'), 'utf8')) } catch { continue }
      for (const [topic, session] of Object.entries(state.sessions ?? {})) {
        if (typeof session !== 'string' || !session) continue
        const conversationKey = topic.split(':managed:')[0] ?? topic
        const kind = conversationKey.split(':')[0]
        chats.set(session, { conversationKey, addressed: kind === 'dm' || kind === 'direct' ? 'direct' : 'mention' })
      }
    }
  }
  return chats
}
