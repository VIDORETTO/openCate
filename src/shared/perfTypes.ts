// =============================================================================
// Shared performance-profiler contracts.
// =============================================================================

export interface PerfProcSample {
  type: string
  pid: number
  /** percentCPUUsage since last sample (relative to one core; may exceed 100). */
  cpu: number
  /** working-set memory in MB. */
  memMB: number
}

export interface PerfSnapshot {
  /** Sampling window in ms; all rates below are per-second. */
  windowMs: number
  focused: boolean
  totalCpu: number
  procs: PerfProcSample[]
  spawnsPerSec: Record<string, number>
  /** Logical process-monitor scan work; this also covers daemon-hosted and
   *  /proc-backed scans that do not fork a child. */
  monitorWorkPerSec: Record<string, number>
  ipc: Array<{ channel: string; kbPerSec: number; callsPerSec: number }>
  terminal: { kbPerSec: number; chunksPerSec: number }
}
