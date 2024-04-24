/* eslint-disable eslint-comments/no-unlimited-disable,unicorn/no-abusive-eslint-disable */
/* eslint-disable */
import React, { useCallback, useMemo, useState, useEffect } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { Label, Annotation } from '@visx/annotation'
import { Axis, AxisLeft } from '@visx/axis'
import { localPoint } from '@visx/event'
import { Grid } from '@visx/grid'
import { Group } from '@visx/group'
import { useScreenSize } from '@visx/responsive'
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
// import TicketData from '../2024/ticket-fixtures/ticket-accept-chat.json'
import TicketData from '../2024/ticket-fixtures/ticket-open-new-format-slow.json'
import { LegendOrdinal, LegendItem, LegendLabel } from '@visx/legend'
import type {
  Operation,
  TaskDataEmbeddedInOperation,
  TaskSpanKind,
} from '../2024/types'
import { Line } from '@visx/shape'
import debounce from 'lodash.debounce'
import { Col, Row } from '@zendeskgarden/react-grid'
import {
  Combobox,
  Field,
  Hint,
  IComboboxProps,
  Label as GardenLabel,
  Option,
} from '@zendeskgarden/react-dropdowns.next'
import { ThemeProvider } from '@zendeskgarden/react-theming'
import { render } from 'react-dom'

// Assume TicketData has the right shape to match the Operation type,
// if not, validate or transform the data to fit the Operation type.

const rootOperation = TicketData

const BAR_FILL_COLOR: Record<TaskSpanKind | 'resource-ember', string> = {
  render: '#ff7f0e',
  measure: '#2ca02c',
  resource: '#1f77b4',
  'resource-ember': '#17becf',
  longtask: '#d62728',
  mark: '#9467bd',
  asset: '#8c564b',
  iframe: '#e377c2',
  element: '#7f7f7f',
  action: '#bcbd22',

  error: '#ff9896',
  vital: '#ffbb78',
  'first-input': '#aec7e8',
  'largest-contentful-paint': '#98df8a',
  'layout-shift': '#ff9896',
  'visibility-state': '#ff9896',
  event: '#ff9896',
  navigation: '#ff9896',
  paint: '#ff9896',
  taskattribution: '#ff9896',
}

const order: Record<string, number> = {
  longtask: 0,
  render: 1,
  measure: 2,
  resource: 3,
  'resource-ember': 3,
  asset: 4,
  iframe: 5,
}

