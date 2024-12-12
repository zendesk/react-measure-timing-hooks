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

interface ExampleCustomFieldScope {
  customFieldId: string
}

type ExampleAllPossibleScopes =
  | ExampleTicketScope
  | ExampleUserScope
  | ExampleCustomFieldScope

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
      requiredToEnd: [{ matchScopes: ['ticketId'] }],
    })

    const ticketActivationTracer2 = traceManager.createTracer({
      name: 'ticket.activation',
      scopes: ['ticketId'],
      requiredToEnd: [
        // match.withAllConditions(
        //   match.withName((name, scopes) => name === `${scopes.ticketId}.end`),
        //   // match.withName('end'),
        //   // match.withMatchingScopes(['ticketId']),
        // ),
        // match.withName((name, scopes) => name === `${scopes.ticketId}.end`),
        // match.withName('customFieldId'),
        match.withMatchingScopes(['customFieldId']),
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
