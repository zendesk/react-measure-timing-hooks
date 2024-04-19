/* eslint-disable eslint-comments/no-unlimited-disable */
/* eslint-disable */
import React, { useCallback, useMemo, useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { Label } from '@visx/annotation'
import { Axis, AxisLeft } from '@visx/axis'
import { localPoint } from '@visx/event'
import { Grid } from '@visx/grid'
import { Group } from '@visx/group'
import { useScreenSize } from '@visx/responsive'
import ParentSize from '@visx/responsive/lib/components/ParentSize'
import { scaleBand, scaleLinear, scaleOrdinal, scalePoint } from '@visx/scale'
import { Bar, BarGroupHorizontal, LinePath } from '@visx/shape'
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
import TicketData from '../2024/ticket-fixtures/ticket-open-all-fetches-and-renders.json'
import { LegendOrdinal, LegendItem, LegendLabel } from '@visx/legend'
import type {
  Operation,
  TaskDataEmbeddedInOperation,
} from '../2024/operationTracking'
import { curveLinear } from '@visx/curve'
const operation = TicketData as unknown as Operation
const ticketActivationOperation = TicketData.operations['ticket/activation']

// sort by commonName
const data = [
  ...(ticketActivationOperation.tasks as TaskDataEmbeddedInOperation[]),
].sort((a, b) => b.commonName.localeCompare(a.commonName))

export interface OperationVisualizerProps {
  width: number
  margin?: { top: number; right: number; bottom: number; left: number }
  events?: boolean
}
const DEFAULT_MARGIN = { top: 30, left: 200, right: 120, bottom: 30 }

const BAR_FILL_COLOR = {
  compute: '#2ca02c',
  fetch: '#1f77b4',
  render: '#ff7f0e',
  operation: 'yellow',
}

const removeRenderNames = (name: string) => !name.includes('/render')

export function OperationVisualizer({
  width,
  margin = DEFAULT_MARGIN,
  events = false,
}: OperationVisualizerProps) {
  // bounds
  const [collapseRenders, setCollapseRenders] = useState(true)
  const taskNames = collapseRenders
    ? [
        'renders',
        ...ticketActivationOperation.includedCommonTaskNames.filter(
          removeRenderNames,
        ),
      ]
    : ticketActivationOperation.includedCommonTaskNames
  const tickHeight = 20
  const height = taskNames.length * tickHeight + margin.top + margin.bottom

  const xMax = width - margin.left - margin.right
  const yMax = height - margin.bottom - margin.top

  const xScale = scaleLinear({
    // possible values of width
    domain: [0, operation.duration],
    range: [0, xMax],
  })

  const labelScale = useMemo(() => {
    return scaleBand({
      domain: taskNames,
      range: [0, yMax],
      padding: 0.2,
    })
  }, [taskNames, yMax])

  const {
    tooltipOpen,
    tooltipLeft,
    tooltipTop,
    tooltipData,
    hideTooltip,
    showTooltip,
  } = useTooltip<TaskDataEmbeddedInOperation>()
  let tooltipTimeout: number

  const colorScale = scaleOrdinal({
    domain: Object.keys(BAR_FILL_COLOR),
    range: Object.values(BAR_FILL_COLOR),
  })

  const toggleRenderCollapse = useCallback(
    () => setCollapseRenders((s) => !s),
    [],
  )

  return width < 10 ? null : (
    <>
      <header>
        <h1 style={{ fontSize: '24px', color: '#333' }}>
          Operation: {operation.name}
        </h1>
      </header>
      <svg width={width - margin.right} height={height}>
        <Group top={margin.top} left={margin.left}>
          <Axis scale={xScale} top={yMax} />
          <Grid
            xScale={xScale}
            yScale={labelScale}
            width={xMax}
            height={yMax}
            numTicksRows={taskNames.length}
          />
          {data.map((d, i) => (
            <Bar
              opacity={0.4}
              rx={4}
              key={i}
              x={xScale(d.operationStartOffset)}
              y={labelScale(`${d.commonName}`)}
              width={xScale(d.duration)}
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
          {/* <LinePath
            data={data}
            x={1000}
            y={100}
            // Use appropriate stroke property to define the line color
            stroke={'red'}
            strokeWidth={20}
            curve={curveLinear}
          /> */}
          <AxisLeft
            scale={labelScale}
            numTicks={taskNames.length}
            tickLabelProps={{
              fill: '#888',
              fontSize: 10,
              textAnchor: 'end',
              dy: '0.33em',
              width: 100,
            }}
            tickFormat={(value) => {
              if (value.startsWith('http')) return value
              const split = value.split(/\/|\./)
              if (split.at(-1) === 'render') {
                return split.at(-2)
              }
              if (split.at(-1)?.includes('-till-')) {
                return split.at(-1)
              }
              return split.join('.')
            }}
          />
        </Group>
      </svg>
      <footer
        style={{
          position: 'fixed',
          bottom: 0,
          backgroundColor: 'white',
          padding: '0 0 1em 0',
        }}
      >
        <svg width={width - margin.right} height={60}>
          <Axis scale={xScale} top={1} left={margin.left} />
        </svg>
        <div>
          <input
            type="checkbox"
            checked={collapseRenders}
            onChange={toggleRenderCollapse}
            id="render-collapse-toggle"
            name="render-collapse-toggle"
          />
          <label htmlFor="#render-collapse-toggle">Collapse Render Spans</label>
        </div>
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
          }}
        >
          <div>
            <strong>{tooltipData.commonName}</strong>
            <div style={{ marginTop: '5px', fontSize: '12px', opacity: '80%' }}>
              <div>kind: {tooltipData.kind}</div>
              <div>occurrence: {tooltipData.occurrence}</div>
              <div>start: {tooltipData.operationStartOffset.toFixed(2)}ms</div>
              <div>duration: {tooltipData.duration.toFixed(2)}ms</div>
              {tooltipData.metadata && (
                <div>
                  <div>metadata:</div>
                  <pre>{JSON.stringify(tooltipData.metadata, null, 2)}</pre>
                </div>
              )}
              {tooltipData.detail && (
                <div>
                  <div>Detail:</div>
                  <pre>{JSON.stringify(tooltipData.detail, null, 2)}</pre>
                </div>
              )}
            </div>
          </div>
        </TooltipWithBounds>
      )}
    </>
  )
}

export const OperationVisualizerStory: StoryObj<OperationVisualizerProps> = {
  render: () => {
    const { width } = useScreenSize()
    return (
      <div style={{ padding: '1em', position: 'relative' }}>
        <OperationVisualizer width={width} />
      </div>
    )
  },
}

const Component: React.FunctionComponent<{}> = () => <>Hello world</>

const meta: Meta<{}> = {
  component: Component,
}

export default meta
