/* eslint-disable no-magic-numbers */
/* eslint-disable import/no-extraneous-dependencies */
import React, { useMemo, useState } from 'react'
import { Axis, AxisLeft } from '@visx/axis'
import { Grid } from '@visx/grid'
import { Group } from '@visx/group'
import { LegendItem, LegendLabel, LegendOrdinal } from '@visx/legend'
import { scaleBand, scaleLinear, scaleOrdinal } from '@visx/scale'
import { useTooltip } from '@visx/tooltip'
import {
  type FilterOption,
  BAR_FILL_COLOR,
  DETAILS_PANEL_WIDTH,
} from '../constants'
import { MappedOperation } from '../mapTicketActivationData'
import { MappedSpanAndAnnotation } from '../types'
import { FilterGroup } from './FilterGroup'
import InteractiveSpan from './InteractiveSpan'
import { LegendGroup } from './Legend'
import SpanDetails from './SpanDetails'
import {
  Container,
  Footer,
  FooterContent,
  Header,
  ScrollContainer,
  StyledRect,
  StyledTooltip,
  Title,
  TooltipContent,
  TooltipTitle,
} from './styled'

const DEFAULT_MARGIN = { top: 50, left: 200, right: 120, bottom: 30 }

export interface OperationVisualizationProps {
  width: number
  operation: MappedOperation
  setDisplayOptions: React.Dispatch<
    React.SetStateAction<Record<FilterOption, boolean>>
  >
  displayOptions: Record<FilterOption, boolean>
  margin?: { top: number; right: number; bottom: number; left: number }
}

