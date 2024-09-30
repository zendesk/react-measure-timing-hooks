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
import type { Operation } from '../../v2/operation'
import { mockTickets } from './mockTickets'
import { operationManager } from './operationManager'
import { TicketList } from './TicketList'
import { TicketView } from './TicketView'

export const App: React.FC = () => {
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null)
  const [selectedTicketIds, setSelectedTicketIds] = useState<number[]>([])

  const handleTicketClick = (id: number) => {
    const onTracked = (operation: Operation) =>
      void console.log(
        `Ticket ${id}: ${operation.state}`,
        operation,
        operation.getEvents(),
      )
    operationManager.startOperation({
      operationName: `ticket-activation`,
      track: [
        {
          match: { type: 'component-unmount', attributes: { ticketId: id } },
          interruptWhenSeen: true,
        },
        {
          match: { attributes: { ticketId: id } },
          debounceEndWhenSeen: { debounceBy: 1_000 },
        },
        {
          match: { attributes: { ticketId: id, visibleState: 'complete' } },
          requiredToEnd: true,
        },
      ],
      onTracked,
      onEnd: onTracked,
      waitUntilInteractive: true,
      interruptSelf: true,
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
