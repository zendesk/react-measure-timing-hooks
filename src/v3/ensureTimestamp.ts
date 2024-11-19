/* eslint-disable prefer-destructuring */
import type { Timestamp } from './types'

const JUST_CREATED = 10

/**
 * Ensures that the input timestamp object has both epoch and performance.now() time.
 * If no input is provided, it generates a new timestamp with the current time.
 *
 * why store both timestamps?:
 * - epoch time: for reporting absolute time / correlating with backends
 * - durations: for calculating durations between two timestamps, performance.now() time makes more sense
 * - both are needed to correctly calculate a drift-adjusted epoch time
 *
 * @param input - Partial timestamp object that may contain either epoch or now or both.
 * @returns Full timestamp object with both epoch and performance.now() time.
 */
export const ensureTimestamp = (input?: Partial<Timestamp>): Timestamp => {
  const inputEpoch = input?.epoch
  const inputNow = input?.now
  const hasInputEpoch = typeof inputEpoch === 'number'
  const hasInputNow = typeof inputNow === 'number'
  const hasData = hasInputEpoch || hasInputNow
  if (!hasData) {
    // no data provided, use current time
    return {
      now: performance.now(),
      epoch: Date.now(),
    }
  }
  if (hasInputEpoch && hasInputNow) {
    return input as Timestamp
  }
  if (hasInputEpoch) {
    const differenceFromNow = Date.now() - inputEpoch
    return {
      epoch: inputEpoch,
      now:
        Math.abs(differenceFromNow) < JUST_CREATED
          ? performance.now()
          : performance.now() + differenceFromNow,
    }
  }
  if (hasInputNow) {
    const differenceFromNow = performance.now() - inputNow
    const epoch = Date.now() + differenceFromNow
    return {
      epoch,
      now: inputNow,
    }
  }
  return {
    epoch:
      input?.epoch ??
      (input?.now ? performance.timeOrigin + input.now : Date.now()),
    now:
      input?.now ??
      (input?.epoch
        ? performance.now() - (performance.timeOrigin - input.epoch)
        : performance.now()),
  }
}

// below inspired by Datadog SDK
// https://github.com/DataDog/browser-sdk/blob/16efff71b42530ead10400eb23c096b54e83fad4/packages/core/src/tools/utils/timeUtils.ts#L23-L30

/**
 * Navigation start slightly change on some rare cases
 */
let navigationStart: number | undefined

function getNavigationStart() {
  if (navigationStart === undefined) {
    navigationStart = performance.timing.navigationStart
  }
  return navigationStart
}

/**
 * Why do we need to account for drift?
 * - monotonic clock (performance.now()) is not guaranteed to be in sync with wall clock time (Date.now())
 * - Earth’s rotation speed is not constant
 * - browser bugs cause the monotonic clock to not tick when the computer is asleep or when the process is throttled
 * @see
 * - https://github.com/w3c/performance-timeline/issues/206
 * - https://dev.to/noamr/when-a-millisecond-is-not-a-millisecond-3h6
 * - https://issues.chromium.org/issues/41450546
 */
export function getEpochCorrectedForDrift({ epoch, now }: Timestamp) {
  // two different time origins
  const calculatedTimeOrigin = epoch - now
  const navigationStartEpoch = getNavigationStart()
  // apply correction only for positive drift
  if (calculatedTimeOrigin > navigationStartEpoch) {
    return Math.round(calculatedTimeOrigin + now)
  }
  return Math.round(navigationStartEpoch + now)
}
