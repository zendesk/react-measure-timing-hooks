/* eslint-disable jest/expect-expect */
import { generateUseBeacon } from '../hooks'
import * as match from '../matchSpan'
import { TraceManager } from '../traceManager'

interface ExampleTicketScope {
  ticketId: string
}

interface ExampleUserScope {
  userId: string
}

interface ExampleTicketEventScope {
  ticketId: string
  eventId: string
}

interface ExampleCustomFieldScope {
  customFieldId: string
}

interface ExampleScopeWithMultipleKeys {
  customId: string
  customOtherId: string
}

interface TicketFieldScope {
  ticketId: string
  ticketFieldType: 'dropdown'
}
interface TicketAppScope {
  ticketId: string
  appId: string
}

type ExampleAllPossibleScopes =
  | ExampleTicketScope
  | ExampleUserScope
  | ExampleCustomFieldScope
  | ExampleScopeWithMultipleKeys
  | ExampleTicketEventScope

// TODO:
// // Helper type to ensure we get a tuple instead of an array type
// type ToTuple<T extends any[]> = [...T];

// // Main type that transforms union of objects to union of tuples of keys
// type ObjectKeysToTuple<T> = T extends object
//   ? ToTuple<keyof T extends infer K ? K extends PropertyKey ? [K] : never : never>
//   : never;

// type X = ObjectKeysToTuple<ExampleAllPossibleScopes> // ["ticketId"] | ["userId"] | ["customFieldId"] | ["customId", "customOtherId"] | ["ticketId", "eventId"]

const mockSpanWithoutScope = {
  name: 'some-span',
  duration: 0,
  type: 'mark',
  attributes: {},
  startTime: { now: 0, epoch: 0 },
} as const

