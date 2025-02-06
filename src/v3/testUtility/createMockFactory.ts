import { SpanAndAnnotation, SpanAnnotation } from '../spanAnnotationTypes'
import { Span } from '../spanTypes'
import type { Timestamp } from '../types'

const EPOCH_START = 1_000

export const createTimestamp = (now: number): Timestamp => ({
  epoch: EPOCH_START + now,
  now,
})

export type AnyScope = Record<string, unknown>

export const createAnnotation = (
  span: Span<AnyScope>,
  traceStartTime: Timestamp,
  partial: Partial<SpanAnnotation> = {},
): SpanAnnotation => ({
  id: 'test-id',
  operationRelativeStartTime: span.startTime.now - traceStartTime.now,
  operationRelativeEndTime:
    span.startTime.now + span.duration - traceStartTime.now,
  occurrence: 1,
  recordedInState: 'active',
  labels: [],
  ...partial,
})

export const createMockSpan = <TSpan extends Span<AnyScope>>(
  startTimeNow: number,
  partial: Partial<TSpan>,
): TSpan =>
  (partial.type === 'component-render'
    ? {
        name: 'test-component',
        type: 'component-render',
        scope: {},
        startTime: createTimestamp(startTimeNow),
        duration: 100,
        attributes: {},
        isIdle: true,
        renderCount: 1,
        renderedOutput: 'content',
        ...partial,
      }
    : {
        name: 'test-span',
        type: 'mark',
        startTime: createTimestamp(startTimeNow),
        duration: 100,
        attributes: {},
        ...partial,
      }) as TSpan

export const createMockSpanAndAnnotation = <TSpan extends Span<AnyScope>>(
  startTimeNow: number,
  spanPartial: Partial<TSpan> = {},
  annotationPartial: Partial<SpanAnnotation> = {},
): SpanAndAnnotation<AnyScope> => {
  const span = createMockSpan<TSpan>(startTimeNow, spanPartial)
  return {
    span,
    annotation: createAnnotation(span, createTimestamp(0), annotationPartial),
  }
}
