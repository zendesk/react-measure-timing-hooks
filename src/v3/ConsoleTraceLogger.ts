import type {
  AllPossibleRequiredSpanSeenEvents,
  AllPossibleStateTransitionEvents,
  AllPossibleTraceStartEvents,
} from './debugTypes'
import type { SpanMatcherFn } from './matchSpan'
import type { OnEnterStatePayload } from './Trace'
import { isTerminalState } from './Trace'
import type { TraceManager } from './TraceManager'
import type { DraftTraceContext, RelationSchemasBase } from './types'

// --- Basic ANSI Color Codes ---
const RESET = '\u001B[0m'
const YELLOW = '\u001B[33m' // Trace Start/End
const CYAN = '\u001B[36m' // State Changes
const MAGENTA = '\u001B[35m' // Span Matches
const GREEN = '\u001B[32m' // Success/Complete
const RED = '\u001B[31m' // Error/Interrupted
const GRAY = '\u001B[90m' // Timestamps, Verbose details

type SimpleLoggerFn = (message: string) => void
// Define a basic ConsoleLike interface for type checking
interface ConsoleLike {
  log: (...args: any[]) => void
  group: (...args: any[]) => void
  groupCollapsed: (...args: any[]) => void
  groupEnd: () => void
  // Add other console methods if needed (warn, error, etc.)
}

/**
 * Formats a SpanMatcherFn into a more readable string representation.
 * This is a basic implementation and can be significantly improved
 * based on the actual structure of `matcher.fromDefinition`.
 *
 * @param matcher The matcher function to format.
 * @param index Optional index for generic naming.
 * @returns A string representation of the matcher.
 */
export function formatMatcher<
  SelectedRelationNameT extends keyof RelationSchemasT,
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
  VariantsT extends string,
>(
  matcher: SpanMatcherFn<SelectedRelationNameT, RelationSchemasT, VariantsT>,
  index?: number,
): string {
  // Check if the matcher has attached definition info
  if (matcher.fromDefinition) {
    // Attempt to create a more descriptive name from the definition
    // This part needs customization based on how 'fromDefinition' is structured.
    // Example: Check for specific properties like 'name', 'type', 'label' etc.
    const def = matcher.fromDefinition
    const parts: string[] = []

    if (typeof def === 'object' && def !== null) {
      // Example: Prioritize 'label' if it exists
      if ('label' in def && typeof def.label === 'string') {
        return `Label: "${def.label}"`
      }
      // Example: Use 'name' if it exists
      if ('name' in def) {
        if (typeof def.name === 'string') {
          parts.push(`Name: "${def.name}"`)
        } else if (def.name instanceof RegExp) {
          parts.push(`Name: /${def.name.source}/${def.name.flags}`)
        }
      }
      // Example: Add type if present
      if ('type' in def && typeof def.type === 'string') {
        parts.push(`Type: ${def.type}`)
      }
      // Add other relevant properties from your definition structure
    }

    if (parts.length > 0) {
      return parts.join(', ')
    }

    // Fallback: Stringify the definition (can be verbose)
    try {
      const defString = JSON.stringify(def)
      // Limit length to avoid overly long strings
      return defString.length > 100
        ? // eslint-disable-next-line no-magic-numbers
          `${defString.slice(0, 97)}...`
        : defString
    } catch {
      // Fallback if stringify fails
      return `Matcher Definition #${index ?? '?'}`
    }
  }

  // Fallback if no definition info is available
  return `Matcher #${index ?? '?'}`
}

/**
 * Options for configuring the ConsoleTraceLogger
 */
