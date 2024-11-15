/* eslint-disable import/no-extraneous-dependencies */
import React from 'react'
import { Cell, Row } from '@zendeskgarden/react-tables'

interface TicketProps {
  id: number
  subject: string
  onClick: (id: number) => void
}

export const Ticket: React.FC<TicketProps> = ({ id, subject, onClick }) => (
  <Row
    onClick={() => void onClick(id)}
    style={{ cursor: 'pointer' }}
    isStriped={id % 2 === 0}
  >
    <Cell width={70}>{id}</Cell>
    <Cell>{subject}</Cell>
  </Row>
)
