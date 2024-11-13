const QUIET_WINDOW_DURATION = 2_000 // 2 seconds
const CLUSTER_PADDING = 1_000 // 1 second
const HEAVY_CLUSTER_THRESHOLD = 250 // 250ms

export function createCPUIdleProcessor(fmp: number) {
  let possibleFirstCPUIdleTimestamp = fmp
  let longTaskClusterDurationTotal = 0 // Total duration of the current long task cluster
  let endTimeStampOfLastLongTask: number | null = null // End timestamp of the last long task

  return function processPerformanceEntry(
    entry: PerformanceEntry,
  ): number | undefined {
    const entryEndTime = entry.startTime + entry.duration // Calculate the end time of the current entry

    // If this is the first long task
    if (endTimeStampOfLastLongTask === null) {
      // Check if a quiet window has passed since the last long task
      if (
        entry.startTime - possibleFirstCPUIdleTimestamp >
        QUIET_WINDOW_DURATION
      ) {
        return possibleFirstCPUIdleTimestamp // Return the first CPU idle timestamp if in a quiet window
      }
      // Update the end timestamp of the last long task and initialize the cluster
      endTimeStampOfLastLongTask = entryEndTime
      // if this longtask overlaps FMP, then update the first CPU idle timestamp as if it were a heavy cluster
      if (entry.startTime - fmp < 0) {
        longTaskClusterDurationTotal =
          entry.duration - Math.abs(entry.startTime - fmp)
        possibleFirstCPUIdleTimestamp = endTimeStampOfLastLongTask // Move to the end of the cluster
      } else {
        longTaskClusterDurationTotal = entry.duration
      }
      return undefined // No quiet window found yet
    }

    // Calculate time since the last long task
    const gapSincePreviousTask = entry.startTime - endTimeStampOfLastLongTask

    if (gapSincePreviousTask < CLUSTER_PADDING) {
      // Continue to expand the existing cluster
      // If less than 1 second since the last long task
      // Include the time passed since the last long task in the cluster duration
      longTaskClusterDurationTotal += gapSincePreviousTask + entry.duration
      endTimeStampOfLastLongTask = entryEndTime // Update the end timestamp of the last long task

      // If the cluster duration exceeds 250ms, update the first CPU idle timestamp
      if (longTaskClusterDurationTotal >= HEAVY_CLUSTER_THRESHOLD) {
        // Met criteria for Heavy Cluster
        possibleFirstCPUIdleTimestamp = endTimeStampOfLastLongTask // Move to the end of the cluster
      }
    } else {
      // the case where we either going to start a new cluster or quiet window passed

      // If no new long tasks have occurred in the last 1 second
      // then we found our First CPU Idle
      if (
        entry.startTime - possibleFirstCPUIdleTimestamp >
        QUIET_WINDOW_DURATION
      ) {
        return possibleFirstCPUIdleTimestamp
      }
      // Start a new cluster
      longTaskClusterDurationTotal = entry.duration // Reset the cluster duration with the current task
      endTimeStampOfLastLongTask = entryEndTime // Update the end timestamp of the last long task
      // possibleFirstCPUIdleTimestamp remains unchanged,
      // because we don't know if it's a light or heavy cluster yet
    }

    return undefined // No quiet window found
  }
}
