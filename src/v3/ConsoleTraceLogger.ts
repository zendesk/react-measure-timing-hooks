import type {
  AllPossibleRequiredSpanSeenEvents,
  AllPossibleStateTransitionEvents,
  AllPossibleTraceStartEvents,
} from './debugTypes'
import type { SpanMatcherFn } from './matchSpan'
import type { OnEnterStatePayload } from './Trace'
import { isTerminalState } from './Trace'
import type { TraceManager } from './TraceManager'
import type {
  DraftTraceContext,
  RelationSchemasBase,
  TraceInterruptionReason,
} from './types'

type LoggerFn = (message: string) => void

/**
 * Options for configuring the ConsoleTraceLogger
 */
export interface ConsoleTraceLoggerOptions {
  /** Custom log function to use instead of console.log */
  logFn?: LoggerFn
  /** Whether to enable verbose logging with more details */
  verbose?: boolean
  /** Prefix added to all log messages */
  prefix?: string
  /** Maximum string length for attributes/relatedTo objects */
  maxObjectStringLength?: number
}

const MAX_SERIALIZED_OBJECT_LENGTH = 500

/**
 * Information about the currently active trace
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface TraceInfo<RelationSchemasT> {
  id: string
  name: string
  variant: string
  startTime: number
  attributes?: Record<string, unknown>
  relatedTo?: Record<string, unknown>
  requiredSpans: { name: string; isMatched: boolean; matcher: Function }[]
}

/**
 * Extract timing offsets from a transition object
 */
const extractTimingOffsets = <RelationSchemasT>(
  transition: OnEnterStatePayload<RelationSchemasT>,
) => {
  let lastRequiredSpanOffset: number | undefined
  let completeSpanOffset: number | undefined
  let cpuIdleSpanOffset: number | undefined

  if (
    'lastRequiredSpanAndAnnotation' in transition &&
    transition.lastRequiredSpanAndAnnotation
  ) {
    lastRequiredSpanOffset =
      transition.lastRequiredSpanAndAnnotation.annotation
        .operationRelativeEndTime
  }

  if (
    'completeSpanAndAnnotation' in transition &&
    transition.completeSpanAndAnnotation
  ) {
    completeSpanOffset =
      transition.completeSpanAndAnnotation.annotation.operationRelativeEndTime
  }

  if (
    'cpuIdleSpanAndAnnotation' in transition &&
    transition.cpuIdleSpanAndAnnotation
  ) {
    cpuIdleSpanOffset =
      transition.cpuIdleSpanAndAnnotation.annotation.operationRelativeEndTime
  }

  return { lastRequiredSpanOffset, completeSpanOffset, cpuIdleSpanOffset }
}

/**
 * Format timestamp to readable time
 */
const formatTimestamp = (timestamp: number): string =>
  new Date(timestamp).toISOString().split('T')[1]!.slice(0, -1)

/**
 * Check if two objects are different by comparing their JSON representation
 */
const objectsAreDifferent = (
  obj1?: Record<string, unknown>,
  obj2?: Record<string, unknown>,
): boolean => {
  if (!obj1 && !obj2) return false
  if (!obj1 || !obj2) return true
  return JSON.stringify(obj1) !== JSON.stringify(obj2)
}

/**
 * A utility for logging trace information to the console
 * Similar to TraceManagerDebugger but for console output
 */
