import React from 'react'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { WorktreeMissionForm } from './WorktreeMissionForm'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function fillField(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value')?.set
  setter?.call(element, value)
  element.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('WorktreeMissionForm', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => { root.unmount() })
    host.remove()
  })

  it('collects the isolated branch, task, agent and base ref', async () => {
    const onSubmit = vi.fn(async () => undefined)
    await act(async () => {
      root.render(
        <WorktreeMissionForm
          defaultBaseBranch="main"
          onSubmit={onSubmit}
          onCancel={vi.fn()}
        />,
      )
    })

    const name = host.querySelector('input[aria-label="Worktree or branch name"]') as HTMLInputElement
    const task = host.querySelector('textarea[aria-label="Initial task"]') as HTMLTextAreaElement
    const agent = host.querySelector('select[aria-label="Agent"]') as HTMLSelectElement
    const base = host.querySelector('input[aria-label="Base branch"]') as HTMLInputElement
    await act(async () => {
      fillField(name, 'fix-login')
      fillField(task, 'Fix the login redirect and add a regression test')
      agent.value = 'codex'
      agent.dispatchEvent(new Event('change', { bubbles: true }))
      fillField(base, 'develop')
    })

    await act(async () => {
      host.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })

    expect(onSubmit).toHaveBeenCalledWith({
      worktreeName: 'fix-login',
      prompt: 'Fix the login redirect and add a regression test',
      agentId: 'codex',
      baseRef: 'develop',
    })
  })

  it('keeps the form open and reports a failed launch', async () => {
    const onSubmit = vi.fn(async () => { throw new Error('agent hooks are not ready') })
    await act(async () => {
      root.render(
        <WorktreeMissionForm
          defaultBaseBranch="main"
          onSubmit={onSubmit}
          onCancel={vi.fn()}
        />,
      )
    })
    await act(async () => {
      fillField(host.querySelector('input[aria-label="Worktree or branch name"]') as HTMLInputElement, 'fix-login')
      fillField(host.querySelector('textarea[aria-label="Initial task"]') as HTMLTextAreaElement, 'Fix login')
      host.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })

    expect(host.querySelector('[role="alert"]')?.textContent).toBe('agent hooks are not ready')
    expect(host.querySelector('[data-testid="worktree-mission-form"]')).not.toBeNull()
  })
})
