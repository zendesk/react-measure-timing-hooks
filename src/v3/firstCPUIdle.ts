const QUIET_WINDOW_DURATION = 2_000 // 2 seconds
const CLUSTER_PADDING = 1_000 // 1 second
const HEAVY_CLUSTER_THRESHOLD = 250 // 250ms

export interface PerformanceEntryLike {
  entryType: string
  startTime: number
  duration: number
}

export type CPUIdleLongTaskProcessor<T extends number | PerformanceEntryLike> =
  (
    entry: T extends PerformanceEntryLike ? T : PerformanceEntryLike,
  ) => T | undefined

export interface CPUIdleProcessorOptions {
  getQuietWindowDuration?: (currentEndTime: number, fmp: number) => number
  clusterPadding?: number
  heavyClusterThreshold?: number
}

const isLongTask = (entry: PerformanceEntryLike) =>
  entry.entryType === 'longtask' || entry.entryType === 'long-animation-frame'

export function createCPUIdleProcessor<T extends number | PerformanceEntryLike>(
  fmpOrEntry: T,
  {
    clusterPadding = CLUSTER_PADDING,
    heavyClusterThreshold = HEAVY_CLUSTER_THRESHOLD,
    getQuietWindowDuration,
  }: CPUIdleProcessorOptions = {},
): CPUIdleLongTaskProcessor<T> {
  const fmp =
    typeof fmpOrEntry === 'number'
      ? fmpOrEntry
      : fmpOrEntry.startTime + fmpOrEntry.duration
  let possibleFirstCPUIdleTimestamp = fmp
  let possibleFirstCPUIdleEntry: PerformanceEntryLike | null =
    typeof fmpOrEntry === 'number' ? null : fmpOrEntry
  let longTaskClusterDurationTotal = 0 // Total duration of the current long task cluster
  let endTimeStampOfLastLongTask: number | null = null // End timestamp of the last long task
  let lastLongTask: PerformanceEntryLike | null = null

  const returnType = typeof fmpOrEntry === 'number' ? 'number' : 'object'

  // TODO: if a longtask straddles the FMP, then we should push the first CPU idle timestamp to the end of it
  // TODO: potentially assume that FMP point is as if inside of a heavy cluster already
  return function processPerformanceEntry(
    entry: PerformanceEntryLike,
  ): T | undefined {
    const entryEndTime = entry.startTime + entry.duration
    const isEntryLongTask = isLongTask(entry)
    const quietWindowDuration =
      getQuietWindowDuration?.(entryEndTime, fmp) ?? QUIET_WINDOW_DURATION

    // If this is the first long task
    if (endTimeStampOfLastLongTask === null) {
      // Check if a quiet window has passed since the last long task
      if (
        entry.startTime - possibleFirstCPUIdleTimestamp >
        quietWindowDuration
      ) {
        // Return the first CPU idle timestamp if in a quiet window
        return (
          returnType === 'object'
            ? possibleFirstCPUIdleEntry
            : possibleFirstCPUIdleTimestamp
        ) as T
      }
      if (isEntryLongTask) {
        // Update the end timestamp of the last long task and initialize the cluster
        endTimeStampOfLastLongTask = entryEndTime
        lastLongTask = entry
        // if this longtask overlaps FMP, then push the first CPU idle timestamp to the end of it
        if (entry.startTime - fmp < 0) {
          longTaskClusterDurationTotal =
            entry.duration - Math.abs(entry.startTime - fmp)

          if (endTimeStampOfLastLongTask > fmp) {
            // Move to the end of the cluster:
            possibleFirstCPUIdleTimestamp = endTimeStampOfLastLongTask
            possibleFirstCPUIdleEntry = entry
          }
        } else {
          longTaskClusterDurationTotal = entry.duration
        }
      }
      return undefined
    }

    // Calculate time since the last long task
    const gapSincePreviousTask = entry.startTime - endTimeStampOfLastLongTask

    if (
      isEntryLongTask &&
      gapSincePreviousTask < clusterPadding &&
      gapSincePreviousTask > 0
    ) {
      // Continue to expand the existing cluster
      // If less than 1 second since the last long task
      // Include the time passed since the last long task in the cluster duration
      longTaskClusterDurationTotal += gapSincePreviousTask + entry.duration
      endTimeStampOfLastLongTask = entryEndTime // Update the end timestamp of the last long task
      lastLongTask = entry

      // If the cluster duration exceeds 250ms, update the first CPU idle timestamp
      if (
        longTaskClusterDurationTotal >= heavyClusterThreshold &&
        endTimeStampOfLastLongTask > fmp
      ) {
        // Met criteria for Heavy Cluster
        // Move to the end of the cluster
        possibleFirstCPUIdleTimestamp = endTimeStampOfLastLongTask
        possibleFirstCPUIdleEntry = lastLongTask
      }
    } else {
      // either the quiet window has passed, or we're going to start a new long task cluster

      // If no new long tasks have occurred in the last quietWindowDuration
      // then we found our First CPU Idle
      if (
        entry.startTime - possibleFirstCPUIdleTimestamp >
        quietWindowDuration
      ) {
        return (
          returnType === 'object'
            ? possibleFirstCPUIdleEntry
            : possibleFirstCPUIdleTimestamp
        ) as T
      }

      if (isEntryLongTask) {
        // Start a new cluster
        longTaskClusterDurationTotal = entry.duration // Reset the cluster duration with the current task
        endTimeStampOfLastLongTask = entryEndTime // Update the end timestamp of the last long task
        lastLongTask = entry
        // possibleFirstCPUIdleTimestamp remains unchanged,
        // because we don't know if it's a light or heavy cluster yet
      }
    }

    return undefined
  }
}
