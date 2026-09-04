import * as IPC from '../shared/ipc-channels'
import type { ElectronAPI } from '../shared/electron-api'
import { makeInvoker } from './ipcBridge'

// The public bridge is intentionally assembled from domain-grouped forwarders.
// Keeping each key tied to ElectronAPI prevents a channel-only entry from
// silently becoming available without a renderer contract.
function forward<K extends keyof ElectronAPI>(key: K, channel: string): Pick<ElectronAPI, K> {
  return { [key]: makeInvoker<K>(channel) } as Pick<ElectronAPI, K>
}

export const invokeForwarders = {
  ...forward('perfGetSnapshot', IPC.PERF_GET),

  // Terminal
  ...forward('terminalCreate', IPC.TERMINAL_CREATE),
  ...forward('terminalWrite', IPC.TERMINAL_WRITE),
  ...forward('terminalResize', IPC.TERMINAL_RESIZE),
  ...forward('terminalKill', IPC.TERMINAL_KILL),
  ...forward('terminalGetCwd', IPC.TERMINAL_GET_CWD),
  ...forward('terminalLogRead', IPC.TERMINAL_LOG_READ),
  ...forward('terminalScrollbackSave', IPC.TERMINAL_SCROLLBACK_SAVE),
  ...forward('terminalSetVisibility', IPC.TERMINAL_SET_VISIBILITY),
  ...forward('terminalClipboardWrite', IPC.TERMINAL_CLIPBOARD_WRITE),
  ...forward('webglRequestGrant', IPC.WEBGL_REQUEST_GRANT),
  ...forward('webglReleaseGrant', IPC.WEBGL_RELEASE_GRANT),

  // Filesystem
  ...forward('fsReadFile', IPC.FS_READ_FILE),
  ...forward('fsReadBinary', IPC.FS_READ_BINARY),
  ...forward('fsWriteFile', IPC.FS_WRITE_FILE),
  ...forward('fsReadDir', IPC.FS_READ_DIR),
  ...forward('fsSearch', IPC.FS_SEARCH),
  ...forward('fsWatchStart', IPC.FS_WATCH_START),
  ...forward('fsWatchStop', IPC.FS_WATCH_STOP),
  ...forward('fsStat', IPC.FS_STAT),
  ...forward('fsDelete', IPC.FS_DELETE),
  ...forward('fsRename', IPC.FS_RENAME),
  ...forward('fsMkdir', IPC.FS_MKDIR),
  ...forward('fsCopy', IPC.FS_COPY),
  ...forward('fsImportEntries', IPC.FS_IMPORT_ENTRIES),

  // Content search
  ...forward('searchStart', IPC.SEARCH_START),
  ...forward('searchCancel', IPC.SEARCH_CANCEL),

  // Git
  ...forward('gitIsRepo', IPC.GIT_IS_REPO),
  ...forward('gitFindRepos', IPC.GIT_FIND_REPOS),
  ...forward('gitInit', IPC.GIT_INIT),
  ...forward('gitLsFiles', IPC.GIT_LS_FILES),
  ...forward('gitStatus', IPC.GIT_STATUS),
  ...forward('gitDiff', IPC.GIT_DIFF),
  ...forward('gitStage', IPC.GIT_STAGE),
  ...forward('gitUnstage', IPC.GIT_UNSTAGE),
  ...forward('gitCommit', IPC.GIT_COMMIT),
  ...forward('gitWorktreeList', IPC.GIT_WORKTREE_LIST),
  ...forward('gitWorktreeAdd', IPC.GIT_WORKTREE_ADD),
  ...forward('gitWorktreeRemove', IPC.GIT_WORKTREE_REMOVE),
  ...forward('gitWorktreePrune', IPC.GIT_WORKTREE_PRUNE),
...forward('gitWorktreeStatus', IPC.GIT_WORKTREE_STATUS),
...forward('gitWorktreeReview', IPC.GIT_WORKTREE_REVIEW),
...forward('gitWorktreeApplySelection', IPC.GIT_WORKTREE_APPLY_SELECTION),
...forward('gitWorktreeMergeTo', IPC.GIT_WORKTREE_MERGE_TO),
  ...forward('gitWorktreeUpdateFrom', IPC.GIT_WORKTREE_UPDATE_FROM),
  ...forward('gitWorktreeAddFromPr', IPC.GIT_WORKTREE_ADD_FROM_PR),
  ...forward('gitPrList', IPC.GIT_PR_LIST),
  ...forward('gitCreatePR', IPC.GIT_CREATE_PR),
  ...forward('gitPrStatus', IPC.GIT_PR_STATUS),
  ...forward('gitPush', IPC.GIT_PUSH),
  ...forward('gitPull', IPC.GIT_PULL),
  ...forward('gitFetch', IPC.GIT_FETCH),
  ...forward('gitLog', IPC.GIT_LOG),
  ...forward('gitBranchList', IPC.GIT_BRANCH_LIST),
  ...forward('gitBranchCreate', IPC.GIT_BRANCH_CREATE),
  ...forward('gitBranchDelete', IPC.GIT_BRANCH_DELETE),
  ...forward('gitCheckout', IPC.GIT_CHECKOUT),
  ...forward('gitDiffStaged', IPC.GIT_DIFF_STAGED),
  ...forward('gitStash', IPC.GIT_STASH),
  ...forward('gitStashPop', IPC.GIT_STASH_POP),
  ...forward('gitDiscardFile', IPC.GIT_DISCARD_FILE),

  // Settings
  ...forward('agentHooksInspect', IPC.AGENT_HOOKS_INSPECT),
  ...forward('settingsGet', IPC.SETTINGS_GET),
  ...forward('settingsSet', IPC.SETTINGS_SET),
  ...forward('settingsGetAll', IPC.SETTINGS_GET_ALL),
  ...forward('settingsReset', IPC.SETTINGS_RESET),
  ...forward('uiStateGetAll', IPC.UI_STATE_GET_ALL),
  ...forward('uiStateSet', IPC.UI_STATE_SET),
  ...forward('settingsOpenInEditor', IPC.SETTINGS_OPEN_IN_EDITOR),
  ...forward('companionPairingBegin', IPC.COMPANION_PAIRING_BEGIN),
  ...forward('companionPairingComplete', IPC.COMPANION_PAIRING_COMPLETE),
  ...forward('companionDevicesList', IPC.COMPANION_DEVICES_LIST),
  ...forward('companionDeviceRevoke', IPC.COMPANION_DEVICE_REVOKE),
  ...forward('companionApprovalGrant', IPC.COMPANION_APPROVAL_GRANT),

  // Session
  ...forward('projectStateSave', IPC.PROJECT_STATE_SAVE),
  ...forward('projectStateLoad', IPC.PROJECT_STATE_LOAD),
  ...forward('projectChatsLoad', IPC.PROJECT_CHATS_LOAD),
  ...forward('projectChatsSave', IPC.PROJECT_CHATS_SAVE),
  ...forward('projectMemoryLoad', IPC.PROJECT_MEMORY_LOAD),
  ...forward('projectMemorySave', IPC.PROJECT_MEMORY_SAVE),
  ...forward('projectTasksLoad', IPC.PROJECT_TASKS_LOAD),
  ...forward('projectTasksSave', IPC.PROJECT_TASKS_SAVE),
  ...forward('projectAgentAuditLoad', IPC.PROJECT_AGENT_AUDIT_LOAD),
  ...forward('projectAgentAuditSave', IPC.PROJECT_AGENT_AUDIT_SAVE),

  // Dialog
  ...forward('openFolderDialog', IPC.DIALOG_OPEN_FOLDER),
  ...forward('openImageDialog', IPC.DIALOG_OPEN_IMAGE),
  ...forward('readCanvasBackgroundImage', IPC.CANVAS_READ_BACKGROUND_IMAGE),
  ...forward('confirmUnsavedChanges', IPC.DIALOG_CONFIRM_UNSAVED),
  ...forward('confirmCloseTerminal', IPC.DIALOG_CONFIRM_CLOSE_TERMINAL),
  ...forward('confirmCloseCanvas', IPC.DIALOG_CONFIRM_CLOSE_CANVAS),
  ...forward('confirmReloadWorkspace', IPC.DIALOG_CONFIRM_RELOAD_WORKSPACE),
  ...forward('confirmDiscardJob', IPC.DIALOG_CONFIRM_DISCARD_JOB),
  ...forward('confirmSwitchAgentWorktree', IPC.DIALOG_CONFIRM_SWITCH_AGENT_WORKTREE),
  ...forward('confirmImportEntries', IPC.DIALOG_CONFIRM_IMPORT),

  // Recent projects / sidebar / remote projects
  ...forward('recentProjectsGet', IPC.RECENT_PROJECTS_GET),
  ...forward('recentProjectsAdd', IPC.RECENT_PROJECTS_ADD),
  ...forward('recentProjectsRemove', IPC.RECENT_PROJECTS_REMOVE),

  // Workspace trust
  ...forward('projectTrustGet', IPC.PROJECT_TRUST_GET),
  ...forward('projectTrustSet', IPC.PROJECT_TRUST_SET),

  // Browser history + bookmarks (global)
  ...forward('browserHistoryRecord', IPC.BROWSER_HISTORY_RECORD),
  ...forward('browserHistoryGet', IPC.BROWSER_HISTORY_GET),
  ...forward('browserHistoryQuery', IPC.BROWSER_HISTORY_QUERY),
  ...forward('browserHistoryRemove', IPC.BROWSER_HISTORY_REMOVE),
  ...forward('browserHistoryClear', IPC.BROWSER_HISTORY_CLEAR),
  ...forward('browserBookmarksGet', IPC.BROWSER_BOOKMARKS_GET),
  ...forward('browserBookmarksAdd', IPC.BROWSER_BOOKMARKS_ADD),
  ...forward('browserBookmarksRemove', IPC.BROWSER_BOOKMARKS_REMOVE),
  ...forward('browserClearData', IPC.BROWSER_CLEAR_DATA),
  ...forward('sidebarSessionGet', IPC.SIDEBAR_SESSION_GET),
  ...forward('sidebarSessionSet', IPC.SIDEBAR_SESSION_SET),
  ...forward('remoteProjectsGet', IPC.REMOTE_PROJECTS_GET),
  ...forward('remoteProjectsSet', IPC.REMOTE_PROJECTS_SET),

  // Layouts
  ...forward('layoutSave', IPC.LAYOUT_SAVE),
  ...forward('layoutList', IPC.LAYOUT_LIST),
  ...forward('layoutLoad', IPC.LAYOUT_LOAD),
  ...forward('layoutDelete', IPC.LAYOUT_DELETE),

  // Capture / browser
  ...forward('webviewScreenshot', IPC.WEBVIEW_SCREENSHOT),
  ...forward('browserControl', IPC.BROWSER_CONTROL),
  ...forward('browserSetProxy', IPC.BROWSER_SET_PROXY),
  ...forward('browserCredentialProfiles', IPC.BROWSER_CREDENTIAL_PROFILES),
  ...forward('browserCredentialList', IPC.BROWSER_CREDENTIAL_LIST),
  ...forward('browserCredentialImport', IPC.BROWSER_CREDENTIAL_IMPORT),
  ...forward('browserCredentialImportFile', IPC.BROWSER_CREDENTIAL_IMPORT_FILE),
  ...forward('browserCredentialRemove', IPC.BROWSER_CREDENTIAL_REMOVE),
  ...forward('browserCredentialSuggestions', IPC.BROWSER_CREDENTIAL_SUGGESTIONS),
  ...forward('browserCredentialFill', IPC.BROWSER_CREDENTIAL_FILL),
  ...forward('browserCredentialClear', IPC.BROWSER_CREDENTIAL_CLEAR),
  ...forward('nativeFileDrag', IPC.NATIVE_FILE_DRAG),

  // Shell utilities / notifications
  ...forward('shellShowInFolder', IPC.SHELL_SHOW_IN_FOLDER),
  ...forward('notifyOS', IPC.NOTIFY_OS),

  // Window management
  ...forward('windowMinimize', IPC.WINDOW_MINIMIZE),
  ...forward('windowToggleMaximize', IPC.WINDOW_TOGGLE_MAXIMIZE),
  ...forward('windowClose', IPC.WINDOW_CLOSE),
  ...forward('windowsCloseForWorkspace', IPC.WINDOW_CLOSE_FOR_WORKSPACE),
  ...forward('runActionInMain', IPC.RUN_ACTION_IN_MAIN),

  // Panel transfer and cross-window coordination
  ...forward('panelTransferAck', IPC.PANEL_TRANSFER_ACK),
  ...forward('dragDetach', IPC.DRAG_DETACH),
  ...forward('dismissWorkspaceExternalEdit', IPC.WORKSPACE_EXTERNAL_EDIT_DISMISS),
  ...forward('dockWindowSyncState', IPC.DOCK_WINDOW_SYNC_STATE),
  ...forward('dockWindowsList', IPC.DOCK_WINDOWS_LIST),
  ...forward('dockWindowRestore', IPC.DOCK_WINDOW_RESTORE),
  ...forward('focusWindowPanel', IPC.FOCUS_WINDOW_PANEL),
  ...forward('closeWindowPanel', IPC.CLOSE_WINDOW_PANEL),
  ...forward('reportWindowPanels', IPC.WINDOW_PANELS_REPORT),
  ...forward('crossWindowDragStart', IPC.CROSS_WINDOW_DRAG_START),
  ...forward('crossWindowDragDrop', IPC.CROSS_WINDOW_DRAG_DROP),
  ...forward('crossWindowDragCancel', IPC.CROSS_WINDOW_DRAG_CANCEL),
  ...forward('crossWindowDragResolve', IPC.CROSS_WINDOW_DRAG_RESOLVE),

  // Workspace management
  ...forward('workspaceCreate', IPC.WORKSPACE_CREATE),
  ...forward('workspaceUpdate', IPC.WORKSPACE_UPDATE),
  ...forward('workspaceRemove', IPC.WORKSPACE_REMOVE),

  // Runtime connections (remote / WSL)
  ...forward('runtimeConnect', IPC.RUNTIME_CONNECT),
  ...forward('runtimeEnsure', IPC.RUNTIME_ENSURE),
  ...forward('runtimeList', IPC.RUNTIME_LIST),
  ...forward('runtimeLocalStatus', IPC.RUNTIME_LOCAL_STATUS),
  ...forward('runtimeWslDistros', IPC.RUNTIME_WSL_DISTROS),
  ...forward('runtimeSshHosts', IPC.RUNTIME_SSH_HOSTS),
  ...forward('runtimePickSshKey', IPC.RUNTIME_PICK_SSH_KEY),
  ...forward('runtimeInstall', IPC.RUNTIME_INSTALL),
  ...forward('runtimeDelete', IPC.RUNTIME_DELETE),
  ...forward('runtimeRetryLocal', IPC.RUNTIME_RETRY_LOCAL),

  // Menu
  ...forward('showContextMenu', IPC.MENU_SHOW_CONTEXT),
  ...forward('getAppMenuBarItems', IPC.MENU_GET_BAR_ITEMS),

  // Auto-updater
  ...forward('getUpdateStatus', IPC.UPDATE_GET_STATUS),
  ...forward('quitAndInstallUpdate', IPC.UPDATE_QUIT_AND_INSTALL),

  // Analytics feedback
  ...forward('submitFeedback', IPC.ANALYTICS_FEEDBACK_SUBMIT),
  ...forward('getPendingFeedback', IPC.ANALYTICS_FEEDBACK_GET_PENDING),
  ...forward('acknowledgeTelemetryNotice', IPC.TELEMETRY_ACKNOWLEDGE_NOTICE),

  // Pi agent
  ...forward('agentCreate', IPC.CODING_CREATE),
  ...forward('agentPrompt', IPC.CODING_PROMPT),
  ...forward('agentSteer', IPC.CODING_STEER),
  ...forward('agentSetThinkingLevel', IPC.CODING_SET_THINKING_LEVEL),
  ...forward('agentCompact', IPC.CODING_COMPACT),
  ...forward('agentSetAutoCompaction', IPC.CODING_SET_AUTO_COMPACTION),
  ...forward('agentAbortRetry', IPC.CODING_ABORT_RETRY),
  ...forward('agentGetSessionStats', IPC.CODING_GET_SESSION_STATS),
  ...forward('agentGetState', IPC.CODING_GET_STATE),
  ...forward('agentFork', IPC.CODING_FORK),
  ...forward('agentGetForkMessages', IPC.CODING_GET_FORK_MESSAGES),
  ...forward('agentListModels', IPC.CODING_LIST_MODELS),
  ...forward('agentListSessions', IPC.CODING_LIST_SESSIONS),
  ...forward('agentLoadSessionMessages', IPC.CODING_LOAD_SESSION_MESSAGES),
  ...forward('agentDeleteSession', IPC.CODING_DELETE_SESSION),
  ...forward('agentSessionHistoryList', IPC.AGENT_SESSION_HISTORY_LIST),
  ...forward('agentSessionHistoryLoad', IPC.AGENT_SESSION_HISTORY_LOAD),
  ...forward('agentInterrupt', IPC.CODING_INTERRUPT),
  ...forward('agentDispose', IPC.CODING_DISPOSE),
  ...forward('agentSetModel', IPC.CODING_SET_MODEL),
  ...forward('agentGetCommands', IPC.CODING_GET_COMMANDS),
  ...forward('agentCustomModelsGet', IPC.CODING_CUSTOM_MODELS_GET),
  ...forward('agentCustomModelsSave', IPC.CODING_CUSTOM_MODELS_SAVE),
  ...forward('agentCustomModelsDelete', IPC.CODING_CUSTOM_MODELS_DELETE),

  // Cross-agent skills
  ...forward('skillsGetIndex', IPC.SKILLS_GET_INDEX),
  ...forward('skillsRefresh', IPC.SKILLS_REFRESH),
  ...forward('skillsGetPreview', IPC.SKILLS_GET_PREVIEW),
  ...forward('skillsInstall', IPC.SKILLS_INSTALL),
  ...forward('skillsUninstall', IPC.SKILLS_UNINSTALL),
  ...forward('skillsReinstallCateCli', IPC.SKILLS_REINSTALL_CATE_CLI),
  ...forward('skillsListInstalled', IPC.SKILLS_LIST_INSTALLED),
  ...forward('skillsListSaved', IPC.SKILLS_LIST_SAVED),
  ...forward('skillsSave', IPC.SKILLS_SAVE),
  ...forward('skillsUnsave', IPC.SKILLS_UNSAVE),
  ...forward('skillsListSources', IPC.SKILLS_LIST_SOURCES),
  ...forward('skillsAddSource', IPC.SKILLS_ADD_SOURCE),
  ...forward('skillsRemoveSource', IPC.SKILLS_REMOVE_SOURCE),
  ...forward('skillsGetToken', IPC.SKILLS_GET_TOKEN),
  ...forward('skillsSetToken', IPC.SKILLS_SET_TOKEN),

  // Extensions
  ...forward('extensionList', IPC.EXTENSION_LIST),
  ...forward('extensionEnable', IPC.EXTENSION_ENABLE),
  ...forward('extensionDisable', IPC.EXTENSION_DISABLE),
  ...forward('extensionAddSideload', IPC.EXTENSION_ADD_SIDELOAD),
  ...forward('extensionRemoveSideload', IPC.EXTENSION_REMOVE_SIDELOAD),
  ...forward('extensionCatalogRefresh', IPC.EXTENSION_CATALOG_REFRESH),
  ...forward('extensionInstall', IPC.EXTENSION_INSTALL),
  ...forward('extensionUninstall', IPC.EXTENSION_UNINSTALL),
  ...forward('extensionReinstall', IPC.EXTENSION_REINSTALL),
  ...forward('extensionUpdate', IPC.EXTENSION_UPDATE),
  ...forward('extensionAddCatalogSource', IPC.EXTENSION_ADD_CATALOG_SOURCE),
  ...forward('extensionRemoveCatalogSource', IPC.EXTENSION_REMOVE_CATALOG_SOURCE),
  ...forward('extensionCatalogSources', IPC.EXTENSION_CATALOG_SOURCES),
  ...forward('extensionProxyUrl', IPC.EXTENSION_PROXY_URL),
  ...forward('extensionServerRestart', IPC.EXTENSION_SERVER_RESTART),

  // Pi auth / providers
  ...forward('authListProviders', IPC.AUTH_LIST_PROVIDERS),
  ...forward('authStatus', IPC.AUTH_STATUS),
  ...forward('authVerify', IPC.AUTH_VERIFY),
  ...forward('authOAuthStart', IPC.AUTH_OAUTH_START),
  ...forward('authOAuthPromptReply', IPC.AUTH_OAUTH_PROMPT_REPLY),
  ...forward('authSaveApiKey', IPC.AUTH_SAVE_API_KEY),
  ...forward('authDelete', IPC.AUTH_DELETE),
} satisfies Partial<ElectronAPI>
