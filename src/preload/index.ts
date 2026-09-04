import { contextBridge, ipcRenderer, webUtils, webFrame } from 'electron'

// Phase 0 perf marker — capture preload entry as early as possible.
try { performance.mark('preload-start') } catch { /* noop */ }

import {
  TERMINAL_DATA,
  TERMINAL_EXIT,
  FS_WATCH_EVENT,
  GIT_BRANCH_UPDATE,
  GIT_MONITOR_START,
  GIT_MONITOR_STOP,
  SHELL_ACTIVITY_UPDATE,
  SHELL_PORTS_UPDATE,
  SHELL_AGENT_SESSION_UPDATE,
  SHELL_CWD_UPDATE,
  SHELL_AGENT_SCREEN_STATE,
  SHELL_AGENT_HOOK_EVENT,
  SETTINGS_CHANGED,
  SETTINGS_RELOADED,
  SESSION_FLUSH_SAVE,
  SESSION_FLUSH_SAVE_DONE,
  WORKSPACE_EXTERNAL_EDIT,
  BOOT_SNAPSHOT_WRITE,
  APP_OPEN_PATH,
  MENU_OPEN_SETTINGS,
  MENU_TRIGGER_ACTION,
  MENU_LOAD_LAYOUT,
  BROWSER_SHORTCUT,
  MENU_POPUP_BAR_ITEM,
  DIALOG_SAVE_FILE,
  DIALOG_TERMINAL_LINK_OPEN,
  BROWSER_HISTORY_CHANGED,
  BROWSER_BOOKMARKS_CHANGED,
  SEARCH_RESULT,
  SEARCH_DONE,
  NOTIFY_ACTION,
  WINDOW_SET_TITLE,
  WINDOW_IS_MAXIMIZED,
  WINDOW_MAXIMIZE_STATE,
  PANEL_RECEIVE,
  WINDOW_FULLSCREEN_STATE,
  DRAG_END,
  DOCK_WINDOW_INIT,
  DOCK_WINDOW_FLUSH_SYNC,
  DOCK_WINDOW_FLUSH_SYNC_DONE,
  WINDOW_PANELS_CHANGED,
  REVEAL_PANEL_IN_WINDOW,
  CLOSE_PANEL_IN_WINDOW,
  CROSS_WINDOW_DRAG_UPDATE,
  WORKSPACE_CHANGED,
  RUNTIME_STATUS,
  RUNTIME_TELEMETRY,
  UPDATE_STATUS,
  ANALYTICS_FEEDBACK_PROMPT,
  ANALYTICS_FEEDBACK_DISMISS,
  ANALYTICS_LINK_CLICK,
  ANALYTICS_TRACK_USAGE,
  OPEN_EXTERNAL_URL,
  CODING_EVENT,
  CODING_UI_RESPONSE,
  AUTH_OAUTH_EVENT,
  AUTH_CHANGED,
  EXTENSION_PANEL_CLOSED,
  EXTENSIONS_CHANGED,
  CATE_HOST_FORWARD,
  CATE_HOST_FORWARD_REPLY,
} from '../shared/ipc-channels'
import type { AppSettings, SearchResultBatch, SearchDoneEvent, RuntimeTelemetryEvent } from '../shared/types'
import type { UpdateStatus } from '../shared/electron-api'
import { createIpcListener } from './ipcBridge'
import { invokeForwarders } from './invokeForwarders'

// Cache native-fullscreen state so renderer drag handlers can synchronously
// check it without an IPC round-trip on every mousemove. Main BROADCASTS
// `WINDOW_FULLSCREEN_STATE` whenever any window enters/leaves fullscreen
// (push updates) AND also supports `sendSync` with the same channel as a
// definitive pull — used once per drag start to avoid stale state.
let cachedFullscreen = false
ipcRenderer.on(WINDOW_FULLSCREEN_STATE, (_event, value: boolean) => {
  cachedFullscreen = Boolean(value)
})
function fullscreenLiveCheck(): boolean {
  try {
    const v = ipcRenderer.sendSync(WINDOW_FULLSCREEN_STATE)
    cachedFullscreen = Boolean(v)
    return cachedFullscreen
  } catch {
    return cachedFullscreen
  }
}

