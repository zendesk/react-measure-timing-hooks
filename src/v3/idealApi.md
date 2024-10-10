# The ideal API

## Ideas

- capture Redux and Hamlet events as events

## Glossary

#### **Span**

A **span** represents a unit of work. It includes these properties:

- kind (what type of work does this span represent? e.g. a fetch, a component render)
- a name
- time-related data
  - start time (relative to the start of the operation)
  - duration
  - end time (relative to the start of the operation)
- attributes (any arbitrary metadata to provide additional information)
- context \- the name and ID of the trace to which the span belongs
- status \- may be added to indicate an error or a partial failure related to the span's work

#### **Event**

An **event** is used to annotate a meaningful, singular point in time, in relation to the operation. An **event** is similar to a **span**, but without a duration. Examples of events:

- Denoting when the page became interactive (TTI)
- Denoting when the page was focused or put into background
- Denoting when a click has occurred
- Denoting when an error has occurred

#### **Entry**

Either a **span** or an **event**.

#### **Trace**

OpenTelemetry defines the term "**trace**" as follows:

A trace is made of one or more spans. The first span represents the root span. Each root span represents a request from start to finish. The spans underneath the parent provide a more in-depth context of what occurs during a request (or what steps make up a request). Without tracing, finding the root cause of performance problems in a distributed system can be challenging. Tracing makes debugging and understanding distributed systems less daunting by breaking down what happens within a request as it flows through a distributed system.

A frontend trace will include **spans** such as: UI component renders, network requests, image resource loads, iframe loading, and other processing tasks that occur on the frontend.

Due to the asynchronous, multi-view nature of the frontend, there is no way to guarantee that only a single trace will be occurring at any given time. For this reason, frontend traces differ from backend traces \- as **spans** may reference multiple parent traces simultaneously.

A **trace** is itself a special kind of a **span** that starts and ends once pre-defined conditions are met. It is a parent for other **spans**, and will often be the **root span**.

#### **User Operation Trace**

A **User Operation Trace** represents a process that results in a change to the user's experience. This could mean things like navigation to a new subsection, or displaying a context menu.

It is started by a user's action (e.g. a click, a hover, or a key press event) and ends once the desired new state has been reached.

(TODO: what about traces that start by an external action, like another user, or something external in the world triggering a change in the UI?)

It may be configured to include all events until the user is able to interact with the page.

The duration of the User Operation Trace represents the user's experience of the process. Such metric can be used to track regressions or improvements to the performance of the process.

What it is not:

- a User Operation trace shouldn't represent productivity of the user, and cannot answer the questions like: long does it take to resolve the ticket
- it only includes a single user interaction, and should not include a series of interactions

#### **Computed Span**

**Computed Span** - A span that is derived from other spans.
They represent something meaningful from the perspective of product performance analysis, and are defined by the engineering team based on decided upon requirements.

#### **Scope** (or **Context** or **Domain** ?)

A way to match and group related **events** together based on their relevance to a given context on the page (e.g. a specific ticket, a specific user, a specific area of the page).

## Defining and starting a trace

Requirements:

- define computed spans
  - define point A matcher (by default start of trace) and point B matcher
- merge metadata from various spans? (bucket by span name?)
- define what conditions need to be met to end the trace
- ability to contribute to what Computed Spans should be created in separate files (and imported statically or maybe even dynamically?), as the components get loaded (think monorepo - like federation of components)
- trace definition should be separate from starting the trace
- de-duplicate internally if an entry has already been added for a PerformanceEntry

Constraints:

- starting the operation is an imperative API
- only one operation can be running at a given time (browsers are single-threaded)

```ts
const traceManager = new TraceManager({
  reportFn: (trace) => {
    // send trace to the backend

    // swap out '$includeFeatureFlags' with actual feature flags
  },
  // stores the span meta on the trace directly
  // instead of creating an annotation for each event
  embedSpanTypes: ['component-render'],
})

const {startTicketActivationTrace} = traceManager.createOperationTracer(definition)

export const ticketActivationTracer = traceManager.createOperationTracer({
  requiredToEnd: [
    {
      type: 'resource',
      name: '/api/tickets/:id',
    },
    {
      scope: { ticket: { id }, component: 'OmniLog' },
      idle: true,
      // optional:
      interruptWhenNoLongerIdle: false,
    },
    {
      scope: { ticket: { id }, component: 'OmniComposer' },
      idle: true,
    },
    {
      scope: { ticket: { id }, component: 'AppSidebar' },
      idle: true,
    },
  ],
  // we do not need to debounce on anything until 'requiredToEnd' is met
  debounceOn: [
    {
      match: { scope: { ticket: { id } } },
    }
  ],
  interruptOn: [
    {
      match: {
        type: 'mark',
        name: TICKET_NAVIGATED_AWAY_EVENT_NAME,
        scope: { ticket: { id } },
      },
    },
    // added implicitly
    {
      inState: ['debouncing', 'waiting-for-interactive'],
      scope: { ticket: { id }, component: 'OmniLog' },
      idle: false,
    }
  ],

  // for now, we don't need to implement this
  exclude: [
    { match: { ... } }
  ],
  attributes: {
    $includeFeatureFlags: [...],
    // arbitrary
  }
})

// NOTE: by default, exclude all 'component-render-start' spans

ticketActivationTracer.defineComputedEntry({
  name: 'some.span',
  start: { beaconName: '', metadata: {ticketId}, index: 0 },
  end: { beaconName: '', metadata: {ticketId, visibleState: COMPLETE}, index: -1 },
})

ticketActivationTracer.defineComputedValue({
  name: 'something',
  type: 'count',
  match: { beaconName: '', metadata: {ticketId, eventId} },
})

ticketActivationTracer.defineComputedAttribute({
  ??
})

const traceId = ticketActivationTracer.start()
```

