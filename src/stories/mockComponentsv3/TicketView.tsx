import React, { useEffect } from 'react'
import styled from 'styled-components'
import { Timeline } from '@zendeskgarden/react-accordions'
import { Avatar } from '@zendeskgarden/react-avatars'
import { Skeleton } from '@zendeskgarden/react-loaders'
import { Well } from '@zendeskgarden/react-notifications'
import { DEFAULT_THEME, PALETTE } from '@zendeskgarden/react-theming'
import { Paragraph, Span, XXL } from '@zendeskgarden/react-typography'
import { ReactComponent as UserIcon } from '@zendeskgarden/svg-icons/src/16/user-solo-stroke.svg'
import { VISIBLE_STATE } from '../../main'
import { TimingComponent } from '../../v2/element'
import {
  useCaptureRenderBeaconTask,
  useRenderProcessTrace,
} from '../../v2/hooks'
import { mockTickets } from './mockTickets'
import { traceManager } from './traceManager'
import { generateUseBeacon } from '../../v3/hooks'
import { observePerformanceWithTraceManager } from '../../v3/observePerformanceWithTraceManager'

export const StyledSpan = styled(Span).attrs({ isBold: true, hue: 'blue' })`
  margin-left: ${DEFAULT_THEME.space.base * 2}px;
`
export const MessageSpan = styled(Span).attrs({})`
  display: block;
`
const TimelineContentWide = styled(Timeline.Content)`
  flex: 5;
`

interface TicketViewProps {
  ticketId: number
  cached?: boolean
  onLoaded?: () => void
}

export const TicketView: React.FC<TicketViewProps> = ({
  ticketId,
  cached = false,
  onLoaded,
}) => {
  // useRenderProcessTrace(
  //   {
  //     operationManager: traceManager,
  //     operationName: 'TicketView',
  //     onEnd: (trace) => {
  //       console.log('TicketView trace', trace, 'ticketId', ticketId)
  //     },
  //     track: [
  //       { match: { attributes: { ticketId } } },
  //       {
  //         //debounce on any event that has the same ticket id
  //         match: { attributes: { ticketId, visibleState: 'complete' } }, //required to end the operation, ticket fully loaded!
  //         requiredToEnd: true,
  //       },
  //     ],
  //   },
  //   [ticketId],
  // )

  // useCaptureRenderBeaconTask({
  //   componentName: 'TicketView',
  //   attributes: { ticketId, loading: !cached },
  //   visibleState: cached ? VISIBLE_STATE.COMPLETE : VISIBLE_STATE.LOADING,
  //   operationManager: traceManager,
  // })

  // observePerformanceWithTraceManager(traceManager, [])
  const tracingBeacon = generateUseBeacon(traceManager)
  tracingBeacon({
    name: 'TicketView',
    scope: { ticketId },
    renderedOutput: 'content',
    isIdle: false,
    attributes: { ticketId },
  })

  const ticket = mockTickets.find((ticket) => ticket.id === ticketId)

  useEffect(() => {
    const timer = setTimeout(() => {
      performance.mark('TicketViewLoaded')
      onLoaded?.()
      // eslint-disable-next-line no-magic-numbers
    }, 1_500)
    return () => void clearTimeout(timer)
  }, [ticketId])

  if (!ticket) {
    return (
      <Well>
        <Paragraph>No ticket found</Paragraph>
      </Well>
    )
  }

  return (
    <Well>
      <XXL>Ticket: {ticket.subject}</XXL>
      {!cached ? (
        <>
          <Skeleton />
          <Skeleton />
          <Skeleton />
          <Skeleton />
          <Skeleton />
        </>
      ) : (
        <>
          <Timeline>
            <TimingComponent name={`TicketView/${ticketId}`} />
            {ticket.messages.map((msg, index) => (
              <Timeline.Item key={index}>
                <Timeline.OppositeContent>
                  <Span hue="grey">{msg.humanReadableTimestamp}</Span>
                </Timeline.OppositeContent>
                <TimelineContentWide>
                  <Avatar size="extrasmall" backgroundColor={PALETTE.grey[600]}>
                    {msg.authorType === 'customer' ? (
                      <img
                        alt="image avatar"
                        src="https://garden.zendesk.com/components/avatar/user.png"
                      />
                    ) : (
                      <UserIcon
                        role="img"
                        aria-label="extra small user avatar"
                      />
                    )}
                  </Avatar>
                  <StyledSpan>{msg.author}</StyledSpan>
                  <MessageSpan>{msg.message}</MessageSpan>
                </TimelineContentWide>
              </Timeline.Item>
            ))}
          </Timeline>
        </>
      )}
    </Well>
  )
}
