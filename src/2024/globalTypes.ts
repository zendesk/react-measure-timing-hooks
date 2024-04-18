/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
import type { SpanKind, SpanMetadata } from './types'

type Writeable<T> = {
  -readonly [P in keyof T]: T[P]
}

export type JSONVersion<T extends PerformanceEntry> = Writeable<
  Omit<T, 'toJSON'>
>

declare global {
  interface PerformanceEntry {
    readonly detail?: unknown
    operations?: Record<string, SpanMetadata<SpanKind>>
  }
  interface PerformanceEventTiming {
    readonly entryType: 'event' | 'first-input'
  }
  interface PerformanceMark {
    readonly entryType: 'mark'
  }
  interface PerformanceMeasure {
    readonly entryType: 'measure'
  }
  interface PerformanceNavigationTiming {
    readonly entryType: 'navigation'
  }
  interface PerformancePaintTiming {
    readonly entryType: 'paint'
  }
  interface PerformanceResourceTiming {
    readonly entryType: 'resource'
  }

  // types missing from TypeScript API:

  /** https://developer.mozilla.org/en-US/docs/Web/API/PerformanceElementTiming */
  interface PerformanceElementTiming extends PerformanceEntry {
    readonly entryType: 'element'
    readonly name: 'text-paint' | 'image-paint'
    readonly duration: 0
    readonly element: Element
    /** A string which is the id of the element. */
    readonly id: string
    /** A string which is the value of the elementtiming attribute on the element */
    readonly identifier: string
    readonly intersectionRect: DOMRectReadOnly
    readonly renderTime: DOMHighResTimeStamp
    readonly loadTime: DOMHighResTimeStamp
    readonly naturalHeight: number
    readonly naturalWidth: number
    readonly url: string | '0'
  }

  interface LargestContentfulPaint extends PerformanceEntry {
    readonly entryType: 'largest-contentful-paint'
    readonly name: ''
    readonly duration: 0
    readonly element: Element
    readonly renderTime: DOMHighResTimeStamp
    readonly loadTime: DOMHighResTimeStamp
    readonly id: string | ''
    readonly url: string
  }

  /** https://developer.mozilla.org/en-US/docs/Web/API/LayoutShift */
  interface LayoutShift extends PerformanceEntry {
    readonly entryType: 'layout-shift'
    readonly name: 'layout-shift'
    readonly duration: 0
    /** Returns true if lastInputTime is less than 500 milliseconds in the past. */
    readonly hadRecentInput: boolean
    /** Returns the layout shift score calculated as the impact fraction (fraction of the viewport that was shifted) multiplied by the distance fraction (distance moved as a fraction of viewport). */
    readonly value: number
    readonly lastInputTime: DOMHighResTimeStamp
    readonly sources: LayoutShiftAttribution[]
  }

  /** https://developer.mozilla.org/en-US/docs/Web/API/LayoutShiftAttribution */
  interface LayoutShiftAttribution {
    readonly node: Node | null
    readonly previousRect: DOMRectReadOnly
    readonly currentRect: DOMRectReadOnly
  }

  interface PerformanceLongTaskTiming extends PerformanceEntry {
    readonly entryType: 'longtask'
    readonly name:
      | 'cross-origin-ancestor'
      | 'cross-origin-descendant'
      | 'cross-origin-unreachable'
      | 'multiple-contexts'
      | 'same-origin-ancestor'
      | 'same-origin-descendant'
      | 'same-origin'
      | 'self'
      | 'unknown'
    readonly attribution: TaskAttributionTiming
  }

  interface TaskAttributionTiming extends PerformanceEntry {
    readonly entryType: 'taskattribution'
    readonly name: 'unknown'
    readonly startTime: 0
    readonly duration: 0
    readonly containerType: 'iframe' | 'embed' | 'object'
    readonly containerSrc: string
    readonly containerId: string
    readonly containerName: string
  }

  interface VisibilityStateEntry extends PerformanceEntry {
    readonly entryType: 'visibility-state'
    readonly name: 'visible' | 'hidden'
    readonly duration: 0
  }
}

export type AnyPerformanceEntry =
  | PerformanceElementTiming
  | PerformanceEventTiming
  | LargestContentfulPaint
  | LayoutShift
  | PerformanceLongTaskTiming
  | PerformanceMark
  | PerformanceMeasure
  | PerformanceNavigationTiming
  | PerformancePaintTiming
  | PerformanceResourceTiming
  | TaskAttributionTiming
  | VisibilityStateEntry

/** https://developer.mozilla.org/en-US/docs/Web/API/PerformanceEntry/entryType#element */
export type PerformanceEntryType = AnyPerformanceEntry['entryType']

// type PerformanceEntryType =
//   | 'element'
//   | 'event'
//   | 'first-input'
//   | 'largest-contentful-paint'
//   | 'layout-shift'
//   | 'longtask'
//   | 'mark'
//   | 'measure'
//   | 'navigation'
//   | 'paint'
//   | 'resource'
//   | 'taskattribution'
//   | 'visibility-state'
