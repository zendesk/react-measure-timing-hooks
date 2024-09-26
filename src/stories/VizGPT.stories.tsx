/* eslint-disable eslint-comments/no-unlimited-disable */
/* eslint-disable */import React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { AxisBottom, AxisLeft } from '@visx/axis'
import { GridColumns } from '@visx/grid'
import { Group } from '@visx/group'
import { useScreenSize } from '@visx/responsive'
import { scaleBand, scaleLinear } from '@visx/scale'
import { useTooltip, TooltipWithBounds } from '@visx/tooltip'
import OperationData from '../2024/operation.json'
import TicketData from '../2024/ticket-fixtures/ticket-open-no-fetches-or-renders.json'
import type { Operation, SpanKind, TaskDataEmbeddedInOperation } from '../2024/operationTracking'

const operation = TicketData;

interface TimelineGraphProps {
  operation: Operation;
  width: number;
  height: number;
}

const colorScale = (kind: SpanKind) => {
  switch (kind) {
    case 'fetch':
      return '#1f77b4';
    case 'render':
      return '#ff7f0e';
    case 'compute':
      return '#2ca02c';
    default:
      return '#d62728';
  }
};

const formatDuration = (duration: number) => {
  return `${(duration / 1000).toFixed(2)}s`;
};

const formatOffset = (offset: number) => {
  return `${(offset / 1000).toFixed(2)}s from start`;
};

const TimelineGraph: React.FC<TimelineGraphProps> = ({ operation, height, width }) => {
  const tasks = operation.operations[operation.name].tasks;
  const commonNames = Array.from(new Set(tasks.map((task) => task.commonName)));

  const margin = { top: 20, right: 20, bottom: 60, left: 200 };

  const xScale = scaleLinear<number>({
    domain: [0, operation.duration],
    range: [margin.left, width - margin.right],
  });

  const yScale = scaleBand<string>({
    domain: commonNames,
    range: [margin.top, height - margin.bottom],
    padding: 0.4,
  });

  const {
    showTooltip,
    hideTooltip,
    tooltipOpen,
    tooltipData,
    tooltipTop = 0,
    tooltipLeft = 0,
  } = useTooltip<TaskDataEmbeddedInOperation>();

  const tasksByCommonName = commonNames.map((commonName) => {
    return tasks.filter((task) => task.commonName === commonName);
  });

  return (
    <div style={{ position: 'relative' }}>
      <svg width={width} height={height}>
        <GridColumns scale={xScale} height={height - margin.bottom} top={margin.top} left={margin.left} />
        {tasksByCommonName.map((tasksGroup, index) => (
          <Group key={index}>
            {tasksGroup.map((task, taskIndex) => (
              <rect
                key={taskIndex}
                x={xScale(task.operationStartOffset)}
                y={yScale(task.commonName)!}
                width={xScale(task.duration)}
                height={yScale.bandwidth()}
                fill={colorScale(task.kind)}
                opacity={0.8}
                onMouseEnter={() => {
                  showTooltip({
                    tooltipTop: yScale(task.commonName)! + yScale.bandwidth() / 2,
                    tooltipLeft: xScale(task.operationStartOffset),
                    tooltipData: task,
                  });
                }}
                onMouseLeave={() => {
                  hideTooltip();
                }}
              />
            ))}
          </Group>
        ))}
        <AxisLeft
          scale={yScale}
          left={margin.left}
          hideAxisLine
          hideTicks
          numTicks={commonNames.length}
          tickFormat={(value) => `${value}`}
          tickLabelProps={() => ({
            fill: 'black',
            fontSize: 11,
            textAnchor: 'end',
            dy: '0.33em',
          })}
        />
        <AxisBottom
          scale={xScale}
          top={height - margin.bottom}
          label="Time (ms)"
          tickFormat={(value) => `${value}`}
        />
      </svg>
      {tooltipOpen && tooltipData && (
        <TooltipWithBounds
          key={Math.random()}
          top={tooltipTop}
          left={tooltipLeft}
          style={{ position: 'absolute', zIndex: 1 }}
        >
          <div>
            <strong>Kind:</strong> {tooltipData.kind}
          </div>
          <div>
            <strong>Duration:</strong> {formatDuration(tooltipData.duration)}
          </div>
          <div>
            <strong>Offset:</strong> {formatOffset(tooltipData.operationStartOffset)}
          </div>
          {tooltipData.metadata && (
            <div>
              <strong>Metadata:</strong>
              <pre>{JSON.stringify(tooltipData.metadata, null, 2)}</pre>
            </div>
          )}
          {tooltipData.detail && (
            <div>
              <strong>Detail:</strong>
              <pre>{JSON.stringify(tooltipData.detail, null, 2)}</pre>
            </div>
          )}
          <div>
            <strong>Occurrence:</strong> {tooltipData.occurrence}
          </div>
        </TooltipWithBounds>
      )}
    </div>
  );
};

export const OperationVisualizerStory: StoryObj<{}> = {
  render: () => {
    const { height, width } = useScreenSize()
    return <TimelineGraph height={height} width={width} operation={operation as Operation} />
  },
}

const Component: React.FunctionComponent<{}> = () => <>Hello world</>

const meta: Meta<{}> = {
  component: Component,
}

export default meta