export function createConsoleTraceLogger<
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
>(
  traceManager: TraceManager<RelationSchemasT>,
  options: ConsoleTraceLoggerOptions = {},
) {
  const {
    // eslint-disable-next-line no-console
    logFn = console.log,
    verbose = false,
    prefix = '[Trace]',
    maxObjectStringLength = MAX_SERIALIZED_OBJECT_LENGTH,
  } = options

  // Keep track of active trace
  let currentTraceInfo: TraceInfo<RelationSchemasT> | null = null

  // Store subscriptions for cleanup
  const subscriptions: { unsubscribe: () => void }[] = []

  // Helper Functions
  // ---------------

  /**
   * Truncate objects to prevent huge logs
   */
  const truncateObject = (obj?: Record<string, unknown>): string => {
    if (!obj) return 'undefined'
    const str = JSON.stringify(obj)
    if (str.length <= maxObjectStringLength) return str
    return `${str.slice(0, Math.max(0, maxObjectStringLength - 3))}...`
  }

  /**
   * Log a message with the prefix
   */
  const log = (message: string) => {
    logFn(`${prefix} ${message}`)
  }

  /**
   * Format time relative to trace start
   */
  const formatRelativeTime = (offset?: number): string => {
    if (offset === undefined) return 'N/A'
    return `+${offset.toFixed(2)}ms`
  }

  /**
   * Get string representation of required spans count
   */
  const getRequiredSpansCount = (): string => {
    if (!currentTraceInfo) return '0/0'
    return `${
      currentTraceInfo.requiredSpans.filter((span) => span.isMatched).length
    }/${currentTraceInfo.requiredSpans.length}`
  }

  /**
   * Create a required span entry from a matcher function
   */
  const createRequiredSpanEntry = (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    matcher: SpanMatcherFn<any, RelationSchemasT, any>,
    index: number,
  ): {
    name: string
    isMatched: boolean
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    matcher: SpanMatcherFn<any, RelationSchemasT, any>
  } => {
    const name = matcher.fromDefinition
      ? JSON.stringify(matcher.fromDefinition)
      : `Matcher #${index}`

    return {
      name,
      matcher,
      isMatched: false,
    }
  }

  /**
   * Handle changes in attributes, relatedTo, or requiredSpans
   */
  const handleStateChanges = <K extends keyof RelationSchemasT>(
    trace: DraftTraceContext<K, RelationSchemasT, string>,
  ): void => {
    if (!currentTraceInfo) return

    // Check for attribute changes
    const currentAttributes = trace.input.attributes
    if (
      currentAttributes &&
      objectsAreDifferent(currentAttributes, currentTraceInfo.attributes)
    ) {
      log(`   Attributes changed: ${truncateObject(currentAttributes)}`)
      currentTraceInfo.attributes = currentAttributes
    }

    // Check for relatedTo changes
    const currentRelatedTo = trace.input.relatedTo
    if (
      currentRelatedTo &&
      objectsAreDifferent(currentRelatedTo, currentTraceInfo.relatedTo)
    ) {
      log(`   Related to changed: ${truncateObject(currentRelatedTo)}`)
      currentTraceInfo.relatedTo = currentRelatedTo
    }

    // Check for new required spans
    const currentRequiredSpans = trace.definition.requiredSpans
    if (currentRequiredSpans.length !== currentTraceInfo.requiredSpans.length) {
      const existingMatchers = new Set(
        currentTraceInfo.requiredSpans.map((span) => span.matcher),
      )
      const newSpans = currentRequiredSpans
        .filter((matcher) => !existingMatchers.has(matcher))
        .map((matcher, index) => createRequiredSpanEntry(matcher, index))

      if (newSpans.length > 0) {
        log(`   Required spans added: ${newSpans.length} new spans`)
        if (verbose) {
          newSpans.forEach((span) => {
            log(`   - ${span.name}`)
          })
        }

        // Add new spans to the tracking array
        currentTraceInfo.requiredSpans = [
          ...currentTraceInfo.requiredSpans,
          ...newSpans,
        ]
      }
    }
  }

  /**
   * Log timing information for a terminal state
   */
  const logTimingInfo = (transition: OnEnterStatePayload<RelationSchemasT>) => {
    if (!verbose) return

    const { lastRequiredSpanOffset, completeSpanOffset, cpuIdleSpanOffset } =
      extractTimingOffsets(transition)

    if (completeSpanOffset !== undefined) {
      log(`   Duration: ${formatRelativeTime(completeSpanOffset)}`)
    }
    if (lastRequiredSpanOffset !== undefined) {
      log(
        `   Last required span: ${formatRelativeTime(lastRequiredSpanOffset)}`,
      )
    }
    if (completeSpanOffset !== undefined) {
      log(`   Complete span: ${formatRelativeTime(completeSpanOffset)}`)
    }
    if (cpuIdleSpanOffset !== undefined) {
      log(`   CPU idle: ${formatRelativeTime(cpuIdleSpanOffset)}`)
    }

    // Log matched spans count
    log(`   Required spans: ${getRequiredSpansCount()} spans matched`)
  }

  // Event handlers
  // --------------

  /**
   * Handle trace start event
   */
  const handleTraceStart = (
    event: AllPossibleTraceStartEvents<RelationSchemasT>,
  ) => {
    const trace = event.traceContext
    const traceName = trace.definition.name
    const traceVariant = trace.input.variant
    const traceId = trace.input.id

    // Create required spans array
    const requiredSpans = trace.definition.requiredSpans.map((matcher, index) =>
      createRequiredSpanEntry(matcher, index),
    )

    // Store current trace info
    currentTraceInfo = {
      id: traceId,
      name: traceName,
      variant: traceVariant,
      startTime: trace.input.startTime.epoch,
      attributes: trace.input.attributes,
      relatedTo: trace.input.relatedTo,
      requiredSpans,
    }

    log(`⏳ Trace started: ${traceName} (${traceVariant}) [${traceId}]`)

    if (verbose) {
      log(`   Started at: ${formatTimestamp(trace.input.startTime.epoch)}`)
      if (trace.input.attributes) {
        log(`   Attributes: ${truncateObject(trace.input.attributes)}`)
      }
      if (trace.input.relatedTo) {
        log(`   Related to: ${truncateObject(trace.input.relatedTo)}`)
      }
      log(`   Required spans: ${requiredSpans.length}`)
    }
  }

  /**
   * Handle state transition event
   */
  const handleStateTransition = (
    event: AllPossibleStateTransitionEvents<RelationSchemasT>,
  ) => {
    const trace = event.traceContext
    const transition = event.stateTransition
    const traceName = trace.definition.name
    const traceState = transition.transitionToState
    const previousState = transition.transitionFromState

    if (!currentTraceInfo) return

    // Log state transition
    log(`↪️ Trace ${traceName} state changed: ${previousState} → ${traceState}`)

    // Check for changes in attributes, relatedTo, and requiredSpans
    handleStateChanges(trace)

    // For terminal states, add to history and clear current
    if (isTerminalState(traceState)) {
      const stateEmoji = traceState === 'complete' ? '✅' : '❌'

      // Get interruption reason if applicable
      let interruptionReason: TraceInterruptionReason | undefined
      if ('interruptionReason' in transition) {
        // eslint-disable-next-line prefer-destructuring
        interruptionReason = transition.interruptionReason
      }

      // Log completion details
      log(
        `${stateEmoji} Trace ${traceName} ${traceState}${
          interruptionReason ? ` (${interruptionReason})` : ''
        }`,
      )

      // Log timing information if verbose
      logTimingInfo(transition)

      // Clear current trace
      currentTraceInfo = null
    }
  }

  /**
   * Handle required span seen event
   */
  const handleRequiredSpanSeen = (
    event: AllPossibleRequiredSpanSeenEvents<RelationSchemasT>,
  ) => {
    const matchedSpan = event.spanAndAnnotation
    const { matcher } = event

    if (!currentTraceInfo) return

    const name = matcher.fromDefinition
      ? JSON.stringify(matcher.fromDefinition)
      : `Matcher Function`

    // Update the required spans array
    currentTraceInfo.requiredSpans.forEach((span) => {
      if (span.matcher === matcher) {
        // eslint-disable-next-line no-param-reassign
        span.isMatched = true
      }
    })

    // Log the match
    log(
      `🔹 Matched required span: ${name} (${getRequiredSpansCount()} spans matched)`,
    )

    if (verbose) {
      log(
        `   At time: ${formatRelativeTime(
          matchedSpan.annotation.operationRelativeStartTime,
        )}`,
      )
      if (matchedSpan.span.name) {
        log(
          `   Span name / type: ${matchedSpan.span.name} / ${matchedSpan.span.type}`,
        )
      }
    }
  }

  // Set up event subscriptions
  // --------------------------

  // Subscribe to trace start events
  const traceStartSubscription = traceManager
    .when('trace-start')
    .subscribe(handleTraceStart)
  subscriptions.push(traceStartSubscription)

  // Subscribe to state transition events
  const stateTransitionSubscription = traceManager
    .when('state-transition')
    .subscribe(handleStateTransition)
  subscriptions.push(stateTransitionSubscription)

  // Subscribe to required span seen events
  const spanSeenSubscription = traceManager
    .when('required-span-seen')
    .subscribe(handleRequiredSpanSeen)
  subscriptions.push(spanSeenSubscription)

  // Return API for the logger
  return {
    getCurrentTrace: () => (currentTraceInfo ? { ...currentTraceInfo } : null),

    // Allow changing options
    setOptions: (newOptions: Partial<ConsoleTraceLoggerOptions>) => {
      // eslint-disable-next-line no-param-reassign
      if (newOptions.logFn !== undefined) options.logFn = newOptions.logFn
      // eslint-disable-next-line no-param-reassign
      if (newOptions.verbose !== undefined) options.verbose = newOptions.verbose
      // eslint-disable-next-line no-param-reassign
      if (newOptions.prefix !== undefined) options.prefix = newOptions.prefix
      if (newOptions.maxObjectStringLength !== undefined) {
        // eslint-disable-next-line no-param-reassign
        options.maxObjectStringLength = newOptions.maxObjectStringLength
      }
    },

    // Cleanup method to unsubscribe from all trace events
    cleanup: () => {
      subscriptions.forEach((subscription) => void subscription.unsubscribe())
      log('ConsoleTraceLogger unsubscribed from all events')
    },
  }
}
