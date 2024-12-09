/* eslint-disable @typescript-eslint/no-unused-vars */

import { processSpan, traceManager, useBeacon } from './typesExample'

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
    (span) => 'ticketId' in span.scope.ticketId === '123',
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
