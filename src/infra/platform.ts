/**
 * Platform differences: installing under Windows or a POSIX system changes how an absolute path is recognized, how a
 * command name resolves to an executable file, how that file is spawned, and which shell runs a ticket's prepare command.
 * Everything here keeps one behaviour on POSIX and adds a Windows branch; nothing in this module decides policy.
 */
import { accessSync, constants, realpathSync, statSync } from 'node:fs'
import { delimiter, isAbsolute, join, resolve } from 'node:path'

export const IS_WINDOWS = process.platform === 'win32'

/** Extensions Windows appends to a bare command name, in the order Windows itself tries them. */
const EXTENSIONS = (process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean).map(extension => extension.toLowerCase())

/** True when `value` is an absolute path on this platform (`C:\state`, `\\server\share`, `/var/lib`, `C:/state`). */
export function isAbsolutePath(value: string): boolean { return isAbsolute(value) }

/** A PATH entry without the surrounding quotes some installers write. */
export function unquote(value: string): string { return value.trim().replace(/^"(.*)"$/, '$1') }

/** True when the file name is a Windows batch file, which `CreateProcess` cannot start directly. */
function isBatch(program: string): boolean { return /\.(cmd|bat)$/i.test(program) }
const hasExtension = (name: string): boolean => EXTENSIONS.includes(`.${name.slice(name.lastIndexOf('.') + 1)}`.toLowerCase())

/** The file names a bare command name may refer to in one PATH directory, in the order Windows or POSIX tries them. */
function candidates(name: string, directory: string): string[] {
  const file = join(directory, name)
  if (!IS_WINDOWS || hasExtension(name)) return [file]
  return [file, ...EXTENSIONS.map(extension => `${file}${extension}`)]
}

/** One physical directory in its canonical spelling, so a PATH entry reached through a link matches the directory itself. */
function canonical(directory: string): string {
  const path = ((): string => { try { return realpathSync(directory) } catch { return resolve(directory) } })()
  return IS_WINDOWS ? path.toLowerCase() : path
}

/** True when both names are the same directory, which there is none of when no directory is to be avoided. */
const sameDirectory = (a: string, b?: string): boolean => b !== undefined && canonical(a) === canonical(b)

/**
 * Resolves a command name or absolute path to the executable file it names, skipping `exclude` on PATH.
 * A bare name resolves through PATH and, on Windows, through PATHEXT; a name that contains a separator must be absolute.
 * @throws when no candidate is a file, so callers can report setup problems.
 */
export function resolveExecutable(name: string, path: string, exclude?: string): string {
  const separator = name.includes('/') || (IS_WINDOWS && name.includes('\\'))
  if (separator && !isAbsolute(name)) throw new Error(`${name} must be a command name or an absolute path`)
  const directories = isAbsolute(name) ? [''] : path.split(delimiter).map(unquote).filter(directory => isAbsolute(directory))
  for (const directory of directories.filter(directory => !sameDirectory(directory, exclude))) {
    for (const candidate of candidates(name, directory)) {
      try { if (statSync(candidate).isFile()) { accessSync(candidate, constants.X_OK); return candidate } }
      catch { /* Not an executable file here; try the next candidate. */ }
    }
  }
  throw new Error(`${name} is not an executable file${isAbsolute(name) ? '' : ' on PATH'}`)
}

/** Quotes one argument for `cmd.exe`, which doubles an embedded quote. */
export const cmdQuote = (value: string): string => `"${value.replaceAll('"', '""')}"`

/** Escapes text for a batch file's `echo`, where `%` expands a variable and `^&|<>` would otherwise change the command. */
export const cmdText = (value: string): string => value.replace(/[%^&|<>]/g, character => character === '%' ? '%%' : `^${character}`)

/** The characters `cmd.exe` reads as syntax rather than text, and so has to be told are literal with a leading `^`. */
const METACHARACTERS = /[&|<>^()%]/g
const escapeMeta = (value: string): string => value.replace(METACHARACTERS, '^$&')
/**
 * One argument as `cmd.exe` must see it. `cmd.exe` re-parses the line when it starts a batch file, so an argument it does
 * not quote — one with no whitespace, which is passed through exactly as written — needs its escapes escaped as well.
 */
const cmdArgument = (value: string): string => /\s/.test(value) ? escapeMeta(value) : escapeMeta(escapeMeta(value))

/**
 * The argv that starts `program` with `args`. Windows cannot start a `.cmd` or `.bat` file through `CreateProcess`, so those
 * run through `cmd.exe`; every other program, and every POSIX system, is spawned as given.
 *
 * The command line after `/c` must not begin with a quote, because `cmd.exe` then strips that quote and the last one on
 * the line: the batch file is started as its own bare word, or behind an `if exist` guard when its path holds a space.
 */
export function invocation(program: string, args: readonly string[]): string[] {
  if (!IS_WINDOWS || !isBatch(program)) return [program, ...args]
  const start = /\s/.test(program) ? ['if', 'exist', program, program] : [program]
  return [process.env.ComSpec ?? 'cmd.exe', '/d', '/c', ...start, ...args.map(cmdArgument)]
}

/** Windows PowerShell, or PowerShell 7 where it is installed; a prepare command and the worker shell both use it. */
let shell: string | undefined
export function windowsShell(path = process.env.PATH ?? ''): string {
  if (shell) return shell
  try { shell = resolveExecutable('pwsh', path) } catch { shell = 'powershell.exe' }
  return shell
}

/** The argv that runs `command` as a shell script: `sh -c` on POSIX, PowerShell on Windows. */
export function shellInvocation(command: string, path = process.env.PATH ?? ''): string[] {
  if (!IS_WINDOWS) return ['sh', '-c', command]
  return [windowsShell(path), '-NoProfile', '-NonInteractive', '-Command', command]
}
