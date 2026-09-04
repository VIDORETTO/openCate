import { BrowserWindow } from 'electron'

// Under Playwright (CATE_E2E=1) a normal show() opens the window on the user's
// active screen and steals focus — and on macOS a *shown* window can't be kept
// off-screen (off-screen coordinates get clamped back onto a display). So the
// normal E2E path never shows the window: it is never mapped to a display, and
// Playwright drives the renderer over CDP. A hidden or inactive window throttles
// rAF, though, so the opt-in CATE_PERF path activates it; performance specs then
// measure real compositor cadence while ordinary E2Es stay hidden.
export const IS_E2E = process.env.CATE_E2E === '1'

/** Reveal a window. E2E performance runs need an active compositor for real rAF;
 * all other E2E runs remain hidden and are driven over CDP. */
export function revealWindow(win: BrowserWindow, opts: { focus?: boolean } = {}): void {
  try {
    if (IS_E2E) {
      if (process.env.CATE_PERF !== '1') return // keep ordinary E2Es off-screen
      win.show() // hidden/inactive windows are throttled on the Windows runner
      return
    }
    win.show()
    if (opts.focus) win.focus()
  } catch {
    /* window may already be destroyed */
  }
}
