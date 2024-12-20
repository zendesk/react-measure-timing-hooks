/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable no-magic-numbers */
/* eslint-disable import/no-extraneous-dependencies */
import React, { useMemo, useRef, useState } from 'react'
import styled from 'styled-components'
import { Annotation, Label } from '@visx/annotation'
import { Axis, AxisLeft } from '@visx/axis'
import { localPoint } from '@visx/event'
import { Grid } from '@visx/grid'
import { Group } from '@visx/group'
import { LegendItem, LegendLabel, LegendOrdinal } from '@visx/legend'
import { scaleBand, scaleLinear, scaleOrdinal } from '@visx/scale'
import { Bar, Line } from '@visx/shape'
import {
  defaultStyles as defaultTooltipStyles,
  TooltipWithBounds,
  useTooltip,
} from '@visx/tooltip'
import { WithTooltipProvidedProps } from '@visx/tooltip/lib/enhancers/withTooltip'
import { ToggleButton } from '@zendeskgarden/react-buttons'
import { Grid as GardenGrid } from '@zendeskgarden/react-grid'
import { getColor } from '@zendeskgarden/react-theming'
import { Tooltip } from '@zendeskgarden/react-tooltips'
import {
  type FilterOption,
  BAR_FILL_COLOR,
  DETAILS_PANEL_WIDTH,
  FILTER_OPTIONS,
} from '../constants'
import { MappedOperation } from '../mapTicketActivationData'
import { MappedSpanAndAnnotation } from '../types'
import SpanDetails from './SpanDetails'

const DEFAULT_MARGIN = { top: 50, left: 200, right: 120, bottom: 30 }

const StyledLine = styled(Line)`
  cursor: pointer;
  transition: all 0.2s ease-in-out;

  &:hover {
    stroke-opacity: 0.8;
    stroke-width: 3.5px;
    filter: brightness(1.2);
  }
`

export interface TTLineProps {
  hoverData: MappedSpanAndAnnotation
  xCoordinate: number
  yMax: number
  showTooltip: (
    data: Partial<WithTooltipProvidedProps<MappedSpanAndAnnotation>>,
  ) => void
  hideTooltip: () => void
  title: string
  color?: string
  annotateAt?: 'top' | 'none'
  onClick?: () => void
  scrollContainerRef: React.RefObject<HTMLDivElement>
}

const TTLine: React.FC<TTLineProps> = ({
  hoverData,
  xCoordinate,
  yMax,
  showTooltip,
  hideTooltip,
  title,
  color = 'red',
  annotateAt = 'top',
  onClick,
  scrollContainerRef,
}) => {
  let tooltipTimeout: number

  const handleTooltip = (event: React.MouseEvent<SVGLineElement>) => {
    if (tooltipTimeout) clearTimeout(tooltipTimeout)
    if (!('ownerSVGElement' in event.target)) return

    const coords = localPoint(event.target.ownerSVGElement as Element, event)
    if (coords && scrollContainerRef.current) {
      const { scrollTop } = scrollContainerRef.current
      showTooltip({
        tooltipLeft: coords.x + 20,
        tooltipTop: coords.y + 10 - scrollTop,
        tooltipData: hoverData,
      })
    }
  }

  return (
    <>
      <StyledLine
        from={{ x: xCoordinate, y: 0 }}
        to={{ x: xCoordinate, y: yMax }}
        stroke={color}
        strokeOpacity={0.3}
        strokeWidth={2.5}
        strokeDasharray={8}
        opacity={0.8}
        onMouseLeave={() => {
          // Prevent tooltip from flickering.
          tooltipTimeout = window.setTimeout(() => {
            hideTooltip()
          }, 300)
        }}
        onMouseMove={handleTooltip}
        onClick={onClick}
      />
      {annotateAt === 'top' && (
        <Annotation
          x={xCoordinate + 15}
          y={-2}
          dx={0} // x offset of label from subject
          dy={0} // y offset of label from subject
        >
          <Label
            fontColor={color}
            title={title}
            subtitle={`${hoverData.annotation.operationRelativeEndTime.toFixed(
              2,
            )} ms`}
            showAnchorLine={false}
            backgroundFill="gray"
            backgroundProps={{
              opacity: 0.1,
            }}
          />
        </Annotation>
      )}
    </>
  )
}