const mapData = ({
  collapseRenders = true,
  collapseAssets = true,
  collapseEmberResources = false,
  collapseIframes = false,
}: {
  collapseRenders?: boolean
  collapseAssets?: boolean
  collapseEmberResources?: boolean
  collapseIframes?: boolean
} = {}) => {
  const {
    includedCommonTaskNames: _,
    // this function depends on the tasks being sorted by startTime
    tasks: allTasks,
    ...operation
  } = TicketData.operations['ticket/activation']

  const OPERATION_SPAN_NAME = 'performance/ticket/activation'

  // Use helper functions to find the TTR and TTI data.
  const isTTITask = (task: (typeof allTasks)[number]) =>
    task.name.startsWith(OPERATION_SPAN_NAME) && task.name.endsWith('/tti')
  const ttiData = allTasks.find(isTTITask) as TaskDataEmbeddedInOperation

  const isTTRTask = (task: (typeof allTasks)[number]) =>
    task.name.startsWith(OPERATION_SPAN_NAME) && task.name.endsWith('/ttr')
  const ttrData = allTasks.find(isTTRTask) as TaskDataEmbeddedInOperation

  // Extract durations if the tasks were found.
  const ttrDuration = ttrData?.duration
  const ttiDuration = ttiData?.duration

  const tasks = allTasks
    .filter((task) => !isTTITask(task) && !isTTRTask(task) && task.duration > 0)
    .map((task, idx) => {
      let overrideCommonName: string | undefined
      let kind = task.kind

      if (task.name.endsWith('.svg')) {
        overrideCommonName =
          overrideCommonName ??
          task.commonName.split('/').at(-1) ??
          task.commonName
        kind = 'asset'
        // return {
        //   ...task,
        //   commonName:
        //     overrideCommonName ??
        //     task.commonName.split('/').at(-1) ??
        //     task.commonName,
        //   kind: 'asset',
        // }
      }
      if (collapseRenders && kind === 'render') {
        overrideCommonName = 'renders'
      }
      if (collapseAssets && kind === 'asset') {
        overrideCommonName = 'assets'
      }
      if (collapseIframes && kind === 'iframe') {
        overrideCommonName = 'iframes'
      }
      if (kind === 'asset' || kind === 'iframe') {
        overrideCommonName =
          overrideCommonName ??
          task.commonName.split('/').at(-1) ??
          task.commonName
      }
      if (task.commonName.startsWith('https://')) {
        const shortenedName = task.commonName.split('zendesk.com').at(-1)
        if (task.metadata.initiatorType === 'xmlhttprequest') {
          overrideCommonName = collapseEmberResources
            ? 'ember-resource'
            : overrideCommonName ?? shortenedName ?? task.commonName
          kind = 'resource-ember'
        }
        if (kind === 'resource') {
          overrideCommonName =
            overrideCommonName ?? shortenedName ?? task.commonName
        }
      }
      if (task.commonName.startsWith('graphql/')) {
        const operationName = task.commonName.split('/').at(-1)
        const commonName =
          overrideCommonName ||
          (operationName && `graphql:${operationName}`) ||
          task.commonName
        if (
          task.commonName.startsWith('graphql/local/') &&
          task.detail.feature
        ) {
          const feature = task.detail.feature
          // match "graphql/local" "resource" with `detail.feature` with next "resource" of the same `metadata.feature`.
          // use commonName of the former.
          const matchingResourceTask = allTasks.slice(idx + 1).find((t) => {
            return t.metadata.feature === feature && t.kind === 'resource'
          })
          const resourceUrl = matchingResourceTask?.name
          if (matchingResourceTask) {
            matchingResourceTask.commonName = commonName
          }
          return {
            ...task,
            commonName,
            kind: 'resource',
            metadata: {
              ...task.metadata,
              resourceUrl,
            },
          }
        }
        return {
          ...task,
          commonName,
          kind: 'resource',
        }
      }
      return {
        ...task,
        commonName: overrideCommonName ?? task.commonName,
        kind,
      }
    })
    .sort((a, b) => {
      const orderA = order[a.kind] ?? 100
      const orderB = order[b.kind] ?? 100
      return orderA - orderB
    })

  const spanEvents = allTasks.filter((task) => task.duration === 0)
  const kinds = new Set(tasks.map((task) => task.kind))

  // regenerate the includedCommonTaskNames
  const includedCommonTaskNames = [
    ...new Set(tasks.map((task) => task.commonName)),
  ]

  // Create a new operation object without the TTR and TTI tasks;
  // this avoids any side effects from modifying tempOperation directly.
  return {
    ticketActivationOperation: {
      ...operation,
      tasks,
      includedCommonTaskNames,
    },
    ttrData,
    ttiData,
    ttrDuration,
    ttiDuration,
    spanEvents,
    kinds,
  }
}

const {
  ticketActivationOperation,
  ttrData,
  ttiData,
  ttrDuration,
  ttiDuration,
  spanEvents,
  kinds,
} = mapData()

const DEFAULT_MARGIN = { top: 50, left: 200, right: 120, bottom: 30 }

