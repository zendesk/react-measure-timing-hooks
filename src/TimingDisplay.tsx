/**
 * Copyright Zendesk, Inc.
 *
 * Use of this source code is governed under the Apache License, Version 2.0
 * found at http://www.apache.org/licenses/LICENSE-2.0.
 */

// eslint-disable-next-line import/no-extraneous-dependencies
import '@patternfly/patternfly/base/patternfly-common.css'
// eslint-disable-next-line import/no-extraneous-dependencies
import '@patternfly/patternfly/base/patternfly-variables.css'
import './patternfly-globals.css'
import { memo, useCallback, useMemo, useState } from 'react'
import * as React from 'react'
// eslint-disable-next-line import/no-extraneous-dependencies
import { Resizable } from 're-resizable'
// eslint-disable-next-line import/no-extraneous-dependencies
import { DndContext, useDndMonitor, useDraggable } from '@dnd-kit/core'
// eslint-disable-next-line import/no-extraneous-dependencies
import { restrictToWindowEdges } from '@dnd-kit/modifiers'
// eslint-disable-next-line import/no-extraneous-dependencies
import {
  ChartBar,
  ChartBarProps,
  ChartBullet,
  ChartBulletComparativeWarningMeasure,
  ChartBulletPrimarySegmentedMeasure,
  ChartBulletQualitativeRange,
  ChartThemeColor,
  getBulletTheme,
} from '@patternfly/react-charts'
// eslint-disable-next-line import/no-extraneous-dependencies
import { Button, SearchInput, Stack, StackItem } from '@patternfly/react-core'
// eslint-disable-next-line import/no-extraneous-dependencies
import MinusCircleIcon from '@patternfly/react-icons/dist/esm/icons/minus-circle-icon'
// eslint-disable-next-line import/no-extraneous-dependencies
import PlusCircleIcon from '@patternfly/react-icons/dist/esm/icons/plus-circle-icon'
// eslint-disable-next-line import/no-extraneous-dependencies
import RemoveIcon from '@patternfly/react-icons/dist/esm/icons/remove2-icon'
import { generateReport } from './generateReport'
import {
  clearObservedTimings,
  getObservedTimings,
  Position,
  setObservedTimingsUpdater,
  Size,
  VisualizerProps,
} from './lazyVisualizer'
import { throttle } from './throttle'
import type {
  Action,
  ActionWithStateMetadata,
  DependencyChangeAction,
  RenderAction,
  StageChangeAction,
  StateMeta,
  UnresponsiveAction,
} from './types'

interface Point {
  readonly type: 'action' | 'idle'
  readonly y0?: number
  readonly y: number
  readonly duration: number
  readonly name: string
  readonly action?: Action
  readonly color?: string
}

interface PersistedActionLog {
  id: string
  actions: ActionWithStateMetadata[]
  inactive: boolean
}

const MINIMAL_BLOCK_SIZE_PERCENTAGE = 0.01
const THEME = getBulletTheme(ChartThemeColor.multiOrdered)

const PADDING = {
  bottom: 0,
  left: 300, // Adjusted to accommodate labels
  right: 30,
  top: 0,
}

const MAIN_BAR_HEIGHT = 42
const CHART_HEIGHT = 120
const TOP_BAR_HEIGHT = 35

const doRound = (n: number | null | undefined) =>
  typeof n === 'number' ? Math.round(n * 1_000) / 1_000 : 0

const CustomColorChartBar: React.FunctionComponent<ChartBarProps> = ({
  style,
  ...props
}) => {
  const data = props.data as Point[] | undefined
  const [point] = data ?? []
  return (
    <ChartBar
      {...props}
      style={point?.color ? { data: { fill: point.color } } : style}
    />
  )
}

// padding ensures a minimum size for the bar
const calculateBarPadding = (duration: number, totalDuration: number) =>
  (duration / totalDuration < MINIMAL_BLOCK_SIZE_PERCENTAGE
    ? MINIMAL_BLOCK_SIZE_PERCENTAGE * totalDuration - duration
    : 0) / 2

function getPoints<A extends Action>(
  actions: (A & StateMeta)[],
  startTimestamp: number,
  totalDuration: number,
  markIdle = false,
): Point[] {
  const actionSummary: {
    start: number
    duration: number
    action: A & StateMeta
  }[] = []
  let lastStart: number | undefined = startTimestamp
  actions.forEach((action) => {
    if (
      typeof lastStart === 'number' &&
      (action.marker === 'end' || action.marker === 'point')
    ) {
      actionSummary.push({
        start: lastStart - startTimestamp,
        duration: action.timestamp - lastStart,
        action,
      })
      lastStart = undefined
    }
    if (action.marker === 'start' || action.marker === 'point') {
      lastStart = action.timestamp
    }
  })
  const points = actionSummary.flatMap<Point>((val, index) => {
    // padding ensures a minimum size for the bar
    const padding = calculateBarPadding(val.duration, totalDuration)

    const action: Point = {
      type: 'action',
      y0: val.start - padding,
      y: val.start + val.duration + padding,
      duration: val.duration,
      action: val.action,
      name: val.action.type,
    } as const
    const prevVal = actionSummary[index - 1] ?? {
      start: 0,
      duration: val.start,
    }
    const prevValEnd = prevVal.start + prevVal.duration
    const idleDuration = val.start - prevValEnd
    if (markIdle && idleDuration > 0) {
      return [
        {
          type: 'idle',
          y0: prevValEnd,
          y: val.start,
          duration: idleDuration,
          name: 'idle',
        } as const,
        action,
      ] as const
    }
    return [action] as const
  })
  return points
}

