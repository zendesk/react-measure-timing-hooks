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

function LegendDemo({
  title,
  children,
  style,
}: {
  title: string
  children: React.ReactNode
  style?: React.CSSProperties
}) {
  return (
    <div className="legend" style={style}>
      <div className="title">{title}</div>
      {children}
      <style>{`
        .legend {
          line-height: 0.9em;
          color: gray;
          font-size: 10px;
          font-family: arial;
          padding: 10px 10px;
          float: left;
          border: 1px solid rgba(255, 255, 255, 0.3);
          border-radius: 8px;
          margin: 5px 5px;
        }
        .title {
          font-size: 12px;
          margin-bottom: 10px;
          font-weight: 100;
        }
      `}</style>
    </div>
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
    <div
      style={{
        display: 'flex',
        width: containerWidth,
        overflow: 'hidden',
        height: '100vh', // Add this to ensure full height
      }}
    >
      <div
        ref={scrollContainerRef}
        style={{
          width,
          transition: 'width 0.2s ease-in-out',
          overflow: 'auto',
          height: '100%', // Add this to ensure scroll container takes full height
        }}
      >
        <header
          style={{
            display: 'flex',
            flexDirection: 'row',
            padding: '5px',
            gap: '10px',
          }}
        >
          <h1
            style={{
              fontSize: '24px',
              color: '#333',
              fontFamily: 'sans-serif',
            }}
          >
            Operation: {operation.name}
          </h1>
        </header>
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
        <footer
          style={{
            position: 'fixed',
            bottom: 0,
            backgroundColor: 'white',
            height: `${footerHeight + footerScaleHeight}px`,
            width: '100%',
          }}
        >
          <svg width={width - margin.right} height={footerScaleHeight}>
            <Axis scale={xScale} top={1} left={margin.left} />
          </svg>
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              justifyContent: 'flex-start',
              alignItems: 'flex-start',
              gap: '20px',
              height: `${footerHeight}px`,
              padding: '0 20px',
            }}
          >
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
                          <rect fill={label.value} width={15} height={15} />
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
          </div>
        </footer>
        {tooltipOpen && tooltipData && (
          <TooltipWithBounds
            top={tooltipTop}
            left={tooltipLeft}
            style={{
              ...defaultTooltipStyles,
              fontFamily: 'sans-serif',
              backgroundColor: '#283238',
              color: 'white',
              maxWidth: '400px',
              maxHeight: '800px',
            }}
          >
            <div>
              <strong>{tooltipData.span.name}</strong>
              <div
                style={{ marginTop: '5px', fontSize: '12px', opacity: '80%' }}
              >
                <div>kind: {tooltipData.type}</div>
                <div>occurrence: {tooltipData.annotation.occurrence}</div>
                <div>
                  start:{' '}
                  {tooltipData.annotation.operationRelativeStartTime.toFixed(2)}
                  ms
                </div>
                <div>duration: {tooltipData.span.duration.toFixed(2)}ms</div>
              </div>
            </div>
          </TooltipWithBounds>
        )}
      </div>
      <SpanDetails
        span={selectedSpan}
        onClose={() => void setSelectedSpan(null)}
      />
    </div>
  )
}

// eslint-disable-next-line import/no-default-export
export default OperationVisualization
