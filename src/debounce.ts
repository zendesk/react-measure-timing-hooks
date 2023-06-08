/**
 * Copyright Zendesk, Inc.
 *
 * Use of this source code is governed under the Apache License, Version 2.0
 * found at http://www.apache.org/licenses/LICENSE-2.0.
 */

export const DebounceReason = Symbol('debounce')
export const TimeoutReason = Symbol('timeout')

export type FlushReason = typeof DebounceReason | typeof TimeoutReason | string
type FnToBeDebounced<Args extends readonly unknown[]> = (
  ...args: [...args: Args, flushReason: FlushReason]
) => boolean | undefined | void

export interface DebounceOptionsRef<Args extends readonly unknown[]> {
  fn: FnToBeDebounced<Args>
  debounceMs: number
  timeoutMs?: number
}

export type DebouncedFn<Args extends readonly unknown[]> = ((
  ...args: Args
) => void) & {
  cancel: () => void
  reset: () => Args | undefined
  flush: (reason?: FlushReason) => boolean
  getIsScheduled: () => boolean
}

/**
 * A simple debounce function that is easier to test against than the lodash one.
 * In addition it offers a way to check whether the last call was due to a timeout or not,
 * and a way to manually clear that timeout state.
 * Options may change even after the debounce was created by the means of a ref.
 */
export const debounce = <Args extends readonly unknown[]>(
  optionsRef: DebounceOptionsRef<Args>,
): DebouncedFn<Args> => {
  let timeoutTimer: ReturnType<typeof setTimeout> | undefined
  let debounceTimer: ReturnType<typeof setTimeout> | undefined
  let lastArgs: Args | undefined
  const cancel = () => {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = undefined
  }
  const reset = () => {
    cancel()

    if (timeoutTimer) clearTimeout(timeoutTimer)
    timeoutTimer = undefined

    const args = lastArgs
    lastArgs = undefined

    return args
  }
  const flush = (reason: FlushReason = 'manual') => {
    const args = lastArgs
    if (args) {
      const shouldKeepTimeout = optionsRef.fn(...args, reason)
      if (shouldKeepTimeout) {
        cancel()
      } else {
        reset()
      }

      return true
    }

    reset()
    return false
  }

  const getIsScheduled = () => Boolean(debounceTimer) || Boolean(timeoutTimer)

  return Object.assign(
    (...args: Args) => {
      lastArgs = args
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(
        () => flush(DebounceReason),
        optionsRef.debounceMs,
      )
      if (!timeoutTimer && typeof optionsRef.timeoutMs === 'number') {
        timeoutTimer = setTimeout(() => {
          flush(TimeoutReason)
        }, optionsRef.timeoutMs)
      }
    },
    {
      flush,
      cancel,
      reset,
      getIsScheduled,
    },
  )
}
