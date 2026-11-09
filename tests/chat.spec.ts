import { describe, expect, it } from 'vitest'
import { chatThread, chatTrigger, type Conversation } from '../src/app/chat.ts'

const chat: Conversation = { conversationKey: 'group:oc_1', senderId: 'ou_1', addressed: 'mention', title: '超代理' }
const at = '2026-11-09T06:00:00.000Z'

describe('a message written in a chat', () => {
  it('becomes a Trigger with the chat as its Thread, the writer as its actor, and the text as asked', () => {
    expect(chatTrigger(chat, '  README 的 typo 改一下  ', at, 'session-1', 3)).toEqual({
      id: 'im:group:oc_1:session-1:3',
      source: 'im',
      threads: [{ source: 'im', id: 'group:oc_1' }],
      actor: { source: 'im', id: 'ou_1' },
      human: true,
      addressed: 'mention',
      at,
      text: 'README 的 typo 改一下',
      meta: { conversation: 'group:oc_1', session: 'session-1', turn: 3, title: '超代理' },
    })
    expect(chatThread('group:oc_1')).toEqual({ source: 'im', id: 'group:oc_1' })
  })

  it('records nothing for a message with no text, so an attachment-only turn is not a request', () => {
    expect(chatTrigger(chat, '   \n ', at, 'session-1', 1)).toBeUndefined()
  })

  it('names the same message the same way, so a replayed transcript does not queue it twice', () => {
    expect(chatTrigger(chat, 'hi', at, 'session-1', 4)?.id).toBe(chatTrigger(chat, 'hi', at, 'session-1', 4)?.id)
    expect(chatTrigger(chat, 'hi', at, 'session-1', 4)?.id).not.toBe(chatTrigger(chat, 'hi', at, 'session-1', 5)?.id)
  })

  it('leaves out the address of a direct message, which has no mention to describe', () => {
    const direct = chatTrigger({ conversationKey: 'dm:ou_1', senderId: 'ou_1' }, '帮我看看这个', at, 'session-1', 1)
    expect(direct).toMatchObject({ source: 'im', text: '帮我看看这个' })
    expect(direct && 'addressed' in direct).toBe(false)
    expect(direct?.actor).toEqual({ source: 'im', id: 'ou_1' })
  })

  it('records nothing for the harness bookkeeping that arrives as a user message', () => {
    for (const text of ['Time sampled while preparing turn 5, step 1: 2026-11-09T08:19:36+08:00[Asia/Shanghai]', 'Current runtime context.', '<hindsight_knowledge>x</hindsight_knowledge>', '<dsh_im_reply_to>{"note":"q"}</dsh_im_reply_to>']) {
      expect(chatTrigger(chat, text, at, 'session-1', 1)).toBeUndefined()
    }
  })
})