const OperationVisualization: React.FC<OperationVisualizationProps> = ({
  width: containerWidth,
  operation,
  displayOptions,
  setDisplayOptions,
  margin = DEFAULT_MARGIN,
}) => {
  const { spanEvents, spanTypes, uniqueGroups, spansWithDuration } = operation

  const [selectedSpan, setSelectedSpan] =
    useState<MappedSpanAndAnnotation | null>(null)

  // Adjust width when panel is open
  const width = selectedSpan
    ? containerWidth - DETAILS_PANEL_WIDTH + 100
    : containerWidth

  // Render proportions
  const tickHeight = 20
  const height = uniqueGroups.length * tickHeight + margin.top + margin.bottom

  const footerHeight = 100
  const footerScaleHeight = 30

  const xMax = width - margin.left - margin.right
  const yMax = height - margin.bottom - margin.top

  const xScale = scaleLinear({
    domain: [0, operation.duration + 10],
    range: [0, xMax],
  })

  const labelScale = useMemo(
    () =>
      scaleBand({
        domain: uniqueGroups,
        range: [0, yMax],
        padding: 0.2,
      }),
    [uniqueGroups, yMax],
  )

  const colorScale = scaleOrdinal({
    domain: [...spanTypes],
    range: [...spanTypes].map((kind) => BAR_FILL_COLOR[kind]),
  })

  const {
    tooltipOpen,
    tooltipLeft,
    tooltipTop,
    tooltipData,
    hideTooltip,
    showTooltip,
  } = useTooltip<MappedSpanAndAnnotation>()
  const handleSpanClick = (span: MappedSpanAndAnnotation) => {
    setSelectedSpan(span)
  }

  const getBarOpacity = (entry: MappedSpanAndAnnotation) => {
    if (
      selectedSpan &&
      selectedSpan.span.name === entry.span.name &&
      selectedSpan.span.startTime === entry.span.startTime
    ) {
      return 0.8 // Selected state
    }
    return 0.4 // Default state
  }

  // Add ref for scroll container
  const scrollContainerRef = React.useRef<HTMLDivElement>(null)

  return (
    <Container width={containerWidth}>
      <ScrollContainer ref={scrollContainerRef} width={width}>
        <Header>
          <Title>Operation: {operation.name}</Title>
        </Header>
        <main style={{ height: `${height + margin.top + margin.bottom}px` }}>
          <svg width={width - margin.right} height={height}>
            <Group top={margin.top} left={margin.left}>
              <Grid
                xScale={xScale}
                yScale={labelScale}
                width={xMax}
                height={yMax}
                numTicksRows={uniqueGroups.length}
              />
              {spanEvents.map((entry, index) => (
                <InteractiveSpan
                  key={`spanEvent-${index}`}
                  type="line"
                  data={entry}
                  from={{
                    x: xScale(entry.annotation.operationRelativeStartTime),
                    y: 0,
                  }}
                  to={{
                    x: xScale(entry.annotation.operationRelativeStartTime),
                    y: yMax,
                  }}
                  stroke={BAR_FILL_COLOR[entry.type]}
                  strokeOpacity={0.3}
                  strokeWidth={2.5}
                  strokeDasharray="8,2"
                  opacity={0.8}
                  showTooltip={showTooltip}
                  hideTooltip={hideTooltip}
                  onClick={() => void handleSpanClick(entry)}
                  scrollContainerRef={scrollContainerRef}
                />
              ))}

              {spansWithDuration.map((entry, i) => (
                <React.Fragment key={`entry-${i}`}>
                  <InteractiveSpan
                    type="bar"
                    data={entry}
                    x={xScale(entry.annotation.operationRelativeStartTime)}
                    y={labelScale(`${entry.groupName}`)}
                    width={xScale(entry.span.duration)}
                    height={labelScale.bandwidth()}
                    fill={BAR_FILL_COLOR[entry.type]}
                    opacity={getBarOpacity(entry)}
                    rx={4}
                    showTooltip={showTooltip}
                    hideTooltip={hideTooltip}
                    onClick={() => void handleSpanClick(entry)}
                    scrollContainerRef={scrollContainerRef}
                  />
                  {(entry.annotation.markedComplete ||
                    entry.annotation.markedPageInteractive) && (
                    <InteractiveSpan
                      type="line"
                      title={
                        entry.annotation.markedComplete
                          ? 'complete'
                          : 'interactive'
                      }
                      annotateAt="top"
                      xCoordinate={xScale(
                        entry.annotation.operationRelativeEndTime,
                      )}
                      color="red"
                      data={entry}
                      from={{
                        x: xScale(entry.annotation.operationRelativeEndTime),
                        y: 0,
                      }}
                      to={{
                        x: xScale(entry.annotation.operationRelativeEndTime),
                        y: yMax,
                      }}
                      stroke="red"
                      strokeOpacity={0.3}
                      strokeWidth={2.5}
                      strokeDasharray="8,2"
                      opacity={0.8}
                      showTooltip={showTooltip}
                      hideTooltip={hideTooltip}
                      onClick={() => void handleSpanClick(entry)}
                      scrollContainerRef={scrollContainerRef}
                    />
                  )}
                </React.Fragment>
              ))}
              <AxisLeft
                scale={labelScale}
                numTicks={uniqueGroups.length}
                tickLabelProps={{
                  fill: '#888',
                  fontSize: 10,
                  textAnchor: 'end',
                  dy: '0.33em',
                  width: 100,
                }}
                tickFormat={(value) => value}
              />
              <Axis scale={xScale} top={yMax} />
            </Group>
          </svg>
        </main>
        <Footer width={width} height={footerHeight + footerScaleHeight}>
          <svg width={width - margin.right} height={footerScaleHeight}>
            <Axis scale={xScale} top={1} left={margin.left} />
          </svg>
          <FooterContent>
            <FilterGroup setState={setDisplayOptions} state={displayOptions} />
            <LegendGroup>
              <LegendOrdinal
                scale={colorScale}
                labelFormat={(label) => `${label.toUpperCase()}`}
              >
                {(labels) => (
                  <div style={{ display: 'flex', flexDirection: 'row' }}>
                    {labels.map((label, i) => (
                      <LegendItem key={`legend-${i}`} margin="0 5px">
                        <svg width={15} height={15}>
                          <StyledRect
                            fill={label.value}
                            width={15}
                            height={15}
                          />
                        </svg>
                        <LegendLabel align="left" margin="0 0 0 4px">
                          {label.text}
                        </LegendLabel>
                      </LegendItem>
                    ))}
                  </div>
                )}
              </LegendOrdinal>
            </LegendGroup>
          </FooterContent>
        </Footer>
        {tooltipOpen && tooltipData && (
          <StyledTooltip top={tooltipTop} left={tooltipLeft}>
            <div>
              <TooltipTitle>{tooltipData.span.name}</TooltipTitle>
              <TooltipContent>
                <div>kind: {tooltipData.type}</div>
                <div>occurrence: {tooltipData.annotation.occurrence}</div>
                <div>
                  start:{' '}
                  {tooltipData.annotation.operationRelativeStartTime.toFixed(2)}
                  ms
                </div>
                <div>duration: {tooltipData.span.duration.toFixed(2)}ms</div>
              </TooltipContent>
            </div>
          </StyledTooltip>
        )}
      </ScrollContainer>
      <SpanDetails
        span={selectedSpan}
        onClose={() => void setSelectedSpan(null)}
      />
    </Container>
  )
}

// eslint-disable-next-line import/no-default-export
export default OperationVisualization
