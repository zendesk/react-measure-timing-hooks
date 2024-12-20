/* eslint-disable import/no-extraneous-dependencies */
import React from 'react'
import styled from 'styled-components'
import { Sheet } from '@zendeskgarden/react-chrome'
import { type IGardenTheme, getColor } from '@zendeskgarden/react-theming'
import { DETAILS_PANEL_WIDTH } from '../constants'
import { MappedSpanAndAnnotation } from '../types'

const DetailsContainer = styled.div`
  width: ${DETAILS_PANEL_WIDTH}px;
  flex-shrink: 0;
  position: relative;
  height: 100vh;
`

const StyledSheet = styled(Sheet)`
  position: sticky;
  top: 0;
  height: 80vh;
  width: ${DETAILS_PANEL_WIDTH}px;
  max-width: 100%;
  border-radius: 8px 0 0 8px;
  box-shadow: -2px 0 8px rgba(0, 0, 0, 0.1);
  margin: 20px 0;
`

const DetailRow = styled.div`
  margin-bottom: 12px;
`

const Label = styled.span`
  font-weight: 600;
  margin-right: 8px;
`

const JsonValue = styled.pre`
  background: ${(props) =>
    getColor({
      theme: props.theme as IGardenTheme,
      hue: 'neutralHue',
      shade: 800,
    })};
  color: ${(props) =>
    getColor({
      theme: props.theme as IGardenTheme,
      hue: 'neutralHue',
      shade: 100,
    })};
  padding: 12px;
  border-radius: 4px;
  overflow: auto;
  max-height: 200px;
`

interface SpanDetailsProps {
  span: MappedSpanAndAnnotation | null
  onClose: () => void
}

const SpanDetails: React.FC<SpanDetailsProps> = ({ span, onClose }) => {
  if (!span) return null

  return (
    <DetailsContainer>
      <StyledSheet isOpen={!!span}>
        <Sheet.Header>
          <Sheet.Title>{span.groupName}</Sheet.Title>
          <Sheet.Description>Type: {span.type}</Sheet.Description>
        </Sheet.Header>
        <Sheet.Body>
          <DetailRow>
            <Label>Start Time:</Label>
            {span.annotation.operationRelativeStartTime.toFixed(2)}ms
          </DetailRow>
          <DetailRow>
            <Label>Duration:</Label>
            {span.span.duration.toFixed(2)}ms
          </DetailRow>
          <DetailRow>
            <Label>Occurrence:</Label>
            {span.annotation.occurrence}
          </DetailRow>
          {span.span.performanceEntry && (
            <DetailRow>
              <Label>Performance Entry:</Label>
              <JsonValue>
                {JSON.stringify(span.span.performanceEntry, null, 2)}
              </JsonValue>
            </DetailRow>
          )}
          {span.span.attributes && (
            <DetailRow>
              <Label>Attributes:</Label>
              <JsonValue>
                {JSON.stringify(span.span.attributes, null, 2)}
              </JsonValue>
            </DetailRow>
          )}
        </Sheet.Body>
        <Sheet.Close aria-label="Close" onClick={onClose} />
      </StyledSheet>
    </DetailsContainer>
  )
}

export default SpanDetails
