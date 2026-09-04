import React, { useEffect, useRef } from 'react'
import { ActivitySparkline } from '../canvas/ActivitySparkline'
import { browserPanelUrl, type AgentState, type PanelState, type PanelType } from '../../shared/types'
import { PANEL_REGISTRY } from '../panels/registry'
import { panelRowLabel } from '../lib/panelTitle'
import { worktreeTitleStyle } from '../lib/worktreeTitleStyle'
import { isMiddleClick } from '../lib/mouse'
import type { CodingAgentRun } from '../../shared/codingAgentRuns'
import { codingAgentDisplayName } from '../../shared/codingAgentRuns'
import { Terminal as TerminalIcon, Star, type Icon as PhosphorIcon } from '@phosphor-icons/react'

export interface PanelRenameProps {
  /** Inline-edit value when this row is being renamed (null = not renaming). */
  renameValue: string | null
  onRenameChange: (value: string) => void
  onRenameSubmit: () => void
  onRenameCancel: () => void
  onBeginRename: () => void
  onContextMenu: (e: React.MouseEvent) => void
}

export interface TerminalPanelRowProps {
  panel: Pick<PanelState, 'id' | 'type' | 'title' | 'filePath' | 'tabs' | 'activeTabId' | 'starred' | 'tags' | 'accentColor'> & Partial<Pick<PanelState, 'agentSession' | 'codingAgentRun'>>
  indent: boolean
  agentState: AgentState | undefined
  agentLogo?: string | null
  hasPorts: boolean
  /** Panel-local activity-history key. Omitted for rows owned by another window. */
  activityHistoryId?: string
  worktreeColor?: string
  onClick: (e: React.MouseEvent) => void
  /** Middle-click closes the row (mirrors the dock tab behavior). */
  onClose?: () => void
  rename?: PanelRenameProps
  /** Context menu for rows without rename support (detached rows). Local rows
   *  route their menu through rename.onContextMenu instead. */
  onContextMenu?: (e: React.MouseEvent) => void
  /** Overrides the row's hover tooltip (used by detached rows to note the panel
   *  lives in another window). Falls back to the panel's path / url / label. */
  titleHint?: string
}

const AWAIT_COLOR = '#c08a5a'

/** Durable stashed-agent facts. Live status remains the owner window's job;
 *  these badges survive restart and do not invent transient process state. */
export type StashedAgentIndicator = {
  label: string
  color: string
  title: string
}

export function deriveStashedAgentIndicator(
  panel: {
    agentSession?: PanelState['agentSession']
    codingAgentRun?: Pick<CodingAgentRun, 'endedAt' | 'exitCode' | 'stoppedAt'>
  },
): StashedAgentIndicator | null {
  if (panel.codingAgentRun) {
    if (panel.codingAgentRun.stoppedAt) return { label: 'Stopped', color: '#8e8e93', title: 'Stashed coding-agent mission stopped' }
    if (panel.codingAgentRun.exitCode != null && panel.codingAgentRun.exitCode !== 0) {
      return { label: 'Failed', color: '#ff453a', title: 'Stashed coding-agent mission failed' }
    }
    if (panel.codingAgentRun.endedAt) return { label: 'Ready', color: '#34c759', title: 'Stashed coding-agent mission ready' }
    return { label: 'Mission', color: '#34c759', title: 'Stashed coding-agent mission retained' }
  }

  const session = panel.agentSession
  if (!session?.sessionId) return null
  return {
    label: 'Session',
    color: 'var(--focus-blue)',
    title: `Retained ${codingAgentDisplayName(session.agentId as never)} CLI session`,
  }
}

export const PANEL_ICONS: Record<PanelType, PhosphorIcon> = Object.fromEntries(
  (Object.keys(PANEL_REGISTRY) as PanelType[]).map((t) => [t, PANEL_REGISTRY[t].icon]),
) as Record<PanelType, PhosphorIcon>

