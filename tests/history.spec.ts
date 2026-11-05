// Reading one Session's conversation back from the log DSH wrote, which stores a run of independent zstd frames.
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zstdCompressSync } from 'node:zlib'
import { afterEach, expect, it } from 'vitest'
import { dshHome, frames, historyView, logFile } from '../src/app/views/history.ts'

const made: string[] = []
afterEach(() => { for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true }) })

/** A DSH home holding one Session log, written the way DSH writes it: one frame per event. */
function home(session: string, events: unknown[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-history-'))
  made.push(dir)
  const folder = join(dir, 'sessions', '--C-work--', session)
  mkdirSync(folder, { recursive: true })
  const frames = events.map(event => zstdCompressSync(Buffer.from(`${JSON.stringify(event)}\n`)))
  writeFileSync(join(folder, 'session.v4.jsonl.zstd'), Buffer.concat(frames))
  return dir
}
const asked = (text: string, time = 1_700_000_000_000) => ({ type: 'user/message', time, data: { role: 'user', content: [{ type: 'text', text }] } })
const said = (text: string, time = 1_700_000_001_000) => ({ type: 'assistant/message', time,
  data: { message: { role: 'assistant', content: [{ type: 'reasoning', text: 'thinking' }, { type: 'text', text }] } } })
const called = (callId: string, name: string, args: string) => ({ type: 'tool/call', time: 1_700_000_002_000, data: { callId, name, arguments: args } })
const result = (callId: string, text: string) => ({ type: 'tool/result', time: 1_700_000_003_000,
  data: { toolCallId: callId, content: [{ type: 'text', text }] } })

it('reads the Session header DSH always writes, so the home can be found', () => {
  const dir = home('worker-t1', [{ type: 'session', id: 'worker-t1', cwd: 'C:\\work' }])
  expect(dshHome({ DSH_HOME: dir } as NodeJS.ProcessEnv)).toBe(dir)
  expect(logFile(dir, 'worker-t1')).toBe(join(dir, 'sessions', '--C-work--', 'worker-t1', 'session.v4.jsonl.zstd'))
  expect(logFile(dir, 'worker-missing')).toBeUndefined()
})

it('decompresses every frame of a log, not only the first', () => {
  const dir = home('worker-t1', [{ type: 'session' }, { type: 'session/title' }, { type: 'session/title' }])
  const text = frames(readFileSync(logFile(dir, 'worker-t1')!)).join('')
  expect(text.split('\n').filter(Boolean)).toHaveLength(3)
})

it('turns the events into the requests, answers and tools a person reads', () => {
  const dir = home('worker-t1', [{ type: 'session' }, asked('**Fix the typo**\n\nCorrect "recieve".'), said('Fixed it.'),
    called('call-1', 'pwsh', '{"command":"git status"}'), result('call-1', 'clean'), { type: 'turn/start' }])
  expect(historyView('worker-t1', dir)).toEqual({ session: 'worker-t1', entries: [
    { kind: 'asked', at: new Date(1_700_000_000_000).toISOString(), text: '**Fix the typo**\n\nCorrect "recieve".' },
    { kind: 'said', at: new Date(1_700_000_001_000).toISOString(), text: 'Fixed it.' },
    { kind: 'tool', at: new Date(1_700_000_002_000).toISOString(), text: '',
      tool: { name: 'pwsh', arguments: '{"command":"git status"}', result: 'clean' } },
  ] })
})

it('reads the Ticket envelope a worker opens with as its title and assignment', () => {
  const envelope = JSON.stringify({ ticket_id: 't1', title: 'Change "repositary" to "repository"', assignment: 'Fix the README.' })
  expect(historyView('worker-t1', home('worker-t1', [asked(envelope)]))?.entries[0]?.text)
    .toBe('**Change "repositary" to "repository"**\n\nFix the README.')
})

it('leaves out a tool result for a call it never saw, and keeps the result out when none came', () => {
  const dir = home('worker-t1', [called('call-1', 'read', '{"path":"a"}'), result('call-2', 'orphan')])
  expect(historyView('worker-t1', dir)?.entries).toEqual([{ kind: 'tool', at: new Date(1_700_000_002_000).toISOString(), text: '',
    tool: { name: 'read', arguments: '{"path":"a"}' } }])
})

it('answers nothing for a Session whose log is not on disk', () => {
  expect(historyView('worker-t1', home('worker-other', [asked('hi')]))).toBeUndefined()
})
