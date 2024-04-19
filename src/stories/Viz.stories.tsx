/* eslint-disable eslint-comments/no-unlimited-disable */
/* eslint-disable */
import React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import {Label} from '@visx/annotation'
import { Axis, AxisLeft } from '@visx/axis'
import { localPoint } from '@visx/event'
import { Grid } from '@visx/grid'
import { Group } from '@visx/group'
import { useScreenSize } from '@visx/responsive'
import ParentSize from '@visx/responsive/lib/components/ParentSize'
import { scaleBand, scaleLinear, scaleOrdinal, scalePoint } from '@visx/scale'
import { Bar, BarGroupHorizontal } from '@visx/shape'
import {
  defaultStyles,
  defaultStyles as defaultTooltipStyles,
  Tooltip,
  TooltipWithBounds,
  useTooltip,
  withTooltip,
} from '@visx/tooltip'
import { WithTooltipProvidedProps } from '@visx/tooltip/lib/enhancers/withTooltip'
import OperationData from '../2024/operation.json'
import TicketData from '../2024/ticket-fixtures/ticket-open-no-fetches-or-renders.json'
import { SpanKind } from '../main'
import { LegendOrdinal, LegendItem, LegendLabel } from '@visx/legend';

const operation = TicketData;
const ticketActivationOperation = TicketData.operations['ticket/activation']

interface BarDataType {
  start: number;
  width: number;
  commonName: string;
  occurrence: number;
  kind: SpanKind;
}

const data: BarDataType[] = ticketActivationOperation.tasks.map((task) => ({
  start: task.operationStartOffset,
  width: task.duration,
  commonName: task.commonName,
  occurrence: task.occurrence,
  kind: task.kind
}))

export interface BarGroupHorizontalProps {
  width: number
  height: number
  margin?: { top: number; right: number; bottom: number; left: number }
  events?: boolean
}
const DEFAULT_MARGIN = { top: 30, left: 200, right: 30, bottom: 30 }

const BAR_FILL_COLOR = {
  compute: "blue",
  fetch: "purple",
  render: "green",
  operation: "red"

}

export function OperationVisualizer({
  width,
  height,
  margin = DEFAULT_MARGIN,
  events = false,
}: BarGroupHorizontalProps) {
  // bounds

  const xMax = width - margin.left - margin.right
  const yMax = height - margin.bottom - margin.top

  const xScale = scaleLinear({
    // possible values of width
    domain: [0, operation.duration],
    range: [0, xMax],
  })

  // const taskNames = ticketActivationOperation.tasks.map((t) => `${t.commonName}`)
  const taskNames = ticketActivationOperation.includedCommonTaskNames

  const labelScale = scaleBand({
    domain: taskNames,
    range: [0, yMax],
    padding: 0.2,
  })

  const {
    tooltipOpen,
    tooltipLeft,
    tooltipTop,
    tooltipData,
    hideTooltip,
    showTooltip
  } = useTooltip<BarDataType>()
  let tooltipTimeout: number

  const colorScale = scaleOrdinal({
    domain: Object.keys(BAR_FILL_COLOR),
    range: Object.values(BAR_FILL_COLOR),
  });

  return width < 10 ? null : (
    <>
    <svg width={width} height={height}>
      {/* background: */}
      {/* <rect x={0} y={0} width={width} height={height} rx={14} /> */}
      <text
          x={width / 2} // Centering the title
          y={margin.top / 2} // Positioning it before the top of the chart (assuming there's enough top margin)
          textAnchor="middle" // Center the text around its x coordinate
          fill="#333" // Your desired title color
          fontSize="24px" // Your desired font size
          fontWeight="bold" // Optional: make the title bold
        >
          {operation.name}
        </text>
      <Group top={margin.top} left={margin.left}>
        <Axis scale={xScale} top={yMax} />
        <Grid xScale={xScale} yScale={labelScale} width={xMax} height={yMax} />
        {data.map((d, i) => (
          <Bar
            key={i}
            x={xScale(d.start)}
            y={labelScale(`${d.commonName}`)}
            width={xScale(d.width)}
            height={labelScale.bandwidth()}
            fill={BAR_FILL_COLOR[d.kind]}
            onMouseLeave={() => {
              // Prevent tooltip from flickering.
              tooltipTimeout = window.setTimeout(() => {
                hideTooltip()
              }, 300)
            }}
            onMouseMove={(event) => {
              if (tooltipTimeout) clearTimeout(tooltipTimeout)
              // Update tooltip position and data
              const coords = localPoint(event.target.ownerSVGElement, event)
              if (coords) {
                showTooltip({
                  tooltipLeft: coords.x + 10,
                  tooltipTop: coords.y + 10,
                  tooltipData: d,
                })
              }
            }}
          />
        ))}
        <AxisLeft
          scale={labelScale}
          tickLabelProps={{
            fill: 'green',
            fontSize: 11,
            textAnchor: 'end',
            dy: '0.33em',
            width: 100,
          }}
        />
      </Group>

    </svg>
    <div
        style={{
          position: 'absolute',
          top: height + 10, // Position below the chart
          left: margin.left,
          display: 'flex',
          flexDirection: 'column',
          flexWrap: 'wrap',
        }}
      >
       <LegendOrdinal scale={colorScale} labelFormat={(label) => `${label.toUpperCase()}`}>
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
      </div>

    {tooltipOpen && tooltipData && (
        <TooltipWithBounds
          top={tooltipTop}
          left={tooltipLeft}
          style={{ ...defaultTooltipStyles, backgroundColor: '#283238', color: 'white' }}
        >
          <div>
            <strong>{tooltipData.commonName}</strong>
            <div style={{ marginTop: '5px', fontSize: '12px', opacity: '80%' }}>
              <div>kind: {tooltipData.kind}</div>   
              <div>Occurance: {tooltipData.occurrence}</div>   
              <div>Start: {tooltipData.start.toFixed(2)}</div>            
              <div>Width: {tooltipData.width.toFixed(2)}</div>              
            </div>
          </div>
        </TooltipWithBounds>
      )}
    </>
    
  )
}

export const OperationVisualizerStory: StoryObj<BarGroupHorizontalProps> = {
  render: () => {
    const { height, width } = useScreenSize()
    return <OperationVisualizer height={height} width={width} />
  },
}

const Component: React.FunctionComponent<{}> = () => <>Hello world</>

const meta: Meta<{}> = {
  // title: 'Packages/MeasureTiming',
  component: Component,
  // args,
  // argTypes,
}

// eslint-disable-next-line import/no-default-export
export default meta
