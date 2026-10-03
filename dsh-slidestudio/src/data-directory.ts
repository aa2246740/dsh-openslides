import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'

/** Persist the workspace outside the versioned package. A linked checkout keeps
 * its existing projects in place; later registry installs reuse that location.
 */
export function resolveDataDirectory(productRoot: string, home: string, override?: string): string {
  const stateRoot = join(home, 'data', 'dsh-slidestudio')
  const pointer = join(stateRoot, 'workspace.json')
  let root = override?.trim() || undefined
  if (root && !isAbsolute(root)) throw new Error('SLIDESTUDIO_DATA_DIR must be an absolute path')
  if (!root && existsSync(pointer)) {
    const saved = JSON.parse(readFileSync(pointer, 'utf8')) as { root?: unknown }
    if (typeof saved.root !== 'string' || !isAbsolute(saved.root)) throw new Error(`Invalid SlideStudio workspace: ${pointer}`)
    root = saved.root
    if (!existsSync(root)) throw new Error(`SlideStudio workspace is missing: ${root}. Restore it or set SLIDESTUDIO_DATA_DIR.`)
  }
  root ??= existsSync(join(productRoot, 'output', 'dsh-slices'))
    ? productRoot
    : join(stateRoot, 'workspace')
  root = resolve(root)
  mkdirSync(root, { recursive: true })
  mkdirSync(stateRoot, { recursive: true })
  writeFileSync(pointer, `${JSON.stringify({ version: 1, root }, null, 2)}\n`, { mode: 0o600 })
  return root
}
