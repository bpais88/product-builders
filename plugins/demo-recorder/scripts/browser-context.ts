import { execSync } from 'node:child_process'
import type { BrowserContext } from './types.js'

export function runBrowser(cmd: string, strict = false): string {
  try {
    return execSync(`agent-browser ${cmd}`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 30_000,
    }).trim()
  } catch (err: any) {
    if (strict) throw err
    const stderr = err.stderr?.toString() ?? ''
    const msg = (stderr || err.message || '').slice(0, 200)
    console.error(`  ⚠️  agent-browser ${cmd.slice(0, 40)}... failed: ${msg}`)
    return ''
  }
}

function escapeShell(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`')
}

export function createBrowserContext(): BrowserContext {
  return {
    open: (url) => void runBrowser(`open "${escapeShell(url)}"`),
    eval: (js) => runBrowser(`eval "${escapeShell(js)}"`),
    snapshot: () => runBrowser('snapshot -i'),
    click: (ref) => void runBrowser(`click ${ref}`),
    fill: (ref, value) => void runBrowser(`fill ${ref} "${escapeShell(value)}"`),
    type: (ref, value) => void runBrowser(`type ${ref} "${escapeShell(value)}"`),
    press: (key) => void runBrowser(`press ${escapeShell(key)}`),
    wait: (msOrUrl) => {
      if (typeof msOrUrl === 'number') void runBrowser(`wait ${msOrUrl}`)
      else void runBrowser(`wait --url "${escapeShell(msOrUrl)}"`)
    },
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  }
}

export { escapeShell }
