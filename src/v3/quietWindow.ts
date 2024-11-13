const QUIET_WINDOW_DURATION = 2_000 // 2 seconds
const CLUSTER_PADDING = 1_000 // 1 second
const HEAVY_CLUSTER_THRESHOLD = 250 // 250ms

const isLongTask = (entry: PerformanceEntry) =>
  entry.entryType === 'longtask' || entry.entryType === 'long-animation-frame'

export function createCPUIdleProcessor(
  fmp: number,
  getQuietWindowDuration?: (currentEndTime: number, fmp: number) => number,
) {
  let possibleFirstCPUIdleTimestamp = fmp
  let longTaskClusterDurationTotal = 0 // Total duration of the current long task cluster
  let endTimeStampOfLastLongTask: number | null = null // End timestamp of the last long task

  return function processPerformanceEntry(
    entry: PerformanceEntry,
  ): number | undefined {
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
        return possibleFirstCPUIdleTimestamp // Return the first CPU idle timestamp if in a quiet window
      }
      if (isEntryLongTask) {
        // Update the end timestamp of the last long task and initialize the cluster
        endTimeStampOfLastLongTask = entryEndTime
        // if this longtask overlaps FMP, then push the first CPU idle timestamp to the end of it
        if (entry.startTime - fmp < 0) {
          longTaskClusterDurationTotal =
            entry.duration - Math.abs(entry.startTime - fmp)
          possibleFirstCPUIdleTimestamp = endTimeStampOfLastLongTask // Move to the end of the cluster
        } else {
          longTaskClusterDurationTotal = entry.duration
        }
      }
      return undefined
    }

    // Calculate time since the last long task
    const gapSincePreviousTask = entry.startTime - endTimeStampOfLastLongTask

    if (isEntryLongTask && gapSincePreviousTask < CLUSTER_PADDING) {
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
      // either the quiet window has passed, or we're going to start a new long task cluster

      // If no new long tasks have occurred in the last quietWindowDuration
      // then we found our First CPU Idle
      if (
        entry.startTime - possibleFirstCPUIdleTimestamp >
        quietWindowDuration
      ) {
        return possibleFirstCPUIdleTimestamp
      }

      if (isEntryLongTask) {
        // Start a new cluster
        longTaskClusterDurationTotal = entry.duration // Reset the cluster duration with the current task
        endTimeStampOfLastLongTask = entryEndTime // Update the end timestamp of the last long task
        // possibleFirstCPUIdleTimestamp remains unchanged,
        // because we don't know if it's a light or heavy cluster yet
      }
    }

    return undefined
  }
}

// Constants for the quiet window exponential decay calculation
const INITIAL_QUIET_WINDOW_SIZE = 5_000 // 5 seconds in milliseconds
const MINIMUM_QUIET_WINDOW_SIZE = 1_000 // 1 second in milliseconds
// eslint-disable-next-line no-magic-numbers
const DECAY_RATE = Math.log(2) / 15 // Derived from 1/15 * log(2)

/**
 * Calculate the dynamic quiet window duration based on the time since FMP.
 *
 * @param {number} currentEndTime - The current end time of the window being considered.
 * @param {number} fmp - The timestamp of the First Meaningful Paint (FMP).
 * @returns {number} - The required quiet window duration in milliseconds.
 */
export function getDynamicQuietWindowDuration(
  currentEndTime: number,
  fmp: number,
): number {
  // Time elapsed since FMP
  const timeSinceFMP = currentEndTime - fmp

  // Calculate the required quiet window size based on the exponential decay formula
  const quietWindowDuration =
    INITIAL_QUIET_WINDOW_SIZE * Math.exp((-DECAY_RATE * timeSinceFMP) / 1_000) +
    MINIMUM_QUIET_WINDOW_SIZE

  // Ensure the duration does not drop below the minimum
  return Math.max(quietWindowDuration, MINIMUM_QUIET_WINDOW_SIZE)
}
