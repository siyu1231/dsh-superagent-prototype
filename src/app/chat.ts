import { isoTime } from '../core/model.ts'
import type { ThreadRef, Trigger } from '../core/model.ts'

/**
 * A chat that dsh-im has bound to a Session. Only the fields the orchestrator reads are named; the
 * bridge may describe more, and none of it is trusted beyond an identity and a sender.
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
 * The Trigger a message written in a chat becomes. A chat message is a request like any other: it
 * carries an actor, an address and a place, so it can be deduplicated by its turn, filtered by the
 * admission rules, and remembered as a Decision — the conversation only decides how it is answered.
 *
 * `turn` is the Session's turn number, which the bridge increments per message; together with the
 * Session it keeps one message from being recorded twice when a transcript is replayed.
 */
export function chatTrigger(
  conversation: Conversation,
  text: string,
  at: string,
  session: string,
  turn: number,
): Trigger | undefined {
  const body = text.trim()
  if (!body) return undefined
  return {
    id: `im:${conversation.conversationKey}:${session}:${turn}`,
    source: 'im',
    threads: [chatThread(conversation.conversationKey)],
    actor: { source: 'im', id: conversation.senderId ?? 'unknown' },
    human: true,
    ...(conversation.addressed ? { addressed: conversation.addressed } : {}),
    at: isoTime(at),
    text: body,
    meta: { conversation: conversation.conversationKey, session, turn, ...(conversation.title ? { title: conversation.title } : {}) },
  }
}