const removeRenderNames = (name: string) => !name.includes('/render')
export interface StyledTableProps {
  filteredTaskNames: string[]
}
const StyledTable: React.FC<StyledTableProps> = ({ filteredTaskNames }) => {
  // {<thead>
  //   <tr>
  //     <th style={{ textAlign: 'center', background: '#f0f0f0', padding: '1px', borderBottom: '1px solid #ccc' }}>Measurement</th>
  //     <th style={{ textAlign: 'center', background: '#f0f0f0', padding: '1px', borderBottom: '1px solid #ccc' }}>Value</th>
  //     {/* <th style={{ textAlign: 'center', background: '#f0f0f0', padding: '1px', borderBottom: '1px solid #ccc' }}>Description</th> */}
  //   </tr>
  // </thead>}

  return (
    <table
      style={{ width: '40%', borderCollapse: 'collapse', marginTop: '1px' }}
    >
      <tbody>
        <tr>
          <td
            style={{
              textAlign: 'center',
              padding: '1px',
              borderBottom: '1px solid #eee',
            }}
          >
            ttr (ms)
          </td>
          <td
            style={{
              textAlign: 'center',
              padding: '1px',
              borderBottom: '1px solid #eee',
            }}
          >
            {ttrDuration?.toFixed(1)}
          </td>
          {/* <td style={{ textAlign: 'center', padding: '1px', borderBottom: '1px solid #eee' }}>Collective time to finish rendering</td> */}
        </tr>
        <tr>
          <td
            style={{
              textAlign: 'center',
              padding: '1px',
              borderBottom: '1px solid #eee',
            }}
          >
            tti (ms)
          </td>
          <td
            style={{
              textAlign: 'center',
              padding: '1px',
              borderBottom: '1px solid #eee',
            }}
          >
            {ttiDuration?.toFixed(1)}
          </td>
          {/* <td style={{ textAlign: 'center', padding: '1px', borderBottom: '1px solid #eee' }}>First time user is able to interact with the page</td> */}
        </tr>
        <tr>
          <td
            style={{
              textAlign: 'center',
              padding: '1px',
              borderBottom: 'none',
            }}
          >
            unique task count
          </td>
          <td
            style={{
              textAlign: 'center',
              padding: '1px',
              borderBottom: 'none',
            }}
          >
            {filteredTaskNames.length}
          </td>
          {/* <td style={{ textAlign: 'center', padding: '1px', borderBottom: 'none' }}>Number of unique tasks performed during the operation</td> */}
        </tr>
      </tbody>
    </table>
  )
}