// This window's own maximize state, pushed by main on maximize/unmaximize. Cached
// so the custom window controls can render synchronously on first paint, with a
// `sendSync` pull as the authoritative fallback (mirrors the fullscreen pattern).
let cachedMaximized = false
ipcRenderer.on(WINDOW_MAXIMIZE_STATE, (_event, value: boolean) => {
  cachedMaximized = Boolean(value)
})
function maximizedLiveCheck(): boolean {
  try {
    const v = ipcRenderer.sendSync(WINDOW_IS_MAXIMIZED)
    cachedMaximized = Boolean(v)
    return cachedMaximized
  } catch {
    return cachedMaximized
  }
}

contextBridge.exposeInMainWorld('electronAPI', {
  ...invokeForwarders,
  isE2E: process.env.CATE_E2E === '1',
  isPerf: process.env.CATE_PERF === '1',

  /** Set this window's UI zoom factor (openCate chrome only — webview content keeps
   *  its own zoom). Applied per-renderer; each window calls this on mount and
   *  whenever the uiScale setting changes. */
  setUiScale(scale: number): void {
    const clamped = Math.min(2, Math.max(0.5, Number.isFinite(scale) ? scale : 1))
    webFrame.setZoomFactor(clamped)
  },
  // ---------------------------------------------------------------------------
  // Terminal
  // ---------------------------------------------------------------------------

  onTerminalData(callback: (terminalId: string, data: string) => void): () => void {
    return createIpcListener(TERMINAL_DATA, callback)
  },

  onTerminalExit(callback: (terminalId: string, exitCode: number) => void): () => void {
    return createIpcListener(TERMINAL_EXIT, callback)
  },

  // ---------------------------------------------------------------------------
  // Filesystem
  // ---------------------------------------------------------------------------

  onFsWatchEvent(
    callback: (event: { type: 'create' | 'update' | 'delete'; path: string }) => void,
  ): () => void {
    return createIpcListener(FS_WATCH_EVENT, callback)
  },

  // ---------------------------------------------------------------------------
  // Content search (ripgrep-backed Search view)
  // ---------------------------------------------------------------------------

  onSearchResult(callback: (batch: SearchResultBatch) => void): () => void {
    return createIpcListener(SEARCH_RESULT, callback)
  },

  onSearchDone(callback: (event: SearchDoneEvent) => void): () => void {
    return createIpcListener(SEARCH_DONE, callback)
  },

  // ---------------------------------------------------------------------------
  // Git
  // ---------------------------------------------------------------------------

  // ---------------------------------------------------------------------------
  // Shell / Process Monitor
  // ---------------------------------------------------------------------------

  onShellActivityUpdate(
    callback: (
      terminalId: string,
      activity: unknown,
      agentName: unknown,
      agentPresent: unknown,
    ) => void,
  ): () => void {
    return createIpcListener(SHELL_ACTIVITY_UPDATE, callback)
  },

  onShellPortsUpdate(callback: (terminalId: string, ports: number[]) => void): () => void {
    return createIpcListener(SHELL_PORTS_UPDATE, callback)
  },

  onShellAgentSessionUpdate(callback: (terminalId: string, session: unknown) => void): () => void {
    return createIpcListener(SHELL_AGENT_SESSION_UPDATE, callback)
  },

  onShellAgentHookEvent(callback: (terminalId: string, event: unknown) => void): () => void {
    return createIpcListener(SHELL_AGENT_HOOK_EVENT, callback)
  },

  shellReportAgentScreenState(terminalId: string, state: string): void {
    ipcRenderer.send(SHELL_AGENT_SCREEN_STATE, terminalId, state)
  },

  onAgentScreenStateUpdate(
    callback: (terminalId: string, state: string) => void,
  ): () => void {
    return createIpcListener(SHELL_AGENT_SCREEN_STATE, callback)
  },

  onShellCwdUpdate(callback: (terminalId: string, cwd: string) => void): () => void {
    return createIpcListener(SHELL_CWD_UPDATE, callback)
  },

  onGitBranchUpdate(
    callback: (workspaceId: string, branch: string, isDirty: boolean) => void,
  ): () => void {
    return createIpcListener(GIT_BRANCH_UPDATE, callback)
  },

  gitMonitorStart(workspaceId: string, rootPath: string): void {
    ipcRenderer.send(GIT_MONITOR_START, workspaceId, rootPath)
  },

  gitMonitorStop(workspaceId: string): void {
    ipcRenderer.send(GIT_MONITOR_STOP, workspaceId)
  },

  // ---------------------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------------------

  onSettingsChanged(callback: (key: keyof AppSettings, value: unknown) => void): () => void {
    return createIpcListener(SETTINGS_CHANGED, callback)
  },

  onSettingsReloaded(callback: (settings: AppSettings) => void): () => void {
    return createIpcListener(SETTINGS_RELOADED, callback)
  },

  // ---------------------------------------------------------------------------
  // Session
  // ---------------------------------------------------------------------------


  onSessionFlushSave(callback: () => void): () => void {
    return createIpcListener(SESSION_FLUSH_SAVE, callback)
  },

  sessionFlushSaveDone(): void {
    ipcRenderer.send(SESSION_FLUSH_SAVE_DONE)
  },

  /** Push a partial boot snapshot to main (geometry, theme, etc.). Main
   *  debounces and writes `<userData>/boot.json` for the next cold launch.
   *  Not in the ElectronAPI interface yet, so hand-written rather than folded
   *  into the invokeForwarders table. */
  bootSnapshotWrite(partial: Record<string, unknown>): Promise<void> {
    return ipcRenderer.invoke(BOOT_SNAPSHOT_WRITE, partial)
  },

  // ---------------------------------------------------------------------------
  // App
  // ---------------------------------------------------------------------------

  onOpenPath(callback: (filePath: string) => void): () => void {
    return createIpcListener(APP_OPEN_PATH, callback)
  },

  // ---------------------------------------------------------------------------
  // Dialog
  // ---------------------------------------------------------------------------

  saveFileDialog(payload?: { defaultName?: string; defaultPath?: string }): Promise<string | null> {
    return ipcRenderer.invoke(DIALOG_SAVE_FILE, payload ?? {})
  },

  promptTerminalLinkOpen(url: string): Promise<'canvas' | 'external' | 'cancel'> {
    return ipcRenderer.invoke(DIALOG_TERMINAL_LINK_OPEN, { url })
  },

  // ---------------------------------------------------------------------------
  // Recent Projects
  // ---------------------------------------------------------------------------

  onNotifyAction(callback: (action: unknown) => void): () => void {
    return createIpcListener(NOTIFY_ACTION, callback)
  },

  // ---------------------------------------------------------------------------
  // Window management
  // ---------------------------------------------------------------------------

  /** Not in the ElectronAPI interface yet, so hand-written rather than folded
   *  into the invokeForwarders table. */
  windowSetTitle(title: string): Promise<void> {
    return ipcRenderer.invoke(WINDOW_SET_TITLE, title)
  },

  // ---------------------------------------------------------------------------
  // Panel transfer (cross-window)
  // ---------------------------------------------------------------------------

  onPanelReceive(callback: (snapshot: unknown) => void): () => void {
    return createIpcListener(PANEL_RECEIVE, callback)
  },

  // ---------------------------------------------------------------------------
  // Cross-window drag-and-drop
  // ---------------------------------------------------------------------------

  /** Synchronous check: is any openCate BrowserWindow currently in macOS
   *  native fullscreen? Uses the cached push value when available and
   *  falls back to a sync IPC for the authoritative answer. Drag handlers
   *  call this on every mousemove — that's fine at ~60 Hz. */
  isMainWindowFullscreen(): boolean {
    return fullscreenLiveCheck()
  },

  /** Is the calling window currently maximized? Uses the cached push value and
   *  falls back to a sync IPC for the authoritative answer. */
  isWindowMaximized(): boolean {
    return maximizedLiveCheck()
  },
  /** Subscribe to this window's maximize-state changes. Fires with the new
   *  boolean whenever the window is maximized or restored. */
  onWindowMaximizeChange(callback: (isMaximized: boolean) => void): () => void {
    const listener = (_event: Electron.IpcRendererEvent, value: boolean): void => {
      callback(Boolean(value))
    }
    ipcRenderer.on(WINDOW_MAXIMIZE_STATE, listener)
    return () => { ipcRenderer.removeListener(WINDOW_MAXIMIZE_STATE, listener) }
  },

  onDragEnd(callback: (dragId: string) => void): () => void {
    return createIpcListener(DRAG_END, callback)
  },

  /** Subscribe to native-fullscreen state changes. Fires with the new boolean
   *  whenever any openCate window enters or leaves macOS native fullscreen. */
  onFullscreenChange(callback: (isFullscreen: boolean) => void): () => void {
    const listener = (_event: Electron.IpcRendererEvent, value: boolean): void => {
      callback(Boolean(value))
    }
    ipcRenderer.on(WINDOW_FULLSCREEN_STATE, listener)
    return () => { ipcRenderer.removeListener(WINDOW_FULLSCREEN_STATE, listener) }
  },

  /** Subscribe to workspace.json external-edit state. Fires whenever a project's
   *  on-disk workspace file diverges from what openCate last wrote (edited
   *  externally) or comes back in sync after a reload. */
  onWorkspaceExternalEdit(callback: (payload: { rootPath: string }) => void): () => void {
    return createIpcListener(WORKSPACE_EXTERNAL_EDIT, callback)
  },

  // ---------------------------------------------------------------------------
  // Dock window management
  // ---------------------------------------------------------------------------

  onDockWindowInit(callback: (payload: unknown) => void): () => void {
    return createIpcListener(DOCK_WINDOW_INIT, callback)
  },

  onDockWindowFlushSync(callback: () => void): () => void {
    return createIpcListener(DOCK_WINDOW_FLUSH_SYNC, callback)
  },

  dockWindowFlushSyncDone(): void {
    ipcRenderer.send(DOCK_WINDOW_FLUSH_SYNC_DONE)
  },

  // ---------------------------------------------------------------------------
  // Cross-window panel discovery
  // ---------------------------------------------------------------------------

  onWindowPanelsChanged(callback: (panels: unknown[]) => void): () => void {
    return createIpcListener(WINDOW_PANELS_CHANGED, callback)
  },

  onRevealPanelInWindow(callback: (panelId: string) => void): () => void {
    return createIpcListener(REVEAL_PANEL_IN_WINDOW, callback)
  },

  onClosePanelInWindow(callback: (panelId: string) => void): () => void {
    return createIpcListener(CLOSE_PANEL_IN_WINDOW, callback)
  },

  // ---------------------------------------------------------------------------
  // Cross-window drag coordination
  // ---------------------------------------------------------------------------

  onCrossWindowDragUpdate(callback: (screenPos: unknown, snapshot: unknown, dragId: unknown) => void): () => void {
    return createIpcListener(CROSS_WINDOW_DRAG_UPDATE, callback)
  },

  // ---------------------------------------------------------------------------
  // Workspace management (main process is source of truth)
  // ---------------------------------------------------------------------------

  onRuntimeStatus(callback: (event: unknown) => void): () => void {
    return createIpcListener(RUNTIME_STATUS, callback)
  },

  onRuntimeTelemetry(callback: (event: RuntimeTelemetryEvent) => void): () => void {
    return createIpcListener(RUNTIME_TELEMETRY, callback)
  },

  onWorkspaceChanged(callback: (workspaces: unknown[], originWindowId: number | null) => void): () => void {
    return createIpcListener(WORKSPACE_CHANGED, callback)
  },

  // ---------------------------------------------------------------------------
  // File drag-and-drop helpers
  // ---------------------------------------------------------------------------

  /** Get the absolute file path for a File object from an OS drag-and-drop. */
  getPathForFile(file: File): string {
    return webUtils.getPathForFile(file)
  },

  // ---------------------------------------------------------------------------
  // Menu actions (main -> renderer)
  // ---------------------------------------------------------------------------

  /** Pop the native submenu of top-level item `index` at window-relative (x, y)
   *  — directly below its label in the title bar. */
  popupAppMenu(index: number, x: number, y: number): Promise<void> {
    return ipcRenderer.invoke(MENU_POPUP_BAR_ITEM, { index, x, y })
  },

  onMenuOpenSettings(callback: () => void): () => void {
    return createIpcListener(MENU_OPEN_SETTINGS, callback)
  },

  onMenuTriggerAction(callback: (action: string) => void): () => void {
    return createIpcListener(MENU_TRIGGER_ACTION, callback)
  },

  onMenuLoadLayout(callback: (name: string) => void): () => void {
    return createIpcListener(MENU_LOAD_LAYOUT, callback)
  },

  onBrowserShortcut(callback: (action: string) => void): () => void {
    return createIpcListener(BROWSER_SHORTCUT, callback)
  },
  onBrowserHistoryChanged(callback: () => void): () => void {
    return createIpcListener(BROWSER_HISTORY_CHANGED, callback)
  },

  onBrowserBookmarksChanged(callback: () => void): () => void {
    return createIpcListener(BROWSER_BOOKMARKS_CHANGED, callback)
  },

  // ---------------------------------------------------------------------------
  // Post-update changelog + feedback prompt
  // ---------------------------------------------------------------------------

  onUpdateStatus(callback: (status: UpdateStatus) => void): () => void {
    return createIpcListener(UPDATE_STATUS, callback)
  },

  onFeedbackPrompt(callback: (payload: { fromVersion: string; toVersion: string }) => void): () => void {
    return createIpcListener(ANALYTICS_FEEDBACK_PROMPT, callback)
  },

  dismissFeedback(method: string): void {
    ipcRenderer.send(ANALYTICS_FEEDBACK_DISMISS, method)
  },

  trackLinkClick(link: string): void {
    ipcRenderer.send(ANALYTICS_LINK_CLICK, link)
  },

  trackFeatureUsed(feature: string, props?: Record<string, string | number | boolean>): void {
    ipcRenderer.send(ANALYTICS_TRACK_USAGE, { feature, props })
  },

  openExternalUrl(url: string): void {
    ipcRenderer.send(OPEN_EXTERNAL_URL, url)
  },

  // ---------------------------------------------------------------------------
  // Pi agent
  // ---------------------------------------------------------------------------

  agentUiResponse(panelId: string, response: unknown): void {
    ipcRenderer.send(CODING_UI_RESPONSE, panelId, response)
  },

  onAgentEvent(callback: (envelope: unknown) => void): () => void {
    return createIpcListener(CODING_EVENT, callback)
  },

  // ---------------------------------------------------------------------------
  // Pi auth / providers
  // ---------------------------------------------------------------------------

  onAuthOAuthEvent(callback: (providerId: string, event: unknown) => void): () => void {
    return createIpcListener(AUTH_OAUTH_EVENT, callback)
  },

  onAuthChanged(callback: () => void): () => void {
    return createIpcListener(AUTH_CHANGED, callback)
  },

  // ---------------------------------------------------------------------------
  // Extensions
  // ---------------------------------------------------------------------------

  /** Fired (broadcast) whenever the known/enabled extension set changes. */
  onExtensionsChanged(callback: () => void): () => void {
    return createIpcListener(EXTENSIONS_CHANGED, callback)
  },

  /** A server-backed extension panel unmounted — let main start the grace timer
   *  (fire-and-forget). */
  extensionPanelClosed(args: { extensionId: string; workspaceId: string; panelId: string }): void {
    ipcRenderer.send(EXTENSION_PANEL_CLOSED, args)
  },

  /** Main forwards a state-mutating cateHost call (editor.openFile,
   *  canvas.createPanel, panel.setTitle) to the owning renderer, which acts and
   *  replies via cateHostActionReply. */
  onCateHostAction(
    callback: (payload: {
      requestId: string
      workspaceId: string
      panelId: string
      extensionId: string
      method: string
      args: unknown
    }) => void,
  ): () => void {
    return createIpcListener(CATE_HOST_FORWARD, callback)
  },

  /** Reply to a forwarded cateHost action (fire-and-forget). */
  cateHostActionReply(payload: { requestId: string; ok: boolean; result?: unknown; error?: string }): void {
    ipcRenderer.send(CATE_HOST_FORWARD_REPLY, payload)
  },

})
