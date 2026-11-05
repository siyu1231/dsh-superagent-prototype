/**
 * The Conversation view list lives in the host's ui-conversation package, which this plugin does not depend on, so
 * its slot is absent from the installed typings. Declaring it here types the 跟踪 view registration in
 * `src/client/index.tsx` against the runtime contract: a `list` slot of `session` scope (one entry per Session, the
 * header renders the entries as tabs beside 对话 and 轨迹) whose owner share is the header's own view controls — this
 * view uses none of them and only reads the Session identity the scope provides.
 */
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'conversation.view': {
      kind: 'list'
      scope: 'session'
      owner: Record<string, never>
    }
  }
}

export {}
