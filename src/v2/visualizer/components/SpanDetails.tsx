/* eslint-disable import/no-extraneous-dependencies */
import React from 'react'
import styled from 'styled-components'
import { Sheet } from '@zendeskgarden/react-chrome'
import { getColor } from '@zendeskgarden/react-theming'
import { DETAILS_PANEL_WIDTH } from '../constants'
import { MappedSpanAndAnnotation } from '../types'

const DetailsContainer = styled.div`
  width: ${DETAILS_PANEL_WIDTH}px;
  flex-shrink: 0;
  position: relative;
  height: 100vh;
  background-color: ${(props) =>
    getColor({ theme: props.theme, variable: 'background.default' })};
`

const StyledSheet = styled(Sheet)`
  position: sticky;
  top: 0;
  height: 80vh;
  width: ${DETAILS_PANEL_WIDTH}px;
  max-width: 100%;
  border-radius: ${(props) => props.theme.borderRadii.md} 0 0
    ${(props) => props.theme.borderRadii.md};
  box-shadow: ${(props) =>
    props.theme.shadows.lg(
      '-2px',
      '8px',
      getColor({ theme: props.theme, variable: 'shadow.large' }),
    )};
`

const DetailRow = styled.div`
  margin-bottom: ${(props) => props.theme.space.xs};
  border-radius: ${(props) => props.theme.borderRadii.sm};
  background-color: ${(props) =>
    getColor({ theme: props.theme, variable: 'background.raised' })};

  &:last-child {
    margin-bottom: 0;
  }
`

const Label = styled.span`
  display: block;
  font-weight: ${(props) => props.theme.fontWeights.semibold};
  margin-bottom: ${(props) => props.theme.space.xs};
  color: ${(props) =>
    getColor({ theme: props.theme, variable: 'foreground.primary' })};
`

const Value = styled.span`
  color: ${(props) =>
    getColor({ theme: props.theme, variable: 'foreground.default' })};
  font-family: ${(props) => props.theme.fonts.mono};
`

const JsonValue = styled.pre`
  font-family: ${(props) => props.theme.fonts.mono};
  font-size: ${(props) => props.theme.fontSizes.sm};
  background: ${(props) =>
    getColor({ theme: props.theme, variable: 'background.recessed' })};
  color: ${(props) =>
    getColor({ theme: props.theme, variable: 'foreground.default' })};
  padding: ${(props) => props.theme.space.sm};
  border-radius: ${(props) => props.theme.borderRadii.sm};
  border: ${(props) => props.theme.borders.sm};
  border-color: ${(props) =>
    getColor({ theme: props.theme, variable: 'border.default' })};
  overflow: auto;
  max-height: 200px;
  margin-top: ${(props) => props.theme.space.xs};
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
            <Label>Start Time</Label>
            <Value>
              {span.annotation.operationRelativeStartTime.toFixed(2)}ms
            </Value>
          </DetailRow>
          <DetailRow>
            <Label>Duration</Label>
            <Value>{span.span.duration.toFixed(2)}ms</Value>
          </DetailRow>
          <DetailRow>
            <Label>Occurrence</Label>
            <Value>{span.annotation.occurrence}</Value>
          </DetailRow>
          {span.span.performanceEntry && (
            <DetailRow>
              <Label>Performance Entry</Label>
              <JsonValue>
                {JSON.stringify(span.span.performanceEntry, null, 2)}
              </JsonValue>
            </DetailRow>
          )}
          {span.span.attributes && (
            <DetailRow>
              <Label>Attributes</Label>
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