interface VisualizationFiltersProps {
  setState: React.Dispatch<React.SetStateAction<Record<FilterOption, boolean>>>
  state: Record<string, boolean>
}

const VisualizationFilters: React.FC<VisualizationFiltersProps> = ({
  state,
  setState,
}) => (
  <LegendDemo title="" style={{ minWidth: '300px' }}>
    <GardenGrid.Row>
      <GardenGrid.Col>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {FILTER_OPTIONS.map((option) => (
            <Tooltip key={option} content={option}>
              <ToggleButton
                isPressed={state[option]}
                onClick={() =>
                  void setState((prev) => ({
                    ...prev,
                    [option]: !prev[option],
                  }))
                }
              >
                {option}
              </ToggleButton>
            </Tooltip>
          ))}
        </div>
      </GardenGrid.Col>
    </GardenGrid.Row>
  </LegendDemo>
)

const LegendContainer = styled.div`
  line-height: 0.9em;
  color: ${(props) =>
    getColor({ theme: props.theme, variable: 'foreground.subtle' })};
  font-size: ${(props) => props.theme.fontSizes.sm};
  font-family: ${(props) => props.theme.fonts.system};
  padding: ${(props) => props.theme.space.sm};
  border: ${(props) => props.theme.borders.sm};
  border-color: ${(props) =>
    getColor({ theme: props.theme, variable: 'border.default' })};
  border-radius: ${(props) => props.theme.borderRadii.md};
  margin: ${(props) => props.theme.space.xs};
`

const LegendTitle = styled.div`
  font-size: ${(props) => props.theme.fontSizes.md};
  margin-bottom: ${(props) => props.theme.space.sm};
  font-weight: ${(props) => props.theme.fontWeights.light};
`

const LegendContent = styled.div<{
  minWidth?: string
  maxHeight?: string
  overflowY?: string
}>`
  min-width: ${(props) => props.minWidth ?? 'auto'};
  max-height: ${(props) => props.maxHeight};
  overflow-y: ${(props) => props.overflowY ?? 'visible'};
`

const StyledRect = styled.rect`
  shape-rendering: geometricPrecision;
`

const StyledTooltip = styled(TooltipWithBounds)`
  font-family: ${(props) => props.theme.fonts.system};
  background-color: ${(props) =>
    getColor({ theme: props.theme, variable: 'background.raised' })};
  color: ${(props) =>
    getColor({ theme: props.theme, variable: 'foreground.default' })};
  border: ${(props) => props.theme.borders.sm};
  border-color: ${(props) =>
    getColor({ theme: props.theme, variable: 'border.default' })};
  border-radius: ${(props) => props.theme.borderRadii.md};
  box-shadow: ${(props) =>
    props.theme.shadows.lg(
      '2px',
      '4px',
      getColor({ theme: props.theme, variable: 'shadow.large' }),
    )};
  padding: ${(props) => props.theme.space.sm};
  max-width: 400px;
  max-height: 800px;
`

const TooltipTitle = styled.strong`
  font-weight: ${(props) => props.theme.fontWeights.semibold};
  font-size: ${(props) => props.theme.fontSizes.md};
  color: ${(props) =>
    getColor({ theme: props.theme, variable: 'foreground.primary' })};
`

const TooltipContent = styled.div`
  margin-top: ${(props) => props.theme.space.xs};
  font-size: ${(props) => props.theme.fontSizes.sm};
  opacity: 0.9;
`

function LegendDemo({
  title,
  children,
  style,
}: {
  title: string
  children: React.ReactNode
  style?: {
    minWidth?: string
    maxHeight?: string
    overflowY?: string
  }
}) {
  return (
    <LegendContainer>
      <LegendTitle>{title}</LegendTitle>
      <LegendContent {...style}>{children}</LegendContent>
    </LegendContainer>
  )
}

export interface OperationVisualizationProps {
  width: number
  operation: MappedOperation
  setDisplayOptions: React.Dispatch<
    React.SetStateAction<Record<FilterOption, boolean>>
  >
  displayOptions: Record<FilterOption, boolean>
  margin?: { top: number; right: number; bottom: number; left: number }
}

