import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useAppStore } from './index'
import { buildSessionFile, projectFilesToSnapshot } from '../../lib/workspace/sessionSerialize'

const initialState = useAppStore.getState()

describe('terminal panel metadata', () => {
  beforeEach(() => {
    useAppStore.setState({
      workspaces: [{
        id: 'ws',
        name: 'Workspace',
        color: '',
        rootPath: '/repo',
        panels: {},
      }],
      selectedWorkspaceId: 'ws',
    } as never)
  })

  afterEach(() => {
    useAppStore.setState(initialState, true)
  })

  const terminalId = () =>
    useAppStore.getState().createTerminal('ws', undefined, undefined, { target: 'none' }, '/repo')

  const panel = (panelId: string) =>
    useAppStore.getState().workspaces[0].panels[panelId]

  it('stars and unstars a terminal', () => {
    const id = terminalId()
    expect(panel(id).starred).toBeUndefined()

    useAppStore.getState().setPanelStarred('ws', id, true)
    expect(panel(id).starred).toBe(true)

    useAppStore.getState().setPanelStarred('ws', id, true)
    expect(panel(id).starred).toBe(true)

    useAppStore.getState().setPanelStarred('ws', id, false)
    expect(panel(id).starred).toBe(false)
  })

  it('normalizes tags, de-duplicates them, and clears the field when empty', () => {
    const id = terminalId()

    useAppStore.getState().setPanelTags('ws', id, [' Research ', 'research', 'fast'])
    expect(panel(id).tags).toEqual(['Research', 'research', 'fast'])

    useAppStore.getState().setPanelTags('ws', id, [])
    expect(panel(id).tags).toBeUndefined()
  })

  it('normalizes a valid accent color and rejects an invalid one', () => {
    const id = terminalId()

    useAppStore.getState().setPanelAccentColor('ws', id, '#4A8AD0')
    expect(panel(id).accentColor).toBe('#4a8ad0')

    useAppStore.getState().setPanelAccentColor('ws', id, 'not-a-color')
    expect(panel(id).accentColor).toBeUndefined()
  })

  it('persists terminal metadata in the machine-local session and restores it', () => {
    const id = terminalId()
    useAppStore.getState().renamePanelByUser('ws', id, 'Fleet leader')
    useAppStore.getState().setPanelStarred('ws', id, true)
    useAppStore.getState().setPanelTags('ws', id, ['release'])
    useAppStore.getState().setPanelAccentColor('ws', id, '#6bbf5c')
    useAppStore.getState().stashPanel('ws', id)

    const wsState = useAppStore.getState().workspaces[0]
    const sessionFile = buildSessionFile({
      workspaceId: 'ws',
      workspaceName: wsState.name,
      rootPath: '/repo',
      panels: wsState.panels,
    })

    expect(sessionFile.panels[id]).toMatchObject({
      starred: true,
      tags: ['release'],
      accentColor: '#6bbf5c',
      stashed: true,
    })

    const restored = projectFilesToSnapshot({
      version: 1,
      name: wsState.name,
      color: '',
      panels: {
        [id]: { type: 'terminal', title: 'Fleet leader' },
      },
    }, sessionFile, '/repo')

    expect(restored.panels?.[id]).toMatchObject({
      starred: true,
      tags: ['release'],
      accentColor: '#6bbf5c',
      stashed: true,
    })
  })
})
