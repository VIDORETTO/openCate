import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { promises as fs } from 'fs'
import path from 'path'
import { tmpdir } from 'os'

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }))
vi.mock('./logger', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))
vi.mock('./cateGitignore', () => ({
  ensureCateGitignore: vi.fn(async () => {}),
  CATE_GITIGNORE_CONTENT: '*\n!.gitignore\n!workspace.json\n',
}))

const hostFiles = vi.hoisted(() => new Map<string, string>())
vi.mock('./runtime/runtimeManager', () => ({
  runtimes: {
    resolve: () => ({
      file: {
        async readFile(filePath: string): Promise<string> {
          const value = hostFiles.get(filePath)
          if (value === undefined) throw new Error(`ENOENT: ${filePath}`)
          return value
        },
        async writeFile(filePath: string, content: string): Promise<void> {
          hostFiles.set(filePath, content)
        },
        async stat(filePath: string): Promise<{ isDirectory: boolean; isFile: boolean }> {
          if (!hostFiles.has(filePath)) throw new Error(`ENOENT: ${filePath}`)
          return { isDirectory: false, isFile: true }
        },
      },
    }),
  },
}))

import { loadAgentAudit, saveAgentAudit } from './projectAgentAuditStore'
import type { AgentAuditEvent } from '../shared/agentAudit'

let root: string

const event: AgentAuditEvent = {
  id: 'audit-1',
  timestamp: 1,
  kind: 'prompt',
  outcome: 'sent',
  actorKind: 'human',
  actorId: 'local-user',
  origin: 'direct-chat',
  targetPanelId: 'agent-panel',
  contentChars: 12,
}

const legacyAgentAuditJson = `{
  "version": 1,
  "events": [
    {
      "id": "legacy-audit",
      "timestamp": 1,
      "kind": "prompt",
      "outcome": "sent",
      "actorKind": "human",
      "origin": "direct-chat",
      "targetPanelId": "agent-panel",
      "contentChars": 12
    }
  ]
}
`

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(tmpdir(), 'cate-agent-audit-'))
  hostFiles.clear()
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

describe('projectAgentAuditStore', () => {
  it('loads a literal version-1 file without rewriting optional fields', async () => {
    const file = path.join(root, '.cate', 'agent-audit.json')
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, legacyAgentAuditJson, 'utf8')

    await expect(loadAgentAudit(root)).resolves.toEqual([{
      id: 'legacy-audit',
      timestamp: 1,
      kind: 'prompt',
      outcome: 'sent',
      actorKind: 'human',
      origin: 'direct-chat',
      targetPanelId: 'agent-panel',
      contentChars: 12,
    }])
    await expect(fs.readFile(file, 'utf8')).resolves.toBe(legacyAgentAuditJson)
  })

  it('round-trips local bounded provenance', async () => {
    await saveAgentAudit(root, [event])
    expect(await loadAgentAudit(root)).toEqual([event])
    const raw = await fs.readFile(path.join(root, '.cate', 'agent-audit.json'), 'utf8')
    expect(JSON.parse(raw)).toEqual({ version: 1, events: [event] })
  })

  it('retains valid events and quarantines malformed JSON', async () => {
    await fs.mkdir(path.join(root, '.cate'), { recursive: true })
    await fs.writeFile(
      path.join(root, '.cate', 'agent-audit.json'),
      JSON.stringify({ version: 1, events: [event, { ...event, id: '', targetPanelId: '' }] }),
      'utf8',
    )
    expect(await loadAgentAudit(root)).toEqual([event])

    await fs.writeFile(path.join(root, '.cate', 'agent-audit.json'), '{ not json', 'utf8')
    expect(await loadAgentAudit(root)).toEqual([])
    const files = await fs.readdir(path.join(root, '.cate'))
    expect(files.some((file) => file.startsWith('agent-audit.json.corrupt-'))).toBe(true)
  })
})

describe('projectAgentAuditStore — remote roots', () => {
  const remoteRoot = 'cate-runtime://srv_abc/home/dev/project'
  const file = '/home/dev/project/.cate/agent-audit.json'
  const gitignore = '/home/dev/project/.cate/.gitignore'

  it('round-trips through the runtime and preserves a custom gitignore', async () => {
    await saveAgentAudit(remoteRoot, [event])
    expect(JSON.parse(hostFiles.get(file)!)).toEqual({ version: 1, events: [event] })
    expect(hostFiles.has(gitignore)).toBe(true)
    expect(await loadAgentAudit(remoteRoot)).toEqual([event])

    hostFiles.set(gitignore, 'custom')
    await saveAgentAudit(remoteRoot, [event])
    expect(hostFiles.get(gitignore)).toBe('custom')
  })
})
