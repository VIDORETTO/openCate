import React from 'react'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'

import type { ProjectTask } from '../../shared/projectTasks'
import { useProjectTaskStore } from '../stores/projectTaskStore'
import { WorkspaceTasksSection } from './WorkspaceTasksSection'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const ROOT = '/repo'
const load = vi.fn(async () => [] as ProjectTask[])
const save = vi.fn(async () => undefined)

function fillField(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value')?.set
  setter?.call(element, value)
  element.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('WorkspaceTasksSection', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.clearAllMocks()
    load.mockResolvedValue([])
    ;(window as unknown as { electronAPI: unknown }).electronAPI = {
      projectTasksLoad: load,
      projectTasksSave: save,
    }
    useProjectTaskStore.setState({ tasksByRoot: {}, loadedRoots: {}, revisions: {} })
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => { root.unmount() })
    host.remove()
  })

  it('creates a contract, records explicit validation, log and artifact data', async () => {
    await act(async () => {
      root.render(<WorkspaceTasksSection rootPath={ROOT} />)
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    await act(async () => {
      host.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    const textareas = host.querySelectorAll('textarea')
    const objective = textareas[0] as HTMLTextAreaElement
    const constraints = textareas[1] as HTMLTextAreaElement
    const dependencies = textareas[2] as HTMLTextAreaElement
    await act(async () => {
      fillField(objective, 'Validate the result')
      fillField(constraints, 'Keep the evidence explicit')
      fillField(dependencies, 'upstream-task')
    })
    await act(async () => {
      host.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })

    let task = useProjectTaskStore.getState().getTasks(ROOT)[0]
    expect(task).toMatchObject({
      objective: 'Validate the result',
      constraints: ['Keep the evidence explicit'],
      dependsOn: ['upstream-task'],
    })

    await act(async () => {
      host.querySelector('button[title="Validate the result"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    const result = host.querySelectorAll('textarea')[3] as HTMLTextAreaElement
    await act(async () => {
      fillField(result, 'Focused contract tests passed')
      host.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })

    task = useProjectTaskStore.getState().getTasks(ROOT)[0]
    expect(task.validatedResult).toBe('Focused contract tests passed')
    expect(task.validatedAt).toEqual(expect.any(Number))

    const logInput = host.querySelector('input[placeholder="Add log event"]') as HTMLInputElement
    await act(async () => {
      fillField(logInput, 'Validation recorded')
      const logForm = Array.from(host.querySelectorAll('form')).find((form) => form.contains(logInput))
      logForm?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    const label = host.querySelector('input[placeholder="Artifact label"]') as HTMLInputElement
    const locator = host.querySelector('input[placeholder="Locator"]') as HTMLInputElement
    await act(async () => {
      fillField(label, 'Test report')
      fillField(locator, 'projectTasks.test.ts')
      const artifactForm = Array.from(host.querySelectorAll('form')).find((form) => form.contains(label))
      artifactForm?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })

    task = useProjectTaskStore.getState().getTasks(ROOT)[0]
    expect(task.logs.some((entry) => entry.message === 'Validation recorded')).toBe(true)
    expect(task.artifacts).toEqual([expect.objectContaining({ locator: 'projectTasks.test.ts' })])
    expect(save).toHaveBeenCalled()
  })
})