export interface ConsoleTraceLoggerOptions {
  /**
   * The logging mechanism. Can be a console-like object (supporting .log, .group, etc.)
   * or a simple function that accepts a string message.
   * Defaults to the global `console` object.
   */
  logger?: ConsoleLike | SimpleLoggerFn
  /**
   * Whether to enable verbose logging with more details.
   * Defaults to false.
   */
  verbose?: boolean
  /**
   * Prefix added to all log messages.
   * Defaults to '[Trace]'.
   */
  prefix?: string
  /**
   * Maximum string length for attributes/relatedTo objects before truncation.
   * Defaults to 500.
   */
  maxObjectStringLength?: number
  /**
   * Enable console grouping (.group, .groupCollapsed, .groupEnd).
   * Only effective if the logger is a console-like object.
   * Defaults to true.
   */
  enableGrouping?: boolean
  /**
   * Enable ANSI color codes in the output.
   * Only effective if the logger is a console-like object.
   * Defaults to true.
   */
  enableColors?: boolean
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
  // ... (implementation unchanged) ...
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
  // Simple comparison, consider deep equality for complex cases if needed
  try {
    return JSON.stringify(obj1) !== JSON.stringify(obj2)
  } catch {
    // Handle circular references or other stringify errors
    return true // Assume different if stringify fails
  }
}

/**
 * A utility for logging trace information
 */
export function createConsoleTraceLogger<
  RelationSchemasT extends RelationSchemasBase<RelationSchemasT>,
