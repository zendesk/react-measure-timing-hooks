/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/consistent-type-definitions */

import { generateUseBeacon, processSpan, TraceManager } from './typesExample'

export type LotusTicketScope = {
  ticketId: string
}

export type LotusUserScope = {
  userId: string
}

export type LotusCustomFieldScope = {
  customFieldId: string
}

export type LotusAllPossibleScopes =
  | LotusTicketScope
  | LotusUserScope
  | LotusCustomFieldScope

const traceManager = new TraceManager<LotusAllPossibleScopes>()
const useBeacon = generateUseBeacon<LotusAllPossibleScopes>()

// invalid because in the matcher functions, we cannot compare objects (due to object equality comparison)
type InvalidScope = {
  something: { blah: string }
}

// invalid:
const invalidTraceManager = new TraceManager<InvalidScope>()

processSpan({
  name: 'some-span',
  scope: { ticketId: '123', customFieldId: '123', userId: '123' },
})

// valid beacon
useBeacon({
  name: 'OmniLog',
  scopes: { ticketId: '123' },
})

// valid beacon
useBeacon({
  name: 'UserPage',
  scopes: { userId: '123' },
})

// invalid
useBeacon({
  name: 'UserPage',
  scopes: { invalid: '123' },
})

// valid definition
const ticketActivationTracer = traceManager.createTracer({
  name: 'ticket.activation',
  scopes: ['ticketId'],
  requiredToEnd: [{ matchingScopes: ['ticketId'] }],
})

// valid definition
const userPageTracer = traceManager.createTracer({
  name: 'user.activation',
  scopes: ['userId'],
  requiredToEnd: [{ matchingScopes: ['userId'] }],
})

// valid definition
const customFieldDropdownTracer = traceManager.createTracer({
  name: 'ticket.custom_field',
  scopes: ['ticketId', 'customFieldId'],
  requiredToEnd: [{ matchingScopes: ['ticketId'] }],
})

// invalid definition. scopes match but not included in AllPossibleScopes
const invalidTracer = traceManager.createTracer({
  name: 'ticket.activation',
  scopes: ['invalid'],
  requiredToEnd: [{ matchingScopes: ['invalid'] }],
})

// invalid definition. userId given in requiredToEnd isn't one of the scopes the tracer says it can have
const shouldErrorTrace = traceManager.createTracer({
  name: 'ticket.should_error',
  scopes: ['ticketId', 'customFieldId'],
  requiredToEnd: [{ matchingScopes: ['userId'] }],
})

// valid definition
const ticketActivationWithFnTracer = traceManager.createTracer({
  name: 'ticket.activation',
  scopes: ['ticketId'],
  requiredToEnd: [
    { matchingScopes: ['ticketId'] },
    (span) => span.scope.ticketId === '123',
  ],
})

// valid start
ticketActivationTracer.start({
  scope: { ticketId: '123' },
})

// invalid start (errors)
ticketActivationTracer.start({
  scope: { whatever: '123' },
})

// invalid start (errors)
ticketActivationTracer.start({
  scope: { userId: '123' },
})

// valid
traceManager.processSpan({
  name: 'name',
  scope: {
    ticketId: '123',
  },
})

// valid - multiple scopes simultaneously
traceManager.processSpan({
  name: 'name',
  scope: {
    ticketId: '123',
    customFieldId: '123',
  },
})

// invalid
traceManager.processSpan({
  name: 'name',
  scope: {
    bad: '123',
  },
})

// invalid
traceManager.processSpan({
  name: 'name',
  scope: {
    ticketId: 123,
  },
})