export interface TTLineProps {
  hoverData: TaskDataEmbeddedInOperation
  xCoordinate: number
  yMax: number
  showTooltip: (
    data: Partial<WithTooltipProvidedProps<TaskDataEmbeddedInOperation>>,
  ) => void
  hideTooltip: () => void
  title: string
  color?: string
  annotateAt?: 'top' | 'none'
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
}) => {
  let tooltipTimeout: number

  return (
    <>
      <Line
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
        onMouseMove={(event) => {
          if (tooltipTimeout) clearTimeout(tooltipTimeout)
          if (!('ownerSVGElement' in event.target)) return
          // Update tooltip position and data
          // const eventSvg = event.target;
          const coords = localPoint(
            event.target.ownerSVGElement as Element,
            event,
          )
          if (coords) {
            showTooltip({
              tooltipLeft: coords.x + 10,
              tooltipTop: coords.y + 10,
              tooltipData: hoverData,
            })
          }
        }}
      />
      {annotateAt === 'top' && (
        <Annotation
          x={xCoordinate + 15}
          y={-2}
          dx={0} // x offset of label from subject
          dy={0} // y offset of label from subject
          // onDragEnd={({ x, y, dx, dy }) => ...}
        >
          <Label
            fontColor={color}
            title={title}
            subtitle={
              `${(hoverData.duration === 0
                ? hoverData.operationStartOffset
                : hoverData.duration
              ).toFixed(2)} ms` ?? ''
            }
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

const FILTER_OPTIONS = ['Collapse Render Spans', 'Fetch', 'Compute']

export interface MultiSelectProps {
  setCollapseRenders: React.Dispatch<React.SetStateAction<boolean>>
  setDisplayFetches: React.Dispatch<React.SetStateAction<boolean>>
  setDisplayComputes: React.Dispatch<React.SetStateAction<boolean>>
}
const MultiSelect: React.FC<MultiSelectProps> = ({
  setCollapseRenders,
  setDisplayFetches,
  setDisplayComputes,
}) => {
  const [options, setOptions] = useState(FILTER_OPTIONS)

  const handleChange = useCallback<NonNullable<IComboboxProps['onChange']>>(
    ({ selectionValue, inputValue, type }) => {
      if (!Array.isArray(selectionValue)) return

      if (selectionValue?.includes('Collapse Render Spans')) {
        setCollapseRenders(true)
      } else if (
        !selectionValue?.includes('Collapse Render Spans') &&
        (type === 'input:keyDown:Enter' ||
          type === 'option:click' ||
          type === 'fn:setSelectionValue')
      ) {
        setCollapseRenders(false)
      }

      if (selectionValue?.includes('Fetch')) {
        setDisplayFetches(true)
      } else if (
        !selectionValue?.includes('Fetch') &&
        (type === 'input:keyDown:Enter' ||
          type === 'option:click' ||
          type === 'fn:setSelectionValue')
      ) {
        setDisplayFetches(false)
      }

      if (selectionValue?.includes('Compute')) {
        setDisplayComputes(true)
      } else if (
        !selectionValue?.includes('Compute') &&
        (type === 'input:keyDown:Enter' ||
          type === 'option:click' ||
          type === 'fn:setSelectionValue')
      ) {
        setDisplayComputes(false)
      }

      if (inputValue !== undefined) {
        if (inputValue === '') {
          setOptions(FILTER_OPTIONS)
        } else {
          const regex = new RegExp(
            inputValue.replace(/[.*+?^${}()|[\]\\]/giu, '\\$&'),
            'giu',
          )

          setOptions(FILTER_OPTIONS.filter((option) => option.match(regex)))
        }
      }
    },
    [setCollapseRenders],
  )

  const debounceHandleChange = useMemo(
    () => debounce(handleChange, 150),
    [handleChange],
  )

  useEffect(() => {
    return () => debounceHandleChange.cancel()
  }, [debounceHandleChange])

  return (
    <LegendDemo title="">
      <Row justifyContent="center">
        <Col sm={7}>
          <Field>
            <GardenLabel>Filter</GardenLabel>
            <Combobox
              isAutocomplete
              isMultiselectable
              maxHeight="auto"
              listboxMaxHeight="100px"
              listboxMinHeight="10px"
              onChange={debounceHandleChange}
            >
              {options.length === 0 ? (
                <Option isDisabled label="" value="No matches found" />
              ) : (
                options.map((value) => (
                  <Option key={value} value={value} isSelected={true} />
                ))
              )}
            </Combobox>
          </Field>
        </Col>
      </Row>
    </LegendDemo>
  )
}

function LegendDemo({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="legend">
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

export interface OperationVisualizerProps {
  width: number
  margin?: { top: number; right: number; bottom: number; left: number }
}
const OperationVisualizer: React.FC<OperationVisualizerProps> = ({
  width,
  margin = DEFAULT_MARGIN,
}) => {
  const [collapseRenders, setCollapseRenders] = useState(true)
  const [displayFetches, setDisplayFetches] = useState(true)
  const [displayComputes, setDisplayComputes] = useState(true)
  const taskNames = collapseRenders
    ? [
        'renders',
        ...ticketActivationOperation.includedCommonTaskNames.filter(
          removeRenderNames,
        ),
      ]
    : ticketActivationOperation.includedCommonTaskNames

  const commonNamesToBeRemoved = new Set()
  const filteredTasks = ticketActivationOperation.tasks.filter((task) => {
    if (
      (!displayFetches && task.kind === 'resource') ||
      (!displayComputes && task.kind === 'measure')
    ) {
      commonNamesToBeRemoved.add(task.commonName)
      return false
    }
    return true
  })

  const filteredTaskNames = taskNames.filter(
    (taskName) => !commonNamesToBeRemoved.has(taskName),
  )
  // Render proportions
  const tickHeight = 20
  const height =
    filteredTaskNames.length * tickHeight + margin.top + margin.bottom

  const xMax = width - margin.left - margin.right
  const yMax = height - margin.bottom - margin.top - 132

  const xScale = scaleLinear({
    domain: [0, rootOperation.duration + 10],
    range: [0, xMax],
  })

  const labelScale = useMemo(() => {
    return scaleBand({
      domain: filteredTaskNames,
      range: [0, yMax],
      padding: 0.2,
    })
  }, [filteredTaskNames, yMax])

  const colorScale = scaleOrdinal({
    domain: [...kinds],
    // domain: Object.keys(BAR_FILL_COLOR),
    // range: Object.values(BAR_FILL_COLOR),
    range: [...kinds].map((kind) => BAR_FILL_COLOR[kind as TaskSpanKind]),
  })

  // const toggleRenderCollapse = useCallback(
  //   () => setCollapseRenders((s) => !s),
  //   [],
  // )
  const ttiXCoor = xScale(ttiDuration ?? 0)
  const ttrXCoor = xScale(ttrDuration ?? 0)

  const {
    tooltipOpen,
    tooltipLeft,
    tooltipTop,
    tooltipData,
    hideTooltip,
    showTooltip,
  } = useTooltip<TaskDataEmbeddedInOperation>()
  let tooltipTimeout: number

  return width < 10 ? null : (
    <ThemeProvider>
      <header>
        <div
          style={{
            display: 'flex',
            flexDirection: 'row', // Align children in a row
            justifyContent: 'center',
            alignItems: 'center', // Center children vertically
            padding: '10px',
            gap: '20px', // Optional: set gap between children
          }}
        >
          <h1 style={{ fontSize: '24px', color: '#333' }}>
            Operation: {rootOperation.name}
          </h1>
          <StyledTable filteredTaskNames={filteredTaskNames} />
        </div>
      </header>
      <svg width={width - margin.right} height={height}>
        <Group top={margin.top} left={margin.left}>
          <Axis scale={xScale} top={yMax} />
          <Grid
            xScale={xScale}
            yScale={labelScale}
            width={xMax}
            height={yMax}
            numTicksRows={filteredTaskNames.length}
          />
          <TTLine
            title={'TTR'}
            xCoordinate={ttrXCoor}
            hoverData={ttrData}
            showTooltip={showTooltip}
            hideTooltip={hideTooltip}
            yMax={yMax}
          />
          <TTLine
            title={'TTI'}
            xCoordinate={ttiXCoor}
            hoverData={ttiData}
            showTooltip={showTooltip}
            hideTooltip={hideTooltip}
            yMax={yMax}
          />
          {spanEvents.map((task, i) => (
            <TTLine
              key={task.name}
              title={task.commonName}
              color={BAR_FILL_COLOR[task.kind as TaskSpanKind]}
              xCoordinate={xScale(task.operationStartOffset)}
              hoverData={task as TaskDataEmbeddedInOperation}
              showTooltip={showTooltip}
              hideTooltip={hideTooltip}
              yMax={yMax}
              annotateAt="none"
            />
          ))}
          {filteredTasks.map((task, i) => (
            <Bar
              opacity={0.4}
              rx={4}
              key={i}
              x={xScale(task.operationStartOffset)}
              y={labelScale(`${task.commonName}`)}
              width={xScale(task.duration)}
              height={labelScale.bandwidth()}
              fill={BAR_FILL_COLOR[task.kind as TaskSpanKind]}
              onMouseLeave={() => {
                // Prevent tooltip from flickering.
                tooltipTimeout = window.setTimeout(() => {
                  hideTooltip()
                }, 300)
              }}
              onMouseMove={(event: React.MouseEvent<SVGRectElement>) => {
                if (tooltipTimeout) clearTimeout(tooltipTimeout)
                if (!('ownerSVGElement' in event.target)) return
                // Update tooltip position and data
                // const eventSvg = event.target;
                const coords = localPoint(
                  event.target.ownerSVGElement as Element,
                  event,
                )
                if (coords) {
                  showTooltip({
                    tooltipLeft: coords.x + 10,
                    tooltipTop: coords.y + 10,
                    tooltipData: task as TaskDataEmbeddedInOperation,
                  })
                }
              }}
            />
          ))}
          <AxisLeft
            scale={labelScale}
            numTicks={filteredTaskNames.length}
            tickLabelProps={{
              fill: '#888',
              fontSize: 10,
              textAnchor: 'end',
              dy: '0.33em',
              width: 100,
            }}
            tickFormat={(value) => {
              return value
              // if (value.startsWith('http')) return value
              // const split = value.split(/\/|\./)
              // // if (split.at(-1) === 'render') {
              // //   return split.at(-2)
              // // }
              // // if (split.at(-1)?.includes('-till-')) {
              // //   return split.at(-1)
              // // }
              // return split.join('.')
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
        {/* <div>
          <input
            type="checkbox"
            checked={collapseRenders}
            onChange={toggleRenderCollapse}
            id="render-collapse-toggle"
            name="render-collapse-toggle"
          />
          <label htmlFor="#render-collapse-toggle">Collapse Render Spans</label>
        </div> */}

        <div
          style={{
            display: 'flex',
            flexDirection: 'row', // Align children in a row
            justifyContent: 'space-evenly',
            alignItems: 'center', // Center children vertically
            padding: '10px',
            gap: '20px', // Optional: set gap between children
            height: '100px',
          }}
        >
          <MultiSelect
            setCollapseRenders={setCollapseRenders}
            setDisplayFetches={setDisplayFetches}
            setDisplayComputes={setDisplayComputes}
          />
          <LegendDemo title="Legend">
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
            <strong>{tooltipData.name}</strong>
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
    </ThemeProvider>
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
