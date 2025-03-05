import { assertType, describe, expect, it } from 'vitest'
import { generateUseBeacon } from './hooks'
import type { GetScopeTFromTraceManager } from './hooksTypes'
import * as match from './matchSpan'
import { TraceManager } from './TraceManager'
import type { MapSchemaToTypes } from './types'

const mockSpanWithoutScope = {
  name: 'some-span',
  duration: 0,
  type: 'mark',
  attributes: {},
  startTime: { now: 0, epoch: 0 },
} as const

describe('type tests', () => {
  const traceManager = new TraceManager({
    relationSchemas: {
      global: {},
      ticket: { ticketId: String },
      user: { userId: String },
      tickedField: { ticketId: String, customFieldId: String },
      custom: { customId: String, customOtherId: String },
      ticketEvent: { ticketId: String, eventId: String },
    },
    generateId: () => 'id',
    reportFn: (trace) => {
      if (!trace.relatedTo) return

      if ('ticketId' in trace.relatedTo) {
        // valid
        expect(trace.relatedTo.ticketId).toBeDefined()
        // @ts-expect-error invalid relatedTo
        expect(trace.relatedTo.userId).toBeDefined()
      }
      if ('eventId' in trace.relatedTo) {
        // valid
        expect(trace.relatedTo.eventId).toBeDefined()
        expect(trace.relatedTo.ticketId).toBeDefined()
        // @ts-expect-error invalid relatedTo
        expect(trace.relatedTo.userId).toBeDefined()
      }
      if ('userId' in trace.relatedTo) {
        // valid
        expect(trace.relatedTo.userId).toBeDefined()
        // @ts-expect-error invalid relatedTo
        expect(trace.relatedTo.ticketId).toBeDefined()
      }
      // valid
      if ('customFieldId' in trace.relatedTo) {
        expect(trace.relatedTo.customFieldId).toBeDefined()
      }
    },
    reportErrorFn: (error) => {
      console.error(error)
    },
  })

  interface RequiredBeaconAttributes {
    team: string
  }
  const useBeacon = generateUseBeacon(traceManager)
  type Schema = GetScopeTFromTraceManager<typeof traceManager>
  const useBeaconWithRequiredAttributes = generateUseBeacon<
    Schema,
    RequiredBeaconAttributes
  >(traceManager)

  it('works', () => {
    // invalid because in the matcher functions, we cannot compare objects (due to object equality comparison)
    interface InvalidScope {
      something: { blah: string }
    }

    // invalid:
    // @ts-expect-error invalid relatedTo
    const invalidTraceManager = new TraceManager<InvalidScope>({
      generateId: () => 'id',
      reportFn: () => {},
    })

    assertType(invalidTraceManager)

    // valid beacon
    useBeacon({
      name: 'OmniLog',
      renderedOutput: 'content',
      relatedTo: { ticketId: '123', customFieldId: '123' },
    })

    // valid beacon
    useBeacon({
      name: 'UserPage',
      renderedOutput: 'content',
      relatedTo: { userId: '123' },
    })

    // invalid
    useBeacon({
      name: 'UserPage',
      renderedOutput: 'content',
      // @ts-expect-error invalid relatedTo
      relatedTo: { invalid: '123' },
    })

    // valid beacon
    useBeacon({
      name: 'OmniLog',
      renderedOutput: 'content',
      // @ts-expect-error invalid: missing ticketId
      relatedTo: { customFieldId: '123' },
    })

    // valid beacon with only required attributes
    useBeaconWithRequiredAttributes({
      name: 'UserPage',
      renderedOutput: 'content',
      relatedTo: { userId: '123' },
      attributes: { team: 'test' },
    })

    // valid beacon required attributes and additional attributes
    useBeaconWithRequiredAttributes({
      name: 'UserPage',
      renderedOutput: 'content',
      relatedTo: { userId: '123' },
      attributes: { randoKey: 'test', team: 'test' },
    })

    // invalid beacon missing required attributes
    useBeaconWithRequiredAttributes({
      name: 'UserPage',
      renderedOutput: 'content',
      relatedTo: { userId: '123' },
      // @ts-expect-error attributes require a team key
      attributes: { randoKey: 'test' },
    })

    // valid definition
    const ticketActivationTracer = traceManager.createTracer({
      name: 'ticket.activation',
      relations: 'ticket',
      variants: {
        origin: { timeout: 5_000 },
        another_origin: { timeout: 10_000 },
      },
      requiredSpans: [{ withTraceRelations: ['ticketId'] }],
    })

    const ticketActivationTracer2 = traceManager.createTracer({
      name: 'ticket.activation',
      relations: 'custom',
      variants: {
        origin: { timeout: 5_000 },
      },
      requiredSpans: [
        match.withAllConditions(
          match.withName(
            (name, relations) => name === `${relations?.customId}.end`,
          ),
          match.withName('end'),
          match.withTraceRelations(['customId']),
        ),
        match.withName(
          (name, relatedTo) => name === `${relatedTo?.customId}.end`,
        ),
        match.withName('customFieldId'),
        match.withTraceRelations(['customId']),
        // @ts-expect-error invalid relatedTo
        match.withTraceRelations(['typoId']),
      ],
    })

    // valid definition
    const userPageTracer = traceManager.createTracer({
      name: 'user.activation',
      relations: 'user',
      variants: {
        origin: { timeout: 5_000 },
      },
      requiredSpans: [{ withTraceRelations: ['userId'] }],
    })

    // valid definition
    const customFieldDropdownTracer = traceManager.createTracer({
      name: 'ticket.custom_field',
      relations: 'tickedField',
      variants: {
        origin: { timeout: 5_000 },
      },
      requiredSpans: [{ withTraceRelations: ['ticketId'] }],
    })

    // invalid definition. relatedTo match but not included in AllPossibleScopes
    const invalidTracer = traceManager.createTracer({
      name: 'ticket.activation',
      variants: {
        origin: { timeout: 5_000 },
      },
      // @ts-expect-error invalid relatedTo
      relations: ['invalid'],
      requiredSpans: [
        {
          // @ts-expect-error invalid relatedTo
          withTraceRelations: ['invalid'],
        },
      ],
    })

    // invalid definition. userId given in requiredSpans isn't one of the relatedTo the tracer says it can have
    const shouldErrorTrace = traceManager.createTracer({
      name: 'ticket.should_error',
      relations: 'tickedField',
      variants: {
        origin: { timeout: 5_000 },
      },
      requiredSpans: [
        {
          // @ts-expect-error invalid relatedTo
          withTraceRelations: ['userId'],
        },
      ],
    })

    // valid definition
    const ticketActivationWithFnTracer = traceManager.createTracer({
      name: 'ticket.activation',
      relations: 'ticket',
      variants: {
        origin: { timeout: 5_000 },
      },
      requiredSpans: [
        { withTraceRelations: ['ticketId'] },
        ({ span }) => span.relatedTo?.ticketId === '123',
      ],
    })

    // valid start
    ticketActivationTracer.start({
      relatedTo: { ticketId: '123' },
      variant: 'origin',
    })
    // valid start
    ticketActivationTracer.start({
      relatedTo: { ticketId: '999' },
      variant: 'another_origin',
    })

    // invalid start - wrong variant
    ticketActivationTracer.start({
      relatedTo: { ticketId: '123' },
      // @ts-expect-error invalid variant
      variant: 'origin_wrong',
    })

    // invalid start (errors)
    ticketActivationTracer.start({
      // @ts-expect-error invalid relatedTo
      relatedTo: { whatever: '123' },
    })

    // invalid start (errors)
    ticketActivationTracer.start({
      // @ts-expect-error invalid relatedTo
      relatedTo: { userId: '123' },
      variant: 'origin',
    })

    // valid - excess relatedTo
    traceManager.processSpan({
      ...mockSpanWithoutScope,
      relatedTo: { ticketId: '123', customFieldId: '123', userId: '123' },
    })

    // valid
    traceManager.processSpan({
      ...mockSpanWithoutScope,
      relatedTo: { ticketId: '123' },
    })

    // valid - multiple relatedTo simultaneously
    traceManager.processSpan({
      ...mockSpanWithoutScope,
      relatedTo: {
        ticketId: '123',
        customFieldId: '123',
      },
    })

    // invalid
    traceManager.processSpan({
      ...mockSpanWithoutScope,
      relatedTo: {
        // @ts-expect-error bad relatedTo
        bad: '123',
      },
    })

    // invalid
    traceManager.processSpan({
      ...mockSpanWithoutScope,
      relatedTo: {
        // @ts-expect-error bad relatedTo
        ticketId: 123,
      },
    })
  })

  it('does not allow to include invalid relatedTo value', () => {
    const tracer = traceManager.createTracer({
      name: 'ticket.relatedTo-operation',
      type: 'operation',
      relations: 'ticket',
      variants: {
        origin: { timeout: 5_000 },
      },
      requiredSpans: [{ name: 'end', withTraceRelations: true }],
    })
    const traceId = tracer.start({
      relatedTo: {
        // @ts-expect-error number should not be assignable to string
        ticketId: 4,
      },
      variant: 'origin',
    })
    assertType(traceId)
  })

  it('mixed relatedTo', () => {
    const tracer = traceManager.createTracer({
      name: 'ticket.relatedTo-operation',
      type: 'operation',
      relations: 'tickedField',
      requiredSpans: [{ name: 'end', withTraceRelations: true }],
      variants: { default: { timeout: 5_000 } },
    })
    const traceId = tracer.start({
      variant: 'default',
      relatedTo: {
        customFieldId: '3',
        ticketId: '4',
      },
    })
  })

  it('redaction example', () => {
    const tracer = traceManager.createTracer({
      name: 'ticket.event.redacted',
      type: 'operation',
      relations: 'ticketEvent',
      variants: {
        origin: { timeout: 5_000 },
      },
      requiredSpans: [{ name: 'OmniLogEvent', withTraceRelations: true }],
      debounceOnSpans: [{ name: 'OmniLog', withTraceRelations: ['ticketId'] }],
    })
    const traceId = tracer.start({
      relatedTo: {
        ticketId: '4',
        eventId: '3',
      },
      variant: 'origin',
    })
    assertType<string | undefined>(traceId)
  })

  it('redaction invalid example', () => {
    const tracer = traceManager.createTracer({
      name: 'ticket.event.redacted',
      type: 'operation',
      // @ts-expect-error enforce a complete set of keys of a given relatedTo
      relations: ['eventId'],
      timeout: 5_000,
      requiredSpans: [{ name: 'OmniLogEvent', withTraceRelations: true }],
    })

    const correctTracer = traceManager.createTracer({
      name: 'ticket.event.redacted',
      type: 'operation',
      relations: 'ticketEvent',
      variants: {
        origin: { timeout: 5_000 },
      },
      requiredSpans: [{ name: 'OmniLogEvent', withTraceRelations: true }],
    })
    const traceId = correctTracer.start({
      relatedTo: {
        ticketId: '4',
        // @ts-expect-error trying to start trace with invalid relatedTo combination
        customFieldId: 'werwer',
      },
      variant: 'origin',
    })
  })

  it('does not allow to include invalid relatedTo key', () => {
    const tracer = traceManager.createTracer({
      name: 'ticket.relatedTo-operation',
      type: 'operation',
      relations: 'ticket',
      variants: {
        origin: { timeout: 5_000 },
      },
      requiredSpans: [{ name: 'end', withTraceRelations: true }],
    })
    const traceId = tracer.start({
      variant: 'origin',
      relatedTo: {
        // @ts-expect-error invalid relatedTo key
        userId: '3',
      },
    })
    assertType(traceId)
  })

  it('maps schema to types', () => {
    const testSchema = {
      a: String,
      b: Number,
      c: Boolean,
      d: ['union', 'of', 'things', 2],
    } as const

    type MappedTest = MapSchemaToTypes<typeof testSchema>

    assertType<{
      readonly a: string
      readonly b: number
      readonly c: boolean
      readonly d: 'union' | 'of' | 'things' | 2
    }>({} as MappedTest)
  })

  it('maps computedValueDefinitions', () => {
    const tracer = traceManager.createTracer({
      name: 'ticket.multiple-computed-values',
      type: 'operation',
      relations: 'global',
      requiredSpans: [{ name: 'end' }],
      variants: {
        cold_boot: { timeout: 10_000 },
      },
      computedValueDefinitions: {
        'valid-feature-count': {
          matches: [{ name: 'feature' }, { name: 'feature-2' }],
          computeValueFromMatches: (feature, feature2) =>
            feature.length + feature2.length,
        },
        'invalid-feature-count': {
          matches: [{ name: 'feature' }, { name: 'feature-2' }],
          // @ts-expect-error invalid number of arguments
          computeValueFromMatches: (feature, feature2, invalid) => 0,
        },
        'error-count': {
          matches: [{ name: (name) => name.startsWith('error') }],
          computeValueFromMatches: (errors) => errors.length,
        },
        another: {
          matches: [(name) => name.span.name.startsWith('error')],
          computeValueFromMatches: (errors) => errors.length,
        },
        // TODO: adding a function breaks the type for some odd reason
        // https://github.com/microsoft/TypeScript/issues/61228
      },
    })
  })
})