function getChartPoints(actions: ActionWithStateMetadata[]) {
  const report = generateReport({ actions })
  const sources = Object.keys(report.counts)
  const sourceToColor = Object.fromEntries(
    sources.map((source, index) => [
      source,
      THEME.group!.colorScale![index % THEME.group!.colorScale!.length],
    ]),
  )

  const firstAction = actions.at(0)
  const lastAction = actions.at(-1)
  const firstTimestamp = firstAction?.timestamp ?? 0
  const lastTimestamp = lastAction?.timestamp ?? 0
  const totalTime = lastTimestamp - firstTimestamp
  const stagePoints = Object.values(report.spans)
    .filter(({ data: { timeToStage } }) => typeof timeToStage === 'number')
    .map(
      ({
        data: { stage, previousStage, timeToStage = 0 },
        relativeEndTime,
      }) => {
        const padding = calculateBarPadding(timeToStage, totalTime)
        return {
          name: `${previousStage} → ${stage}`,
          duration: timeToStage,
          y: relativeEndTime + padding,
          y0: relativeEndTime - timeToStage - padding,
        }
      },
    )

  const renderActions = actions.filter(
    (action): action is RenderAction & StateMeta => action.type === 'render',
  )

  const unresponsiveActions = actions.filter(
    (action): action is UnresponsiveAction & StateMeta =>
      action.type === 'unresponsive',
  )

  const unresponsivePoints = getPoints(
    unresponsiveActions,
    firstTimestamp,
    totalTime,
  )
  const renderPoints = getPoints(renderActions, firstTimestamp, totalTime).map(
    (point) => ({
      ...point,
      ...(point.action
        ? {
            name: `render <${point.action.source}>`,
            color: sourceToColor[point.action.source],
          }
        : {}),
    }),
  )

  const dependencyChanges = actions
    .filter(
      (action): action is DependencyChangeAction & StateMeta =>
        action.type === 'dependency-change',
    )
    .flatMap((action): Point[] => {
      const y = action.timestamp - firstTimestamp
      if (Number.isNaN(y)) {
        return []
      }
      return [
        {
          y,
          type: 'action',
          name: 'dependency-change',
          duration: 0,
          action,
        },
      ]
    })
  const stageChanges = actions
    .filter(
      (action): action is StageChangeAction & StateMeta =>
        action.type === 'stage-change',
    )
    .flatMap((action, index): Point[] => {
      const y = action.timestamp - firstTimestamp
      if (Number.isNaN(y)) {
        return []
      }
      return [
        {
          y,
          type: 'action',
          name: `stage: ${action.stage}`,
          duration: 0,
          action,
        },
      ]
    })
  return {
    report,
    totalTime,
    renderPoints,
    dependencyChanges,
    unresponsivePoints,
    stageChanges,
    stagePoints,
  }
}

const ActionLogView = memo(
  ({ actionLog, size }: { actionLog: PersistedActionLog; size: Size }) => {
    const {
      report,
      totalTime,
      renderPoints,
      dependencyChanges,
      unresponsivePoints,
      stageChanges,
      stagePoints,
    } = useMemo(() => getChartPoints(actionLog.actions), [actionLog.actions])

    return (
      <ChartBullet
        title={`${actionLog.id}`}
        ariaTitle={`${actionLog.id}`}
        subTitle={`TTI: ${doRound(report.tti)} | TTR: ${doRound(
          report.ttr,
        )} | S: ${report.lastStage}`}
        constrainToVisibleArea
        height={CHART_HEIGHT}
        maxDomain={{ y: doRound(totalTime) }}
        minDomain={{ y: 0 }}
        primarySegmentedMeasureComponent={
          <ChartBulletPrimarySegmentedMeasure
            measureComponent={<CustomColorChartBar />}
            padding={{
              ...PADDING,
              top: PADDING.top + MAIN_BAR_HEIGHT / 2,
            }}
          />
        }
        primarySegmentedMeasureData={renderPoints}
        comparativeErrorMeasureData={dependencyChanges}
        comparativeErrorMeasureComponent={
          <ChartBulletComparativeWarningMeasure />
        }
        comparativeWarningMeasureData={unresponsivePoints}
        comparativeWarningMeasureComponent={
          <ChartBulletPrimarySegmentedMeasure
            themeColor={ChartThemeColor.gold}
            barWidth={10}
            padding={{
              ...PADDING,
              top: PADDING.top - MAIN_BAR_HEIGHT / 2,
            }}
          />
        }
        primaryDotMeasureData={stageChanges}
        qualitativeRangeData={stagePoints}
        qualitativeRangeComponent={
          <ChartBulletQualitativeRange themeColor={ChartThemeColor.cyan} />
        }
        labels={({ datum }: { datum: Point }) =>
          'duration' in datum
            ? `${datum.name}: ${doRound(datum.duration)}ms`
            : ''
        }
        width={size.width}
        padding={PADDING}
      />
    )
  },
)

