/** The shells, the PATH and the executables the tests start, which differ between POSIX and Windows. */
import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { basename, delimiter, dirname, join, resolve } from 'node:path'

export const WINDOWS = process.platform === 'win32'

let shell: string | undefined
/** The POSIX shell of Git for Windows, the only one a Windows test machine has; absent where `sh` is on PATH. */
export function posixShell(): string {
  if (shell !== undefined) return shell
  const execPath = execFileSync('git', ['--exec-path'], { encoding: 'utf8' }).trim()
  // `git --exec-path` names `<root>/mingw64/libexec/git-core`, next to `<root>/usr/bin/sh.exe`.
  const found = resolve(execPath, '..', '..', '..', 'usr', 'bin', 'sh.exe')
  if (!existsSync(found)) throw new Error(`Git for Windows installs a POSIX shell at ${found}, which is missing.`)
  return (shell = found)
}

/** The argv of a command run by a POSIX shell, which the tests use wherever they start one. */
export const shellCommand = (script: string): string[] => WINDOWS ? [posixShell(), '-c', script] : ['sh', '-c', script]

/** A PATH entry list for the platform, whose separator differs. */
export const pathList = (...entries: string[]): string => entries.join(delimiter)

/**
 * Writes a fake command whose body is a POSIX shell script, and returns the path that starts it: the script itself on
 * POSIX, and a `.cmd` wrapper that hands it to Git's shell on Windows, since Windows starts neither a shebang nor a
 * script without an extension.
 */
export function posixProgram(path: string, body: string): string {
  const script = WINDOWS ? `${path}.sh` : path
  mkdirSync(dirname(script), { recursive: true })
  writeFileSync(script, `#!/bin/sh\n${body}\n`)
  chmodSync(script, 0o755)
  if (!WINDOWS) return path
  const launcher = `${path}.cmd`
  // Git's shell finds `sleep`, `cat` and `touch` in its own directory, the way a POSIX system finds them in `/bin`.
  writeFileSync(launcher, `@echo off\r\nset "PATH=${dirname(posixShell())};%PATH%"\r\n"${posixShell()}" "%~dp0${basename(script)}" %*\r\nexit /b %ERRORLEVEL%\r\n`)
  return launcher
}

/** The file a command shim of the environment takes on this platform. */
export const shimName = (name: string): string => WINDOWS ? `${name}.cmd` : name

/** The path of a command shim in `directory`. */
export const shimPath = (directory: string, name: string): string => join(directory, shimName(name))