const StyledBar = styled(Bar)`
  cursor: pointer;
  transition: all 0.2s ease-in-out;

  &:hover {
    opacity: 0.7 !important;
    filter: brightness(1.2);
    stroke: #fff;
    stroke-width: 2px;
  }
`

const Container = styled.div<{ width: number }>`
  display: flex;
  width: ${(props) => props.width}px;
  overflow: hidden;
  height: 100vh;
`

const ScrollContainer = styled.div<{ width: number }>`
  width: ${(props) => props.width}px;
  transition: width 0.2s ease-in-out;
  overflow: auto;
  height: 100%;
`

const Header = styled.header`
  display: flex;
  flex-direction: row;
  padding: ${(props) => props.theme.space.xs};
`

const Title = styled.h1`
  font-size: ${(props) => props.theme.fontSizes.xl};
  color: ${(props) => props.theme.colors.neutralHue};
  font-family: ${(props) => props.theme.fonts.system};
  font-weight: ${(props) => props.theme.fontWeights.semibold};
`

const Footer = styled.footer<{ width: number; height: number }>`
  position: fixed;
  bottom: 0;
  background-color: ${(props) =>
    getColor({ theme: props.theme, variable: 'background.default' })};
  height: ${(props) => props.height}px;
  width: 100%;
`

const FooterContent = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: flex-start;
  align-items: flex-start;
  gap: ${(props) => props.theme.space.md};
  height: 100%;
  padding: 0 ${(props) => props.theme.space.md};
`

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
  let tooltipTimeout: number

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

  // Update tooltip handling in Bar components
  const handleTooltip = (
    event: React.MouseEvent<SVGRectElement>,
    entry: MappedSpanAndAnnotation,
  ) => {
    if (tooltipTimeout) clearTimeout(tooltipTimeout)
    if (!('ownerSVGElement' in event.target)) return

    const coords = localPoint(event.target.ownerSVGElement as Element, event)
    if (coords && scrollContainerRef.current) {
      const { scrollTop } = scrollContainerRef.current
      showTooltip({
        tooltipLeft: coords.x + 20,
        tooltipTop: coords.y + 10 - scrollTop,
        tooltipData: entry,
      })
    }
  }

  return width < 10 ? null : (
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
                <TTLine
                  key={`spanEvent-${index}`}
                  title={entry.groupName}
                  color={BAR_FILL_COLOR[entry.type]}
                  xCoordinate={xScale(
                    entry.annotation.operationRelativeStartTime,
                  )}
                  hoverData={entry}
                  showTooltip={showTooltip}
                  hideTooltip={hideTooltip}
                  yMax={yMax}
                  annotateAt="none"
                  onClick={() => void handleSpanClick(entry)}
                  scrollContainerRef={scrollContainerRef}
                />
              ))}
              {spansWithDuration.map((entry, i) => (
                <React.Fragment key={`entry-${i}`}>
                  <StyledBar
                    opacity={getBarOpacity(entry)}
                    rx={4}
                    x={xScale(entry.annotation.operationRelativeStartTime)}
                    y={labelScale(`${entry.groupName}`)}
                    width={xScale(entry.span.duration)}
                    height={labelScale.bandwidth()}
                    fill={BAR_FILL_COLOR[entry.type]}
                    onMouseLeave={() => {
                      // Prevent tooltip from flickering.
                      tooltipTimeout = window.setTimeout(() => {
                        hideTooltip()
                      }, 300)
                    }}
                    onMouseMove={(event) => void handleTooltip(event, entry)}
                    onClick={() => void handleSpanClick(entry)}
                  />
                  {(entry.annotation.markedComplete ||
                    entry.annotation.markedPageInteractive) && (
                    <TTLine
                      title={entry.annotation.markedComplete ? 'TTR' : 'TTI'}
                      xCoordinate={xScale(
                        entry.annotation.operationRelativeStartTime +
                          entry.span.duration,
                      )}
                      hoverData={entry}
                      showTooltip={showTooltip}
                      hideTooltip={hideTooltip}
                      yMax={yMax}
                      color="red"
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
            <VisualizationFilters
              setState={setDisplayOptions}
              state={displayOptions}
            />
            <LegendDemo
              title="Legend"
              style={{
                minWidth: '400px',
                maxHeight: '80px',
                overflowY: 'auto',
              }}
            >
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
            </LegendDemo>
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
