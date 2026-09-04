import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Chat } from '../../shared/types'
import { useCodingStore } from './codingStore'
import { useAgentAuditStore } from '../../renderer/stores/agentAuditStore'
import {
  directAgentKey,
  disposeDirectChatSession,
  promptDirectChat,
} from './directChatSession'

const chat: Chat = {
  id: 'chat-1',
  title: 'New chat',
  createdAt: 1,
  updatedAt: 1,
  model: { provider: 'test-provider', model: 'test-model' },
}

beforeEach(() => {
  vi.clearAllMocks()
  useCodingStore.setState({ panels: {} })
  useAgentAuditStore.setState({ eventsByRoot: {}, loadedRoots: {}, revisions: {} })
  ;(globalThis as unknown as { window: unknown }).window = {
    electronAPI: {
      agentCreate: vi.fn(async () => ({ ok: true })),
      agentPrompt: vi.fn(async () => {}),
      agentDispose: vi.fn(async () => {}),
    },
  }
})

describe('promptDirectChat', () => {
  it('appends a new chat’s first message before asynchronous session startup', async () => {
    const sending = promptDirectChat(chat, 'workspace-1', '/repo', 'First message')
    const agentKey = directAgentKey(chat.id)

    expect(useCodingStore.getState().panels[agentKey]?.messages).toMatchObject([
      { type: 'user', text: 'First message' },
    ])
    await expect(sending).resolves.toBe(true)
  })

  it('enables a prompt mode with its selected extension configuration', async () => {
    await promptDirectChat(
      chat,
      'workspace-1',
      '/repo',
      'Inspect this canvas',
      { promptMode: 'canvas', promptModeCommand: '/canvas inspect' },
    )

    expect(window.electronAPI.agentPrompt).toHaveBeenNthCalledWith(
      1,
      directAgentKey(chat.id),
      '/canvas inspect',
      undefined,
    )
  })

  it('records the direct-chat actor and target without storing message content', async () => {
    await promptDirectChat(chat, 'workspace-1', '/repo', 'Inspect this canvas')

    await vi.waitFor(() => {
      expect(useAgentAuditStore.getState().getEvents('/repo')).toEqual([
        expect.objectContaining({
          kind: 'prompt',
          outcome: 'sent',
          actorKind: 'human',
          actorId: 'local-user',
          origin: 'direct-chat',
          targetPanelId: directAgentKey(chat.id),
          contentChars: 'Inspect this canvas'.length,
        }),
      ])
    })
    expect(useAgentAuditStore.getState().getEvents('/repo')[0]).not.toHaveProperty('content')
  })

  it('revalidates an existing renderer session before sending', async () => {
    const agentKey = directAgentKey(chat.id)
    useCodingStore.getState().init(agentKey)
    useCodingStore.getState().appendSystem(agentKey, 'Keep this transcript')

    await promptDirectChat(chat, 'workspace-1', '/repo', 'Next message')

    expect(window.electronAPI.agentCreate).toHaveBeenCalledOnce()
    expect(useCodingStore.getState().panels[agentKey]?.messages).toEqual(
      expect.arrayContaining([expect.objectContaining({ text: 'Keep this transcript' })]),
    )
  })
})

describe('disposeDirectChatSession', () => {
  it('requests mission-worker cleanup before dropping the renderer session', () => {
    disposeDirectChatSession(chat.id, 'workspace-1')

    expect(window.electronAPI.agentDispose).toHaveBeenCalledWith(
      directAgentKey(chat.id),
      { stopCodingAgents: true, workspaceId: 'workspace-1' },
    )
    expect(useCodingStore.getState().panels[directAgentKey(chat.id)]).toBeUndefined()
  })
})
