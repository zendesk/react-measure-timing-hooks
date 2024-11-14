const INITIAL_QUIET_WINDOW_SIZE = 5_000 // 5 seconds at FMP
const X_SECONDS = 15 // 15 seconds after FMP
const QUITE_WINDOW_SIZE_AT_X = 3_000 // 3 seconds at some specified point in time x
const MINIMUM_QUIET_WINDOW_SIZE = 1_000 // 1 second as t -> infinity

/**
 * Create a function to calculate the dynamic quiet window duration based on configurable decay points.
 * @param {Object} params - The parameters for the quiet window duration calculation.
 * @param {number} [params.D0=INITIAL_QUIET_WINDOW_SIZE] - Desired quiet window duration at FMP (in milliseconds).
 * @param {number} [params.Dx=QUITE_WINDOW_SIZE_AT_X] - Desired quiet window duration at x seconds after FMP (in milliseconds).
 * @param {number} [params.x=X_SECONDS] - Time in seconds after FMP for which Dx is specified.
 * @param {number} [params.DInfinity=MINIMUM_QUIET_WINDOW_SIZE] - Desired asymptotic quiet window duration (in milliseconds).
 * @returns A function that calculates the quiet window duration based on the current time and FMP.
 */
export const createQuietWindowDurationCalculator =
  ({
    D0 = INITIAL_QUIET_WINDOW_SIZE,
    Dx = QUITE_WINDOW_SIZE_AT_X,
    x = X_SECONDS,
    DInfinity = MINIMUM_QUIET_WINDOW_SIZE,
  }: { D0?: number; Dx?: number; x?: number; DInfinity?: number } = {}) =>
  /**
   * Calculate the dynamic quiet window duration based on configurable decay points.
   * @param {number} nowTime - The current end time in milliseconds.
   * @param {number} referenceTime - The timestamp of the First Meaningful Paint (FMP) in milliseconds.
   * @returns {number} - The required quiet window duration in milliseconds.
   */
  (nowTime: number, referenceTime: number): number => {
    const secondsPassed = (nowTime - referenceTime) / 1_000

    // Calculate the decay constant k based on the given parameters
    const decayFactor = -Math.log((Dx - DInfinity) / (D0 - DInfinity)) / x

    // Calculate the required quiet window duration at the current time
    const quietWindowDuration =
      (D0 - DInfinity) * Math.exp(-decayFactor * secondsPassed) + DInfinity

    return quietWindowDuration
  }
