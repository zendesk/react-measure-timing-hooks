const DEFAULT_QUIET_WINDOW_DURATION = 2_000 // Google used 2 seconds
const DEFAULT_CLUSTER_PADDING = 1_000 // Google used 1 second
const DEFAULT_HEAVY_CLUSTER_THRESHOLD = 250 // Google used 250ms

export interface PerformanceEntryLike {
  entryType: string
  startTime: number
  duration: number
}

export type CPUIdleLongTaskProcessorFn<
  T extends number | PerformanceEntryLike,
> = (
  entry: T extends PerformanceEntryLike ? T : PerformanceEntryLike,
) => checkIfQuietWindowPassedResult<T>

export type checkIfQuietWindowPassedResult<
  T extends number | PerformanceEntryLike,
> =
  | {
      firstCpuIdle: T
    }
  | {
      /** time from timeOrigin when we can check next if we've passed quiet window yet or not */
      nextCheck: number
    }

export interface CPUIdleLongTaskProcessor<
  T extends number | PerformanceEntryLike,
> {
  processPerformanceEntry: CPUIdleLongTaskProcessorFn<T>
  checkIfQuietWindowPassed: (
    time: number,
    quietWindowDuration?: number,
  ) => checkIfQuietWindowPassedResult<T>
}

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
    clusterPadding = DEFAULT_CLUSTER_PADDING,
    heavyClusterThreshold = DEFAULT_HEAVY_CLUSTER_THRESHOLD,
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

  function checkIfQuietWindowPassed(
    time: number,
    quietWindowDuration = getQuietWindowDuration?.(time, fmp) ??
      DEFAULT_QUIET_WINDOW_DURATION,
  ): checkIfQuietWindowPassedResult<T> {
    if (time - possibleFirstCPUIdleTimestamp > quietWindowDuration) {
      // Return the first CPU idle timestamp if in a quiet window
      return {
        firstCpuIdle: (returnType === 'object'
          ? possibleFirstCPUIdleEntry
          : possibleFirstCPUIdleTimestamp) as T,
      }
    }

    return { nextCheck: time + quietWindowDuration }
  }

  // TODO: if a longtask straddles the FMP, then we should push the first CPU idle timestamp to the end of it
  // TODO: potentially assume that FMP point is as if inside of a heavy cluster already
  function processPerformanceEntry(
    entry: PerformanceEntryLike,
  ): checkIfQuietWindowPassedResult<T> {
    const entryEndTime = entry.startTime + entry.duration
    const isEntryLongTask = isLongTask(entry)
    const quietWindowDuration =
      getQuietWindowDuration?.(entryEndTime, fmp) ??
      DEFAULT_QUIET_WINDOW_DURATION

    const quietWindowCheck = checkIfQuietWindowPassed(
      // is not processing a long task, we can assume current clock time is the end time
      isEntryLongTask ? entry.startTime : entryEndTime,
      quietWindowDuration,
    )

    if (endTimeStampOfLastLongTask === null) {
      // Check if a quiet window has passed without seeing any long tasks
      if ('firstCpuIdle' in quietWindowCheck) {
        return quietWindowCheck
      }

      // If this is the first long task
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
      return quietWindowCheck
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
      if ('firstCpuIdle' in quietWindowCheck) {
        return quietWindowCheck
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

    return quietWindowCheck
  }

  return {
    processPerformanceEntry,
    checkIfQuietWindowPassed,
  }
}
