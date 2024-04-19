/* eslint-disable no-magic-numbers */
import React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { AxisLeft } from '@visx/axis'
import { Group } from '@visx/group'
import { Stats } from '@visx/mock-data/lib/generators/genStats'
import { useScreenSize } from '@visx/responsive'
import ParentSize from '@visx/responsive/lib/components/ParentSize'
// import { getSeededRandom, getRandomNormal } from "@visx/mock-data";
import { scaleBand, scaleLinear, scaleOrdinal } from '@visx/scale'
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
import { timeFormat, timeParse } from '@visx/vendor/d3-time-format'
import OperationData from '../2024/operation.json'

const operation = OperationData

const data = operation.detail.tasks.map((task) => ({
  start: task.operationStartOffset,
  width: task.operationStartOffset + task.duration,
  // width: task.duration,
  commonName: task.commonName,
  occurrence: task.occurrence,
}))

export interface BarGroupHorizontalProps {
  width: number
  height: number
  margin?: { top: number; right: number; bottom: number; left: number }
  events?: boolean
}

const defaultMargin = { top: 40, left: 50, right: 40, bottom: 100 }

export function OperationVisualizer({
  width,
  height,
  margin = defaultMargin,
  events = false,
}: BarGroupHorizontalProps) {
  // bounds

  const xMax = width
  //   const yMax = height - margin.bottom - margin.top;

  const xScale = scaleLinear({
    domain: [operation.startTime, operation.startTime + operation.duration],
    range: [xMax, 0],
    round: true,
  })

  const taskNames = operation.detail.tasks.map(
    (t) => `${t.commonName}-${t.occurrence}`,
  )

  const labelScale = scaleBand({
    domain: taskNames,
    range: [0, height],
    // padding: .2
  })

  const {
    tooltipOpen,
    tooltipLeft,
    tooltipTop,
    tooltipData,
    hideTooltip,
    showTooltip,
  } = useTooltip()
  let tooltipTimeout: number

  return width < 10 ? null : (
    <svg width={width} height={height} fill="#c8c8c8">
      <rect x={0} y={0} width={width} height={height} rx={14} />
      <Group top={margin.top} left={margin.left}>
        {data.map((d, i) => (
          <Bar
            key={i}
            x={xScale(d.start)}
            y={labelScale(`${d.commonName}-${d.occurrence}`)}
            width={xScale(d.width)}
            height={labelScale.bandwidth()}
            fill="#fce5cd"
            stroke="blue"
            onMouseLeave={() => {
              // Prevent tooltip from flickering.
              tooltipTimeout = window.setTimeout(() => {
                hideTooltip()
              }, 300)
            }}
            onMouseMove={(event) => {
              if (tooltipTimeout) clearTimeout(tooltipTimeout)
              // Update tooltip position and data
              const top = 100 + i * 10
              const left = xScale(d.start)
              showTooltip({
                tooltipData: d,
                tooltipTop: event.clientY - labelScale.bandwidth() - 10,
                tooltipLeft: 50,
              })
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
      {tooltipOpen && tooltipData && (
        <TooltipWithBounds
          top={tooltipTop}
          left={tooltipLeft}
          style={{
            ...defaultStyles,
            padding: '0.5rem',
            backgroundColor: '#283238',
            color: 'white',
          }}
        >
          <div>
            <strong>{'test'}</strong>
          </div>
        </TooltipWithBounds>
      )}
    </svg>
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
