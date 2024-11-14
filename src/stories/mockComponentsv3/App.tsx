import React, { useState } from 'react'
import { Button } from '@zendeskgarden/react-buttons'
import {
  Body,
  Chrome,
  Content,
  Footer,
  FooterItem,
  Header,
  HeaderItem,
  HeaderItemIcon,
  HeaderItemText,
  Main,
  Nav,
  NavItem,
  NavItemIcon,
  NavItemText,
} from '@zendeskgarden/react-chrome'
import { PALETTE } from '@zendeskgarden/react-theming'
import { ReactComponent as MenuTrayIcon } from '@zendeskgarden/svg-icons/src/16/grid-2x2-stroke.svg'
import { ReactComponent as PersonIcon } from '@zendeskgarden/svg-icons/src/16/user-solo-stroke.svg'
import { ReactComponent as ClearIcon } from '@zendeskgarden/svg-icons/src/26/arrow-right-left.svg'
import { ReactComponent as ProductIcon } from '@zendeskgarden/svg-icons/src/26/garden.svg'
import { ReactComponent as HomeIcon } from '@zendeskgarden/svg-icons/src/26/home-fill.svg'
import { ReactComponent as ZendeskIcon } from '@zendeskgarden/svg-icons/src/26/zendesk.svg'
// CYN: NEED UPDATE
import { mockTickets } from './mockTickets'
import { TicketList } from './TicketList'
import { TicketView } from './TicketView'
import type { TicketIdScope } from './traceManager'
import { traceManager } from './traceManager'
import { observePerformanceWithTraceManager } from '../../v3/observePerformanceWithTraceManager'

export const App: React.FC = () => {
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null)
  const [selectedTicketIds, setSelectedTicketIds] = useState<number[]>([])

  observePerformanceWithTraceManager(traceManager, [
    'element',
    'event',
    'first-input',
    'largest-contentful-paint',
    'layout-shift',
    // 'long-animation-frame',
    'longtask',
    'mark',
    'measure',
    'navigation',
    'paint',
    'resource',
    'visibility-state',
  ])

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
    const tracer = traceManager.createTracer({
      name: `ticket-activation`,
      type: 'operation',
      // requiredScopeKeys: TicketIdScope,
      requiredToEnd: [
        {
          name: 'TicketView',
          scope: {
            ticketId: id,
          },
          type: 'component-unmount',
          // isIdle: true,
          status: 'ok',
          // occurrence: 2,
        },
      ],
      requiredScopeKeys: ['ticketId'],
      // debounceDuration: 1_000,
      timeoutDuration: 45_000,
      // debounceOn: [
      //   {
      //     match: { attributes: { ticketId: id } },

      //   },
      // ],
      interruptOn: [
        {
          name: 'TicketView',
          scope: {
            ticketId: id,
          },
          type: 'component-unmount',
        },
      ],
    })
    tracer.start({
      scope: {
        ticketId: id,
      },
      attributes: {
        ticketId: id,
      },
      startTime: {
        now: performance.now(),
      },
    })

    setSelectedTicketId(id)
  }

  const handleBack = () => {
    setSelectedTicketId(null)
  }

  return (
    <Chrome isFluid>
      <Nav aria-label="chrome default example">
        <NavItem hasLogo>
          <NavItemIcon>
            <ProductIcon style={{ color: PALETTE.green[400] }} />
          </NavItemIcon>
          <NavItemText>Zendesk Garden</NavItemText>
        </NavItem>
        <NavItem
          isCurrent={!selectedTicketId}
          onClick={() => void handleBack()}
          title="Ticket List"
        >
          <NavItemIcon>
            <HomeIcon />
          </NavItemIcon>
          <NavItemText>Ticket List</NavItemText>
        </NavItem>
        <NavItem
          onClick={() => {
            setSelectedTicketIds([])
            setSelectedTicketId(null)
          }}
          title="Reset Cache"
        >
          <NavItemIcon>
            <ClearIcon />
          </NavItemIcon>
          <NavItemText>Reset</NavItemText>
        </NavItem>
        <NavItem hasBrandmark title="Zendesk">
          <NavItemIcon>
            <ZendeskIcon />
          </NavItemIcon>
          <NavItemText>Zendesk</NavItemText>
        </NavItem>
      </Nav>
      <Body hasFooter>
        <Header>
          <HeaderItem>
            <HeaderItemIcon>
              <MenuTrayIcon />
            </HeaderItemIcon>
            <HeaderItemText isClipped>Products</HeaderItemText>
          </HeaderItem>
          <HeaderItem isRound>
            <HeaderItemIcon>
              <PersonIcon />
            </HeaderItemIcon>
            <HeaderItemText isClipped>User</HeaderItemText>
          </HeaderItem>
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
                  setSelectedTicketIds([...selectedTicketIds, selectedTicketId])
                }}
              />
            )}
          </Main>
        </Content>
        <Footer>
          <FooterItem>
            <Button isBasic>Cancel</Button>
          </FooterItem>
          <FooterItem>
            <Button isPrimary>Save</Button>
          </FooterItem>
        </Footer>
      </Body>
    </Chrome>
  )
}