// eslint-disable-next-line jest/no-disabled-tests
describe.skip('type tests', () => {
  const traceManager = new TraceManager<ExampleAllPossibleScopes>({
    generateId: () => 'id',
    reportFn: (trace) => {
      if ('ticketId' in trace.scope) {
        // valid
        expect(trace.scope.ticketId).toBeDefined()
        // @ts-expect-error invalid scope
        expect(trace.scope.userId).toBeDefined()
      }
      if ('userId' in trace.scope) {
        // valid
        expect(trace.scope.userId).toBeDefined()
        // @ts-expect-error invalid scope
        expect(trace.scope.ticketId).toBeDefined()
      }
      // valid
      if ('customFieldId' in trace.scope) {
        expect(trace.scope.customFieldId).toBeDefined()
      }
    },
  })
  const useBeacon = generateUseBeacon<ExampleAllPossibleScopes>(traceManager)

  it('works', () => {
    // invalid because in the matcher functions, we cannot compare objects (due to object equality comparison)
    interface InvalidScope {
      something: { blah: string }
    }

    // invalid:
    // @ts-expect-error invalid scope
    const invalidTraceManager = new TraceManager<InvalidScope>({
      generateId: () => 'id',
      reportFn: () => {},
    })

    // valid beacon
    useBeacon({
      name: 'OmniLog',
      renderedOutput: 'content',
      scope: { ticketId: '123' },
    })

    // valid beacon
    useBeacon({
      name: 'UserPage',
      renderedOutput: 'content',
      scope: { userId: '123' },
    })

    // invalid
    useBeacon({
      name: 'UserPage',
      renderedOutput: 'content',
      // @ts-expect-error invalid scope
      scope: { invalid: '123' },
    })

    // valid definition
    const ticketActivationTracer = traceManager.createTracer({
      name: 'ticket.activation',
      scopes: ['ticketId'],
      // scope: 'global',
      requiredToEnd: [{ matchScopes: ['ticketId'] }],
    })

    const ticketActivationTracer2 = traceManager.createTracer({
      name: 'ticket.activation',
      scopes: ['customId', 'customOtherId'],
      requiredToEnd: [
        match.withAllConditions(
          match.withName((name, scopes) => name === `${scopes.customId}.end`),
          match.withName('end'),
          match.withMatchingScopes(['customId']),
        ),
        match.withName((name, scopes) => name === `${scopes.customId}.end`),
        match.withName('customFieldId'),
        match.withMatchingScopes(['customId']),
        // @ts-expect-error invalid scope
        match.withMatchingScopes(['sticketId']),
      ],
    })

    // valid definition
    const userPageTracer = traceManager.createTracer({
      name: 'user.activation',
      scopes: ['userId'],
      requiredToEnd: [{ matchScopes: ['userId'] }],
    })

    // valid definition
    const customFieldDropdownTracer = traceManager.createTracer({
      name: 'ticket.custom_field',
      scopes: ['ticketId', 'customFieldId'],
      requiredToEnd: [{ matchScopes: ['ticketId'] }],
    })

    // invalid definition. scopes match but not included in AllPossibleScopes
    const invalidTracer = traceManager.createTracer({
      name: 'ticket.activation',
      // @ts-expect-error invalid scope
      scopes: ['invalid'],
      requiredToEnd: [
        {
          // @ts-expect-error invalid scope
          matchScopes: ['invalid'],
        },
      ],
    })

    // invalid definition. userId given in requiredToEnd isn't one of the scopes the tracer says it can have
    const shouldErrorTrace = traceManager.createTracer({
      name: 'ticket.should_error',
      scopes: ['ticketId', 'customFieldId'],
      requiredToEnd: [
        {
          // @ts-expect-error invalid scope
          matchScopes: ['userId'],
        },
      ],
    })

    // valid definition
    const ticketActivationWithFnTracer = traceManager.createTracer({
      name: 'ticket.activation',
      scopes: ['ticketId'],
      requiredToEnd: [
        { matchScopes: ['ticketId'] },
        ({ span }) => span.scope?.ticketId === '123',
      ],
    })

    // valid start
    ticketActivationTracer.start({
      scope: { ticketId: '123' },
    })

    // invalid start (errors)
    ticketActivationTracer.start({
      // @ts-expect-error invalid scope
      scope: { whatever: '123' },
    })

    // invalid start (errors)
    ticketActivationTracer.start({
      // @ts-expect-error invalid scope
      scope: { userId: '123' },
    })

    // valid - excess scope
    traceManager.processSpan({
      ...mockSpanWithoutScope,
      scope: { ticketId: '123', customFieldId: '123', userId: '123' },
    })

    // valid
    traceManager.processSpan({
      ...mockSpanWithoutScope,
      scope: { ticketId: '123' },
    })

    // valid - multiple scopes simultaneously
    traceManager.processSpan({
      ...mockSpanWithoutScope,
      scope: {
        ticketId: '123',
        customFieldId: '123',
      },
    })

    // invalid
    traceManager.processSpan({
      ...mockSpanWithoutScope,
      scope: {
        // @ts-expect-error bad scope
        bad: '123',
      },
    })

    // invalid
    traceManager.processSpan({
      ...mockSpanWithoutScope,
      scope: {
        // @ts-expect-error bad scope
        ticketId: 123,
      },
    })
  })

  it('does not allow to include invalid scope value', () => {
    const tracer = traceManager.createTracer({
      name: 'ticket.scope-operation',
      type: 'operation',
      scopes: ['ticketId'],
      timeoutDuration: 5_000,
      requiredToEnd: [{ name: 'end', matchScopes: true }],
    })
    const traceId = tracer.start({
      scope: {
        // @ts-expect-error number should not be assignable to string
        ticketId: 4,
      },
    })
  })

  it('mixed scopes', () => {
    const tracer = traceManager.createTracer({
      name: 'ticket.scope-operation',
      type: 'operation',
      scopes: ['ticketId', 'customFieldId'],
      timeoutDuration: 5_000,
      requiredToEnd: [{ name: 'end', matchScopes: true }],
    })
    const traceId = tracer.start({
      scope: {
        customFieldId: '3',
        ticketId: '4',
      },
    })
  })

  it('redaction example', () => {
    const tracer = traceManager.createTracer({
      name: 'ticket.event.redacted',
      type: 'operation',
      scopes: ['ticketId', 'eventId'],
      timeoutDuration: 5_000,
      requiredToEnd: [{ name: 'OmniLogEvent', matchScopes: true }],
      debounceOn: [{ name: 'OmniLog', matchScopes: ['ticketId'] }],
    })
    const traceId = tracer.start({
      scope: {
        ticketId: '4',
        eventId: '3',
      },
    })
  })

  it('redaction invalid example', () => {
    const tracer = traceManager.createTracer({
      name: 'ticket.event.redacted',
      type: 'operation',
      // @ts-expect-error enforce a complete set of keys of a given scope
      scopes: ['eventId'],
      timeoutDuration: 5_000,
      requiredToEnd: [{ name: 'OmniLogEvent', matchScopes: true }],
    })
    const traceId = tracer.start({
      scope: {
        ticketId: '4',
        eventId: '3',
      },
    })
  })

  it('does not allow to include invalid scope key', () => {
    const tracer = traceManager.createTracer({
      name: 'ticket.scope-operation',
      type: 'operation',
      scopes: ['ticketId'],
      timeoutDuration: 5_000,
      requiredToEnd: [{ name: 'end', matchScopes: true }],
    })
    const traceId = tracer.start({
      scope: {
        // @ts-expect-error invalid scope key
        userId: '3',
      },
    })
  })
})
