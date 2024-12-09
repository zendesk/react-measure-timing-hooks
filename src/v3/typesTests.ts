/* eslint-disable @typescript-eslint/no-unused-vars,@typescript-eslint/no-unsafe-call */

import { processSpan, traceManager, useBeacon } from './typesExample'

processSpan({
  name: 'some-span',
  scopes: { ticketId: '123', customFieldId: '123', userId: '123' },
})

useBeacon({
  name: 'OmniLog',
  scopes: { ticketId: '123' },
})

useBeacon({
  name: 'UserPage',
  scopes: { userId: '123' },
})

const ticketActivationTracer = traceManager.createTracer({
  name: 'ticket.activation',
  scopes: ['ticketId'],
  requiredToEnd: [{ matchingScopes: ['ticketId'] }],
})

const userPageTracer = traceManager.createTracer({
  name: 'user.activation',
  scopes: ['userId'],
  requiredToEnd: [{ matchingScopes: ['userId'] }],
})

const customFieldDropdownTracer = traceManager.createTracer({
  name: 'ticket.custom_field',
  scopes: ['ticketId', 'customFieldId'],
  requiredToEnd: [{ matchingScopes: ['ticketId'] }],
})

// invalid definition
const shouldErrorTrace = traceManager.createTracer({
  name: 'ticket.should_error',
  scopes: ['ticketId', 'customFieldId'],
  requiredToEnd: [{ matchingScopes: ['userId'] }],
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
