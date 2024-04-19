/* eslint-disable no-magic-numbers */
import React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { AxisLeft } from '@visx/axis'
import { localPoint } from '@visx/event';
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

const operation = OperationData

const data = operation.detail.tasks.map((task) => ({
  start: task.operationStartOffset,
  width: task.duration,
  commonName: task.commonName,
  occurrence: task.occurrence,
}))

export interface BarGroupHorizontalProps {
  width: number
  height: number
  margin?: { top: number; right: number; bottom: number; left: number }
  events?: boolean
}

const defaultMargin = { top: 30, left: 200, right: 30, bottom: 30 }

export function OperationVisualizer({
  width,
  height,
  margin = defaultMargin,
  events = false,
}: BarGroupHorizontalProps) {
  // bounds

  const xMax = width - margin.left - margin.right;
  const yMax = height - margin.bottom - margin.top;

  const xScale = scaleLinear({
    // possible values of width
    domain: [0, operation.duration],
    range: [0, xMax],
  })

  const taskNames = operation.detail.tasks.map(
    (t) => `${t.commonName}-${t.occurrence}`,
  )

  const labelScale = scaleBand({
    domain: taskNames,
    range: [0, yMax],
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
                const coords = localPoint(event.target.ownerSVGElement, event);
                if (coords) {
                  console.log('# coords:', tooltipOpen, d)
                  showTooltip({
                tooltipLeft: coords.x,
                tooltipTop: coords.y,
                tooltipData: d
                });
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
      {tooltipOpen && tooltipData && (
        <TooltipWithBounds
          top={tooltipTop}
          left={tooltipLeft}
          style={{
            ...defaultStyles,
            padding: '0.5rem',
            backgroundColor: '#283238',
            color: 'white',
            zIndex: 1_000,
            visibility: 'visible'
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
