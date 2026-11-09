/**
 * The IM Source: a chat message the bridge relays into a Session, recorded as a Trigger.
 *
 * The bridge (dsh-im) hands over the text and the chat, not the sender, so this Source keeps no list of people: anyone
 * who mentions the agent in a chat may originate work there. That is what the `chat` row's `unlistedAddressed` cell says,
 * and `admitChats` writes it into the Policy the first time the Source is used.
 */
import { z } from 'zod'
import type { SourceKind } from './kind.ts'

export const SOURCE = 'im'

/** The one admission row of this Source: every chat the bridge relays. */
export const ROW = 'chat'

export const imKind: SourceKind<Record<string, never>> = {
  kind: SOURCE,
  title: { zh: 'IM 聊天（dsh-im）', en: 'IM chat (dsh-im)' },
  description: {
    zh: '桥（dsh-im）把群里 @ 智能体的消息转成一次请求。谁 @ 都算，发送者身份由桥决定要不要给；没有 @ 的消息不会被转发过来。',
    en: 'The bridge (dsh-im) turns a message that mentions the agent in a chat into a request. Anyone may mention it; the bridge decides whether to name the sender. Messages that do not mention the agent are not relayed.',
  },
  schema: z.object({}).strict(),
  fields: [],
  health: [],
  // Nothing to filter: the bridge only relays what already addresses the agent.
  scope: () => ({ listened: true, observed: false, row: ROW }),
  policy: {
    schema: z.object({ allowed: z.array(z.object({ id: z.string().regex(/^[A-Za-z0-9-]+$/), name: z.string().optional() }).strict()).default([]) }).strict(),
    fields: [{
      key: 'allowed', type: 'rows', label: { zh: '能发起工作的 IM 成员', en: 'IM members who may originate work' },
      hint: {
        zh: '留空表示群里任何人 @ 智能体都能发起工作（推荐）；填了名单就只有名单里的人能。桥不给发送者身份时，名单无法生效。',
        en: 'Leave it empty to let anyone in a chat who mentions the agent originate work (recommended); with entries, only those people can. A list cannot apply while the bridge does not name the sender.',
      },
      columns: [{ key: 'id', type: 'text', label: { zh: '成员', en: 'Member' }, pattern: '[A-Za-z0-9\\-]+' }],
    }],
    explicit: { zh: '在群里 @ 智能体', en: 'mentioning the agent in a chat' },
    unnamed: { person: { zh: '群成员', en: 'Chat participant' }, bot: { zh: '机器人', en: 'Bot' } },
    rows: () => [{
      id: ROW,
      label: { zh: 'IM 聊天', en: 'IM chats' },
      note: {
        zh: '桥转过来的消息都是 @ 智能体的，所以用第一列（未列成员、点名智能体）。默认这一列是“明确请求”。',
        en: 'Every relayed message addresses the agent, so this row uses the first cell (unlisted sender, addressed). It admits explicit requests by default.',
      },
      cells: { listedUnaddressed: false, unlistedAddressed: true, unlistedUnaddressed: false },
    }],
  },
}