function ActionLogsWindow({
  style,
  actionLogs,
  position,
  initalSize,
  onClear,
}: {
  style: React.CSSProperties | undefined
  actionLogs: PersistedActionLog[]
  position: Position
  initalSize: Size
  onClear: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: 'ActionLogsWindow',
    })
  const [size, setSize] = useState(initalSize)
  const [filter, setFilter] = useState<string>()
  const [isFolded, setFolded] = useState(false)

  useDndMonitor({
    onDragEnd(event) {
      if (event.delta.x === 0 && event.delta.y === 0) {
        setFolded(!isFolded)
      }
    },
  })

  const actionLogsArray = useMemo(() => [...actionLogs].reverse(), [actionLogs])
  const filteredActionLogs = useMemo(
    () =>
      actionLogsArray.filter((actionLog) => {
        if (!filter) return true
        return actionLog.id.includes(filter)
      }),
    [actionLogsArray, filter],
  )

  return (
    <Resizable
      size={isFolded ? { height: TOP_BAR_HEIGHT, width: size.width } : size}
      onResizeStop={(e, direction, ref, delta) => {
        setSize({
          width: size.width + delta.width,
          height: size.height + delta.height,
        })
      }}
      enable={{
        bottom: !isFolded,
        right: !isFolded,
        bottomLeft: !isFolded,
        bottomRight: !isFolded,
        left: !isFolded,
        top: false,
        topLeft: false,
        topRight: false,
      }}
      minWidth={600}
      style={{
        position: 'absolute',
        background: 'aliceblue',
        ...style,
        left: position.x,
        top: position.y,
        ...(transform
          ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
          : {}),
      }}
    >
      <div ref={setNodeRef} style={{ height: '100%' }}>
        <Stack>
          <StackItem>
            <Button
              isBlock
              variant="secondary"
              icon={isFolded ? <PlusCircleIcon /> : <MinusCircleIcon />}
              iconPosition="left"
              style={{
                height: `${TOP_BAR_HEIGHT}px`,
                textAlign: 'left',
                cursor: 'grab',
                touchAction: 'none',
              }}
              {...listeners}
              {...attributes}
            >
              React Measure Timing visualization
            </Button>
          </StackItem>
          {!isFolded && !isDragging && (
            <>
              <StackItem style={{ padding: '10px', paddingBottom: 0 }}>
                <SearchInput
                  placeholder="Filter by ID"
                  value={filter}
                  onChange={(event) =>
                    void setFilter((event.target as HTMLInputElement).value)
                  }
                  onClear={() => void setFilter(undefined)}
                  resultsCount={filteredActionLogs.length}
                />
              </StackItem>
              <StackItem style={{ padding: '10px', paddingBottom: 0 }}>
                <Button
                  isBlock
                  variant="secondary"
                  icon={<RemoveIcon />}
                  onClick={onClear}
                />
              </StackItem>
              <StackItem isFilled style={{ overflowY: 'auto' }}>
                <div>
                  {filteredActionLogs.map((actionLog, logIndex) => (
                    <ActionLogView
                      actionLog={actionLog}
                      size={size}
                      key={actionLogs.length - logIndex}
                    />
                  ))}
                </div>
              </StackItem>
            </>
          )}
        </Stack>
      </div>
    </Resizable>
  )
}

// eslint-disable-next-line import/no-default-export
export default function TimingDisplay({
  maxRefreshRate = 1_000,
  style,
  initialPosition = { x: 0, y: 0 },
  initialSize = { width: 800, height: 300 },
  enabled = true,
}: VisualizerProps) {
  // TODO: add "clear" button to clear all persisted logs
  const [actionLogs, setActionLogs] = useState<PersistedActionLog[]>([])

  const updateObservedTimings = useMemo(
    () =>
      throttle(() => {
        setActionLogs(getObservedTimings())
      }, maxRefreshRate),
    [setActionLogs, maxRefreshRate],
  )

  const onClear = useCallback(() => {
    clearObservedTimings()
    setActionLogs([])
  }, [setActionLogs])

  setObservedTimingsUpdater(updateObservedTimings)

  const [position, setPosition] = useState(initialPosition)
  return (
    <DndContext
      modifiers={[restrictToWindowEdges]}
      onDragEnd={(e) => {
        setPosition({ x: position.x + e.delta.x, y: position.y + e.delta.y })
      }}
    >
      {enabled && (
        <ActionLogsWindow
          actionLogs={actionLogs}
          style={style}
          position={position}
          initalSize={initialSize}
          onClear={onClear}
        />
      )}
    </DndContext>
  )
}
