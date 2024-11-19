/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable no-magic-numbers */
import React, { useEffect, useState } from 'react'
import { Button } from '@zendeskgarden/react-buttons'
import {
  Body,
  Chrome,
  Content,
  Footer,
  Header,
  Main,
  Nav,
} from '@zendeskgarden/react-chrome'
import { PALETTE, ThemeProvider } from '@zendeskgarden/react-theming'
import { ReactComponent as MenuTrayIcon } from '@zendeskgarden/svg-icons/src/16/grid-2x2-stroke.svg'
import { ReactComponent as PersonIcon } from '@zendeskgarden/svg-icons/src/16/user-solo-stroke.svg'
import { ReactComponent as ClearIcon } from '@zendeskgarden/svg-icons/src/26/arrow-right-left.svg'
import { ReactComponent as ProductIcon } from '@zendeskgarden/svg-icons/src/26/garden.svg'
import { ReactComponent as HomeIcon } from '@zendeskgarden/svg-icons/src/26/home-fill.svg'
import { ReactComponent as ZendeskIcon } from '@zendeskgarden/svg-icons/src/26/zendesk.svg'
import { observePerformanceWithTraceManager } from '../../v3/observePerformanceWithTraceManager'
// CYN: NEED UPDATE
import { mockTickets } from './mockTickets'
import { TicketList } from './TicketList'
import { TicketView } from './TicketView'
import { traceManager } from './traceManager'

const ticketOperationTracer = traceManager.createTracer({
  name: `ticket-activation`,
  type: 'operation',
  // requiredScopeKeys: TicketIdScope,
  requiredToEnd: [
    {
      name: 'TicketView',
      scopes: ['ticketId'],
      type: 'component-render',
      isIdle: true,
    },
  ],
  requiredScopeKeys: ['ticketId'],
  // debounceDuration: 1_000,
  timeoutDuration: 45_000,
  debounceOn: [
    {
      name: 'TicketView',
      scopes: ['ticketId'],
    },
  ],
  interruptOn: [
    {
      name: 'TicketView',
      scopes: ['ticketId'],
      type: 'component-unmount',
    },
  ],
  captureInteractive: true,
})

// simulate an event every 2 seconds
const simulateEventPeriodically = (ticketId: number | null) => {
  const interval = setInterval(() => {
    performance.mark(`ticket-${ticketId}-event`)
  }, 4_000)

  return () => void clearInterval(interval)
}

export const App: React.FC = () => {
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null)
  const [selectedTicketIds, setSelectedTicketIds] = useState<number[]>([])
  useEffect(
    () => simulateEventPeriodically(selectedTicketId),
    [selectedTicketId],
  )

  const handleTicketClick = (id: number) => {
    // traceManager.startOperation({
    //   operationName: `ticket-activation`,
    //   track: [
    //     {
    //       match: { type: 'component-unmount', attributes: { ticketId: id } },
    //       interruptWhenSeen: true,
    //     },
    //     {
    //       match: { attributes: { ticketId: id } },
    //       debounceEndWhenSeen: { debounceBy: 1_000 },
    //     },
    //     {
    //       match: { attributes: { ticketId: id, visibleState: 'complete' } },
    //       requiredToEnd: true,
    //     },
    //   ],
    //   onTracked,
    //   onEnd: onTracked,
    //   waitUntilInteractive: true,
    //   interruptSelf: true,
    // })
    ticketOperationTracer.start({ scope: { ticketId: id } })

    setSelectedTicketId(id)
  }

  const handleBack = () => {
    setSelectedTicketId(null)
  }

  return (
    <ThemeProvider>
      <Chrome isFluid>
        <Nav aria-label="chrome default example">
          <Nav.Item hasLogo>
            <Nav.ItemIcon>
              <ProductIcon style={{ color: PALETTE.green[400] }} />
            </Nav.ItemIcon>
            <Nav.ItemText>Zendesk Garden</Nav.ItemText>
          </Nav.Item>
          <Nav.Item
            isCurrent={!selectedTicketId}
            onClick={() => void handleBack()}
            title="Ticket List"
          >
            <Nav.ItemIcon>
              <HomeIcon />
            </Nav.ItemIcon>
            <Nav.ItemText>Ticket List</Nav.ItemText>
          </Nav.Item>
          <Nav.Item
            onClick={() => {
              setSelectedTicketIds([])
              setSelectedTicketId(null)
            }}
            title="Reset Cache"
          >
            <Nav.ItemIcon>
              <ClearIcon />
            </Nav.ItemIcon>
            <Nav.ItemText>Reset</Nav.ItemText>
          </Nav.Item>
          <Nav.Item hasBrandmark title="Zendesk">
            <Nav.ItemIcon>
              <ZendeskIcon />
            </Nav.ItemIcon>
            <Nav.ItemText>Zendesk</Nav.ItemText>
          </Nav.Item>
        </Nav>
        <Body>
          <Header>
            <Header.Item>
              <Header.ItemIcon>
                <MenuTrayIcon />
              </Header.ItemIcon>
              <Header.ItemText isClipped>Products</Header.ItemText>
            </Header.Item>
            <Header.Item isRound>
              <Header.ItemIcon>
                <PersonIcon />
              </Header.ItemIcon>
              <Header.ItemText isClipped>User</Header.ItemText>
            </Header.Item>
          </Header>
          <Content>
            <Main style={{ padding: 28 }}>
              {selectedTicketId === null ? (
                <TicketList
                  tickets={mockTickets}
                  onTicketClick={handleTicketClick}
                />
              ) : (
                <TicketView
                  ticketId={selectedTicketId}
                  cached={selectedTicketIds.includes(selectedTicketId)}
                  onLoaded={() => {
                    setSelectedTicketIds([
                      ...selectedTicketIds,
                      selectedTicketId,
                    ])
                  }}
                />
              )}
            </Main>
          </Content>
          <Footer>
            <Footer.Item>
              <Button isBasic>Cancel</Button>
            </Footer.Item>
            <Footer.Item>
              <Button isPrimary>Save</Button>
            </Footer.Item>
          </Footer>
        </Body>
      </Chrome>
    </ThemeProvider>
  )
}