export const TerminalPanelRow: React.FC<TerminalPanelRowProps> = ({ panel, indent, agentState, agentLogo: agentLogoProp, hasPorts, activityHistoryId, worktreeColor, onClick, onClose, rename, titleHint, onContextMenu }) => {
  const Icon = PANEL_ICONS[panel.type] ?? TerminalIcon
  const label = panelRowLabel(panel)

  const isRunning = agentState === 'running'
  const isAwaiting = agentState === 'waitingForInput'
  const agentLogo = panel.type === 'terminal' ? agentLogoProp : null
  const isRenaming = rename?.renameValue != null
  const rowAccent = panel.accentColor ?? worktreeColor
  const stashedIndicator = deriveStashedAgentIndicator(panel)

  return (
    <button
      className={`group/panel mx-1.5 my-0.5 rounded-lg flex items-center gap-1.5 h-7 pr-2 text-[13px] hover:bg-hover text-left min-w-0 focus:outline-none ${
        indent ? 'pl-10' : 'pl-7'
      } ${isAwaiting ? 'text-primary' : 'text-muted hover:text-primary'}`}
      onClick={onClick}
      onContextMenu={onContextMenu ?? rename?.onContextMenu}
      onMouseDown={(e) => { if (isMiddleClick(e)) e.preventDefault() }}
      onAuxClick={(e) => {
        if (isMiddleClick(e) && onClose) {
          e.preventDefault()
          e.stopPropagation()
          onClose()
        }
      }}
      title={titleHint ?? (panel.filePath || browserPanelUrl(panel) || label)}
    >
      {agentLogo ? (
        <img
          src={agentLogo}
          alt=""
          width={11}
          height={11}
          draggable={false}
          className="flex-shrink-0"
          style={{ width: 11, height: 11, objectFit: 'contain', display: 'block', opacity: 0.95 }}
        />
      ) : (
        <Icon
          size={11}
          className="flex-shrink-0"
          style={{ opacity: 0.6 }}
        />
      )}
      {isRenaming ? (
        <PanelRenameInput rename={rename!} />
      ) : (
        <span
          className={`truncate min-w-0 flex-1 ${isRunning ? 'cate-notif-pulse' : ''}`}
          style={worktreeTitleStyle(rowAccent, isRunning)}
          onDoubleClick={(e) => { e.stopPropagation(); rename?.onBeginRename() }}
        >
          {label}
        </span>
      )}
      {!!panel.starred && (
        <Star
          weight="fill"
          size={10}
          className="flex-shrink-0"
          style={{ color: rowAccent || 'var(--activity-orange)' }}
          aria-label="Starred"
        />
      )}
      {!!panel.tags?.length && (
        <span className="flex-shrink-0 max-w-[38%] truncate rounded-full px-1.5 text-[9px]" style={rowAccent ? { backgroundColor: `${rowAccent}22`, color: rowAccent } : undefined}>
          {panel.tags.join(' · ')}
        </span>
      )}
      {isAwaiting ? (
        <span className="cate-await-indicator flex-shrink-0" aria-label="awaiting input">
          <span className="cate-await-dot" style={{ backgroundColor: AWAIT_COLOR }} />
        </span>
      ) : !isRunning && hasPorts ? (
        <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-muted opacity-50" />
      ) : null}
      {stashedIndicator && !isRenaming && (
        <span
          aria-label={stashedIndicator.title}
          className="flex-shrink-0 rounded-full px-1.5 text-[9px] uppercase tracking-wide"
          style={{
            backgroundColor: `color-mix(in srgb, ${stashedIndicator.color} 18%, transparent)`,
            color: stashedIndicator.color,
          }}
          title={stashedIndicator.title}
        >
          {stashedIndicator.label}
        </span>
      )}
      {panel.type === 'terminal' && !!activityHistoryId && !isRenaming && (
        <ActivitySparkline
          panelId={activityHistoryId}
          height={9}
          width={18}
          style={{ opacity: 0.8 }}
        />
      )}
    </button>
  )
}

/** Inline edit input for a panel-row rename. Mirrors the workspace rename input
 * UX: Enter / blur commits, Escape cancels. Click is swallowed so it doesn't
 * trigger the row's focus-panel handler. */
export const PanelRenameInput: React.FC<{ rename: PanelRenameProps }> = ({ rename }) => {
  // Focus + select ONCE on mount. A callback ref running focus/select would
  // re-run on every render (new fn identity each render) and re-select all text
  // after each keystroke — making it impossible to type more than one character.
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const el = inputRef.current
    if (el) { el.focus(); el.select() }
  }, [])
  return (
    <input
      ref={inputRef}
      className="flex-1 min-w-0 text-[13px] bg-surface-3 border border-subtle rounded px-1 py-0 outline-none text-primary"
      value={rename.renameValue ?? ''}
      onChange={(e) => rename.onRenameChange(e.target.value)}
      onBlur={rename.onRenameSubmit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') rename.onRenameSubmit()
        if (e.key === 'Escape') rename.onRenameCancel()
      }}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    />
  )
}

export { panelRowLabel }