```ts
const internalActiveTraceStates = {
  // 'pending': {
  //   // for now we don't need to worry about it - we'll not implement
  // },
  'recording': {
    // ...
  },
  'debouncing-renders': {
    // ...
  },
  // waiting for longtasks and long-animation-frames
  'complete-and-waiting-for-interactive': {
    // ...
  },
  'interrupted': {
    // state in which something happened while the trace was still recording
    // contains `event.reason`:
    // | 'timeout'
    // | 'another-trace-started'
    // | 'manually-aborted'
    // | 'idle-component-no-longer-idle'

    // call the reportFn
  },
  'complete': {
    // call the reportFn
  },
})
```

Valid state transitions:

- pending => recording
- recording => debouncing-renders
- recording => complete (when there are no component idle `requiredToEnd`)
- {any} => interrupted
- debouncing-renders => waiting-for-interactive
- debouncing-renders => complete
- complete-and-waiting-for-interactive => complete

## Creating entries (spans or events)

```ts

```

## Datatypes

```ts
interface TraceEntryInput<ScopeT extends object> {
  type:
    | NativePerformanceEntryType
    | 'component-render-start'
    | 'component-render'
    | 'component-unmount'

  // the non-unique name that all traces of this kind share among each other
  commonName: string
  // OmniLog
  // component-render:OmniLog
  // resource:/apis/ticket/:d.json

  // performance.now() time
  startTime: number
  // absolute count of ms from epoch
  startTimeEpoch: number

  // if this is just an event, this 0, span will have >0
  duration: number

  status: 'ok' | 'error'

  scope: ScopeT

  attributes: {
    [name: string]: unknown
  }

  // the complete name of the related event, that's specific to this event
  // e.g. https://domain.zendesk.com/apis/ticket/123.json
  originalName: string

  performanceEntry?: PerformanceEntry
}

const annotation = traceManager.processEntry(traceEntryInput)
// this output annotation should be stored as metadata of the trace entry
// in the tracing system (e.g. Datadog RUM)

interface EntryAnnotation {
  [operationName: string]: {
    /**
     * The ID of the operation the event belongs to.
     */
    id: string

    /**
     * The occurrence of the entry with the same name within the operation.
     * Usually 1 (first entry)
     */
    occurrence: number

    /**
     * Offset from the start of the operation to the start of the event.
     * aka operationStartOffset or operationStartToEventStart
     */
    operationRelativeStartTime: number

    /**
     * Relative end time of the event within the operation.
     */
    operationRelativeEndTime: number
  }
}

interface Trace {
  // random generated unique value
  id: string

  // name of the trace / operation
  // TODO: naming convention
  name: string

  type: 'user-operation' | 'process'

  // set to 'error' if any entry with status: 'error' was part of the actual trace
  // (except if it happened while in the waiting-for-interactive state)
  status: 'ok' | 'error' | 'interrupted'
  interruptionReason?:
    | 'timeout'
    | 'another-trace-started'
    | 'manually-aborted'
    | 'idle-component-no-longer-idle'

  // duration from start to satisfied all requiredToEnd + any debounced events
  // start till complete
  duration: number

  startTillInteractive: number
  completeTillInteractive: number

  attributes: {
    // feature flags, etc.
    [attributeName: string]: unknown
  }

  // these are manually defined and have to be unique
  computedSpans: {
    [spanName: string]: {
      // time relative to beginning of the trace
      startOffset: number
      duration: number
    }
  }

  computedValues: {
    [valueName: string]: number | string | boolean
  }

  // spans that don't exist as separate spans in the DB
  // useful for things like renders, which can repeat tens of times
  // during the same operation
  embeddedSpans: {
    [componentName: string]: {
      count: number
      totalDuration: number
      spans: { startOffset: number; duration: number }[]
    }
  }

  // all common names of entires that can be used to query
  // & aggregate average start offset and duration
  includedEntryNames: string[]

  // all the other spans that did get recorded
  // spans: {
  //   [spanCommonName: string]: {
  //     count: number
  //     totalDuration: number
  //     firstSpanStartOffset: number
  //   }
  // }
}
```

## Using beacons in React components

```ts
useBeacon({
  scope: { ticket: { id }, component: 'OmniLog' },
  attributes: { ... },

  renderedOutput: 'NULL/EMTPY' | 'LOADING' | 'CONTENT' | 'ERROR',
  // or visibilityState? or renderedState? componentReturns? componentOutput?

  // how do we call this flag?
  idle: true,
  stable: true,
  completedState: false,
  stabilized: true,
  complete: true,
  finalized: true,
  final: true,
  noMoreRerendersExpected: true,
  readyForUserInput: true,
  idling: true,

  // or alternatively?
  working: true,
  expectMoreChanges: true,
})

useBeacon('OmniLogEvent', {
  scopes: { ticket: { id }, ticketEvent: { id } },
  visibilityState: '...',
})
```

- standardize visibility states values

## Naming conventions

## Argument for operation tracing

By structuring the API this way (requiring a parent User Operation to be running in order to capture something like a render duration), we incentivize engineers towards best practices and capturing fuller data.