>(
  traceManager: TraceManager<RelationSchemasT>,
  optionsInput: ConsoleTraceLoggerOptions = {}, // Rename to avoid conflict
) {
  // Use a mutable options object internally
  let options: Required<ConsoleTraceLoggerOptions> = {
    logger: console, // Default to global console
    verbose: false,
    prefix: '[Trace]',
    maxObjectStringLength: MAX_SERIALIZED_OBJECT_LENGTH,
    enableGrouping: true,
    enableColors: true,
    ...optionsInput, // Apply initial user options
  }

  // Determine logger type and capabilities based on current options
  let isConsoleLike =
    typeof options.logger !== 'function' && options.logger.group
  let canGroup = isConsoleLike && options.enableGrouping
  let canColor = isConsoleLike && options.enableColors

  // Keep track of active trace
  let currentTraceInfo: TraceInfo<RelationSchemasT> | null = null

  // Store subscriptions for cleanup
  const subscriptions: { unsubscribe: () => void }[] = []

  // --- Helper Functions ---

  /** Apply color codes if enabled */
  const colorize = (str: string, color: string): string =>
    canColor ? `${color}${str}${RESET}` : str

  /** Truncate objects to prevent huge logs */
  const truncateObject = (obj?: Record<string, unknown>): string => {
    if (!obj) return '{}' // Represent undefined/null as empty object string
    try {
      const str = JSON.stringify(obj)
      if (str.length <= options.maxObjectStringLength) return str
      return `${str.slice(
        0,
        Math.max(0, options.maxObjectStringLength - 3),
      )}...`
    } catch {
      return '{...}' // Indicate truncation due to error
    }
  }

  /** Log a message using the configured logger */
  const log = (
    message: string,
    level: 'log' | 'group' | 'groupCollapsed' | 'groupEnd' = 'log',
  ) => {
    const fullMessage = `${options.prefix} ${message}`

    if (isConsoleLike) {
      const consoleLogger = options.logger as ConsoleLike
      switch (level) {
        case 'group':
          if (canGroup) consoleLogger.group(fullMessage)
          else consoleLogger.log(fullMessage)
          break
        case 'groupCollapsed':
          if (canGroup) consoleLogger.groupCollapsed(fullMessage)
          else consoleLogger.log(fullMessage)
          break
        case 'groupEnd':
          if (canGroup) consoleLogger.groupEnd()
          // No equivalent log message needed for simple loggers
          break
        default: // 'log'
          consoleLogger.log(fullMessage)
          break
      }
    } else {
      // Simple function logger
      const simpleLogger = options.logger as SimpleLoggerFn
      // Don't log the main message for groupEnd in simple mode
      if (!message.trim()) {
        // Avoid logging empty "[END GROUP]" lines
        return
      }
      simpleLogger(`${fullMessage}`)
    }
  }

  /** Format time relative to trace start */
  const formatRelativeTime = (offset?: number): string => {
    if (offset === undefined) return ''
    const formatted = `+${offset.toFixed(2)}ms`
    return colorize(formatted, GRAY)
  }

  /** Get string representation of required spans count */
  const getRequiredSpansCount = (): string => {
    if (!currentTraceInfo) return '0/0'
    const matched = currentTraceInfo.requiredSpans.filter(
      (span) => span.isMatched,
    ).length
    const total = currentTraceInfo.requiredSpans.length
    return `${matched}/${total}`
  }

  /** Create a required span entry from a matcher function */
  const createRequiredSpanEntry = (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    matcher: SpanMatcherFn<any, RelationSchemasT, any>,
    index: number,
  ): TraceInfo<RelationSchemasT>['requiredSpans'][0] => {
    // Use the utility if available, otherwise fallback
    const name = formatMatcher(matcher, index)
    return { name, matcher, isMatched: false }
  }

  /** Handle changes in attributes, relatedTo, or requiredSpans */
  const handleStateChanges = <K extends keyof RelationSchemasT>(
    trace: DraftTraceContext<K, RelationSchemasT, string>,
  ): void => {
    if (!currentTraceInfo) return

    const currentAttributes = trace.input.attributes
    if (objectsAreDifferent(currentAttributes, currentTraceInfo.attributes)) {
      log(
        `   Attributes changed: ${colorize(
          truncateObject(currentAttributes),
          GRAY,
        )}`,
      )
      currentTraceInfo.attributes = currentAttributes
        ? { ...currentAttributes }
        : undefined
    }

    const currentRelatedTo = trace.input.relatedTo
    if (objectsAreDifferent(currentRelatedTo, currentTraceInfo.relatedTo)) {
      log(
        `   Related to changed: ${colorize(
          truncateObject(currentRelatedTo),
          GRAY,
        )}`,
      )
      currentTraceInfo.relatedTo = currentRelatedTo
        ? { ...currentRelatedTo }
        : undefined
    }

    // Note: Required spans list itself doesn't change after trace start in current model
    // If variants could change requiredSpans, this would need updating.
  }

  /** Log timing information for a terminal state */
  const logTimingInfo = (transition: OnEnterStatePayload<RelationSchemasT>) => {
    const { lastRequiredSpanOffset, completeSpanOffset, cpuIdleSpanOffset } =
      extractTimingOffsets(transition)

    const duration = completeSpanOffset ?? lastRequiredSpanOffset // Best guess at total duration
    if (duration !== undefined) {
      log(`   Duration: ${formatRelativeTime(duration)}`)
    }
    if (lastRequiredSpanOffset !== undefined) {
      log(
        `   Last required span: ${formatRelativeTime(lastRequiredSpanOffset)}`,
      )
    }
    if (
      completeSpanOffset !== undefined &&
      completeSpanOffset !== lastRequiredSpanOffset
    ) {
      // Only log if different from LRS
      log(`   Complete span: ${formatRelativeTime(completeSpanOffset)}`)
    }
    if (cpuIdleSpanOffset !== undefined) {
      log(`   CPU idle: ${formatRelativeTime(cpuIdleSpanOffset)}`)
    }

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

    const requiredSpans = trace.definition.requiredSpans.map((matcher, index) =>
      createRequiredSpanEntry(matcher, index),
    )

    currentTraceInfo = {
      id: traceId,
      name: traceName,
      variant: traceVariant,
      startTime: trace.input.startTime.epoch,
      attributes: trace.input.attributes
        ? { ...trace.input.attributes }
        : undefined,
      relatedTo: trace.input.relatedTo
        ? { ...trace.input.relatedTo }
        : undefined,
      requiredSpans,
    }

    const startTimeStr = formatTimestamp(currentTraceInfo.startTime)
    log(
      `${colorize(
        '⏳ Trace started:',
        YELLOW,
      )} ${traceName} (${traceVariant}) [${colorize(traceId, GRAY)}]`,
      'groupCollapsed', // Start collapsed for tidiness
    )
    log(`   Started at: ${colorize(startTimeStr, GRAY)}`)
    if (
      currentTraceInfo.attributes &&
      Object.keys(currentTraceInfo.attributes).length > 0
    ) {
      log(
        `   Attributes: ${colorize(
          truncateObject(currentTraceInfo.attributes),
          GRAY,
        )}`,
      )
    }
    if (
      currentTraceInfo.relatedTo &&
      Object.keys(currentTraceInfo.relatedTo).length > 0
    ) {
      log(
        `   Related to: ${colorize(
          truncateObject(currentTraceInfo.relatedTo),
          GRAY,
        )}`,
      )
    }
    log(`   Required spans: ${requiredSpans.length}`)
    log('', 'groupEnd') // Close the initial group immediately
  }

  /**
   * Handle state transition event
   */
  const handleStateTransition = (
    event: AllPossibleStateTransitionEvents<RelationSchemasT>,
  ) => {
    if (!currentTraceInfo) return // Should not happen if trace started

    const { traceContext: trace, stateTransition: transition } = event
    const traceName = currentTraceInfo.name
    const previousState = transition.transitionFromState
    const traceState = transition.transitionToState

    const groupLevel = options.verbose ? 'group' : 'groupCollapsed'
    log(
      `${colorize(
        '↪️ Trace',
        CYAN,
      )} ${traceName} state changed: ${previousState} → ${colorize(
        traceState,
        CYAN,
      )}`,
      groupLevel,
    )

    // Log changes that occurred *during* this state
    handleStateChanges(trace)

    if (isTerminalState(traceState)) {
      if (traceState === 'complete') {
        log(`${colorize('✅ Trace', GREEN)} ${traceName} complete`)
        logTimingInfo(transition)
      } else {
        // interrupted
        const reason = (
          transition as Extract<
            typeof transition,
            { interruptionReason: unknown }
          >
        ).interruptionReason
        log(
          `${colorize('❌ Trace', RED)} ${traceName} interrupted (${colorize(
            reason,
            RED,
          )})`,
        )
        logTimingInfo(transition)
      }
      currentTraceInfo = null // Clear trace info on terminal state
    }

    log('', 'groupEnd') // End the group for this transition
  }

  /**
   * Handle required span seen event
   */
  const handleRequiredSpanSeen = (
    event: AllPossibleRequiredSpanSeenEvents<RelationSchemasT>,
  ) => {
    if (!currentTraceInfo) return

    const { spanAndAnnotation: matchedSpan, matcher } = event

    // Find and update the matched span in our info
    const requiredSpanEntry = currentTraceInfo.requiredSpans.find(
      (s) => s.matcher === matcher,
    )
    if (requiredSpanEntry && !requiredSpanEntry.isMatched) {
      requiredSpanEntry.isMatched = true
    }

    const name = requiredSpanEntry?.name ?? formatMatcher(matcher) // Use formatted name

    const groupLevel = options.verbose ? 'group' : 'log' // Only group if verbose
    log(
      `${colorize(
        '🔹 Matched required span:',
        MAGENTA,
      )} ${name} (${getRequiredSpansCount()} spans matched)`,
      groupLevel,
    )

    if (options.verbose) {
      const relativeTime = formatRelativeTime(
        matchedSpan.annotation.operationRelativeStartTime,
      )
      log(`   At time: ${relativeTime}`)
      if (matchedSpan.span.name) {
        log(
          `   Span name / type: ${matchedSpan.span.name} / ${matchedSpan.span.type}`,
        )
      }
      if (
        matchedSpan.span.attributes &&
        Object.keys(matchedSpan.span.attributes).length > 0
      ) {
        log(
          `   Span Attributes: ${colorize(
            truncateObject(matchedSpan.span.attributes),
            GRAY,
          )}`,
        )
      }
      if (
        matchedSpan.span.relatedTo &&
        Object.keys(matchedSpan.span.relatedTo).length > 0
      ) {
        log(
          `   Span RelatedTo: ${colorize(
            truncateObject(matchedSpan.span.relatedTo),
            GRAY,
          )}`,
        )
      }
      if (groupLevel === 'group') log('', 'groupEnd') // Close group if we opened one
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
      // Update the internal mutable options object
      options = { ...options, ...newOptions }

      // Re-evaluate derived flags after updating options
      isConsoleLike =
        typeof options.logger !== 'function' && options.logger.group
      canGroup = isConsoleLike && options.enableGrouping
      canColor = isConsoleLike && options.enableColors
    },

    // Cleanup method to unsubscribe from all trace events
    cleanup: () => {
      subscriptions.forEach((subscription) => void subscription.unsubscribe())
      subscriptions.length = 0 // Clear the array
      currentTraceInfo = null
      // Optional: Log cleanup only if verbose or specifically configured?
      // log('ConsoleTraceLogger unsubscribed from all events')
    },
  }
}
