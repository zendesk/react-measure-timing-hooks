/**
 * Copyright Zendesk, Inc.
 *
 * Use of this source code is governed under the Apache License, Version 2.0
 * found at http://www.apache.org/licenses/LICENSE-2.0.
 */

const getTimingMarkName = (name: string) => `useTiming: ${name}`

export const performanceMark = (
  name: string,
  markOptions?: PerformanceMarkOptions,
): PerformanceMark => {
  // We want to use performance.mark, instead of performance.now or Date.now,
  // because those named metrics will then show up in the profiler and in Lighthouse audits
  // see: https://web.dev/user-timings/
  // incidentally, this also makes testing waaay easier, because we don't have to deal with timestamps

  // Since old browsers (like >1yr old Firefox/Gecko) unfortunately behaves differently to other browsers,
  // in that it doesn't immediately return the instance of PerformanceMark object
  // so we sort-of polyfill it cheaply below.
  // see: https://bugzilla.mozilla.org/show_bug.cgi?id=1724645
  const markName = getTimingMarkName(name)

  try {
    const mark = performance.mark(markName, markOptions)
    if (mark) return mark
  } catch {
    // do nothing, polyfill below
  }

  // polyfill:
  return {
    name: markName,
    duration: 0,
    startTime: markOptions?.startTime ?? performance.now(),
    entryType: 'mark',
    toJSON: () => ({}),
    detail: null,
  }
}

export const performanceMeasure = (
  name: string,
  startMark: PerformanceEntry,
  endMark?: PerformanceEntry,
): PerformanceMeasure => {
  // same story as above
  const measureName = getTimingMarkName(name)
  const end = endMark ? endMark.startTime + endMark.duration : performance.now()

  // some old browsers might not like performance.measure / performance.mark
  // we don't want to crash due to reporting, so we'll polyfill instead
  try {
    const measure = performance.measure(measureName, {
      start: startMark.startTime,
      end,
    })

    if (measure) return measure
  } catch {
    // do nothing, polyfill below
  }

  return {
    name: measureName,
    duration: end - startMark.startTime,
    startTime: startMark.startTime,
    entryType: 'measure',
    toJSON: () => ({}),
    detail: null,
  }
}
