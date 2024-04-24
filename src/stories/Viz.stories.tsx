/* eslint-disable eslint-comments/no-unlimited-disable,unicorn/no-abusive-eslint-disable */
/* eslint-disable */
import type { Meta, StoryObj } from '@storybook/react'
import { Annotation, Label } from '@visx/annotation'
import { Axis, AxisLeft } from '@visx/axis'
import { localPoint } from '@visx/event'
import { Grid } from '@visx/grid'
import { Group } from '@visx/group'
import { useScreenSize } from '@visx/responsive'
import { scaleBand, scaleLinear, scaleOrdinal } from '@visx/scale'
import { Bar } from '@visx/shape'
import {
  TooltipWithBounds,
  defaultStyles as defaultTooltipStyles,
  useTooltip,
} from '@visx/tooltip'
import { WithTooltipProvidedProps } from '@visx/tooltip/lib/enhancers/withTooltip'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
// import TicketData from '../2024/ticket-fixtures/ticket-accept-chat.json'
import { LegendItem, LegendLabel, LegendOrdinal } from '@visx/legend'
import { Line } from '@visx/shape'
import {
  Combobox,
  Field,
  Label as GardenLabel,
  IComboboxProps,
  Option,
  type OptionValue,
} from '@zendeskgarden/react-dropdowns.next'
import { Col, Row } from '@zendeskgarden/react-grid'
import { ThemeProvider } from '@zendeskgarden/react-theming'
import debounce from 'lodash.debounce'
import TicketData from '../2024/ticket-fixtures/ticket-open-new-format-slow.json'
import type { TaskDataEmbeddedInOperation, TaskSpanKind } from '../2024/types'

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

const DEFAULT_MARGIN = { top: 50, left: 200, right: 120, bottom: 30 }

export interface StyledTableProps {
  filteredTaskNames: string[]
  ttiDuration: number
  ttrDuration: number
}
const StyledTable: React.FC<StyledTableProps> = ({
  filteredTaskNames,
  ttiDuration,
  ttrDuration,
}) => {
  return (
    <table
      style={{
        width: '40%',
        borderCollapse: 'collapse',
        marginTop: '1px',
        fontFamily: 'sans-serif',
      }}
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
            TTR
          </td>
          <td
            style={{
              textAlign: 'center',
              padding: '1px',
              borderBottom: '1px solid #eee',
            }}
          >
            {ttrDuration.toFixed(1)} ms
          </td>
        </tr>
        <tr>
          <td
            style={{
              textAlign: 'center',
              padding: '1px',
              borderBottom: '1px solid #eee',
            }}
          >
            TTI
          </td>
          <td
            style={{
              textAlign: 'center',
              padding: '1px',
              borderBottom: '1px solid #eee',
            }}
          >
            {ttiDuration.toFixed(1)} ms
          </td>
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

const RESOURCES_TEXT = 'Show Resources'
const MEASURES_TEXT = 'Show Measures'
const COLLAPSE_RENDER_SPANS_TEXT = 'Collapse Render Spans'
const COLLAPSE_ASSET_SPANS_TEXT = 'Collapse Asset Spans'
const COLLAPSE_EMBER_RESOURCE_SPANS = 'Collapse Ember Resource Spans'
const COLLAPSE_IFRAME_SPANS = 'Collapse iframe Spans'

type FilterOption =
  | typeof RESOURCES_TEXT
  | typeof MEASURES_TEXT
  | typeof COLLAPSE_RENDER_SPANS_TEXT
  | typeof COLLAPSE_ASSET_SPANS_TEXT
  | typeof COLLAPSE_EMBER_RESOURCE_SPANS
  | typeof COLLAPSE_IFRAME_SPANS

const FILTER_OPTIONS: FilterOption[] = [
  RESOURCES_TEXT,
  MEASURES_TEXT,
  COLLAPSE_RENDER_SPANS_TEXT,
  COLLAPSE_ASSET_SPANS_TEXT,
  COLLAPSE_EMBER_RESOURCE_SPANS,
  COLLAPSE_IFRAME_SPANS,
]

export interface MultiSelectProps {
  setState: React.Dispatch<React.SetStateAction<Record<FilterOption, boolean>>>
  state: Record<string, boolean>
}
const MultiSelect: React.FC<MultiSelectProps> = ({ state, setState }) => {
  const [options, setOptions] = useState(FILTER_OPTIONS)

  const handleChange = useCallback<NonNullable<IComboboxProps['onChange']>>(
    ({ selectionValue, inputValue, type }) => {
      if (!Array.isArray(selectionValue)) return

      handleOption({
        selectionValue,
        setter: setState,
        type,
        text: COLLAPSE_RENDER_SPANS_TEXT,
      })
      handleOption({
        selectionValue,
        setter: setState,
        type,
        text: RESOURCES_TEXT,
      })
      handleOption({
        selectionValue,
        setter: setState,
        type,
        text: MEASURES_TEXT,
      })
      handleOption({
        selectionValue,
        setter: setState,
        type,
        text: COLLAPSE_ASSET_SPANS_TEXT,
      })
      handleOption({
        selectionValue,
        setter: setState,
        type,
        text: COLLAPSE_EMBER_RESOURCE_SPANS,
      })
      handleOption({
        selectionValue,
        setter: setState,
        type,
        text: COLLAPSE_IFRAME_SPANS,
      })

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
    [state, setState],
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
        <Col sm={13}>
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
                  <Option key={value} value={value} isSelected={state[value]} />
                ))
              )}
            </Combobox>
          </Field>
        </Col>
      </Row>
    </LegendDemo>
  )
}

function handleOption({
  selectionValue,
  setter,
  type,
  text,
}: {
  selectionValue: OptionValue[]
  setter: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  type: string
  text: string
}) {
  if (selectionValue?.includes(text)) {
    setter((prev) => ({ ...prev, [text]: true }))
  } else if (
    !selectionValue?.includes(text) &&
    (type === 'input:keyDown:Enter' ||
      type === 'option:click' ||
      type === 'fn:setSelectionValue')
  ) {
    setter((prev) => ({ ...prev, [text]: false }))
  }
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

const mapData = ({
  collapseRenders = true,
  collapseAssets = true,
  collapseEmberResources = false,
  collapseIframes = false,
  displayResources = true,
  displayMeasures = true,
}: {
  collapseRenders?: boolean
  collapseAssets?: boolean
  collapseEmberResources?: boolean
  collapseIframes?: boolean
  displayResources?: boolean
  displayMeasures?: boolean
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
    .filter(
      (task) =>
        (displayResources || task.kind !== 'resource') &&
        (displayMeasures || task.kind !== 'measure'),
    )
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
    operation,
    tasks,
    includedCommonTaskNames,
    ttrData,
    ttiData,
    ttrDuration,
    ttiDuration,
    spanEvents,
    kinds,
  }
}

export interface OperationVisualizerProps {
  width: number
  margin?: { top: number; right: number; bottom: number; left: number }
}
const OperationVisualizer: React.FC<OperationVisualizerProps> = ({
  width,
  margin = DEFAULT_MARGIN,
}) => {
  const [state, setState] = useState({
    [RESOURCES_TEXT]: true,
    [MEASURES_TEXT]: true,
    [COLLAPSE_RENDER_SPANS_TEXT]: true,
    [COLLAPSE_ASSET_SPANS_TEXT]: true,
    [COLLAPSE_EMBER_RESOURCE_SPANS]: false,
    [COLLAPSE_IFRAME_SPANS]: false,
  })

  const {
    ttrData,
    ttiData,
    ttrDuration,
    ttiDuration,
    spanEvents,
    kinds,
    includedCommonTaskNames,
    tasks,
  } = useMemo(
    () =>
      mapData({
        collapseRenders: state[COLLAPSE_RENDER_SPANS_TEXT],
        collapseAssets: state[COLLAPSE_ASSET_SPANS_TEXT],
        collapseEmberResources: state[COLLAPSE_EMBER_RESOURCE_SPANS],
        collapseIframes: state[COLLAPSE_IFRAME_SPANS],
        displayResources: state[RESOURCES_TEXT],
        displayMeasures: state[MEASURES_TEXT],
      }),
    [state],
  )

  // Render proportions
  const tickHeight = 20
  const height =
    includedCommonTaskNames.length * tickHeight + margin.top + margin.bottom

  const footerHeight = 100
  const footerScaleHeight = 30

  const xMax = width - margin.left - margin.right
  const yMax = height - margin.bottom - margin.top //- 132

  const xScale = scaleLinear({
    domain: [0, rootOperation.duration + 10],
    range: [0, xMax],
  })

  const labelScale = useMemo(() => {
    return scaleBand({
      domain: includedCommonTaskNames,
      range: [0, yMax],
      padding: 0.2,
    })
  }, [includedCommonTaskNames, yMax])

  const colorScale = scaleOrdinal({
    domain: [...kinds],
    range: [...kinds].map((kind) => BAR_FILL_COLOR[kind as TaskSpanKind]),
  })

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
      <header
        style={{
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'center',
          alignItems: 'center',
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
          Operation: {rootOperation.name}
        </h1>
        <StyledTable
          filteredTaskNames={includedCommonTaskNames}
          ttiDuration={ttiDuration}
          ttrDuration={ttrDuration}
        />
      </header>
      <main style={{ height: `${height + margin.top + margin.bottom}px` }}>
        <svg width={width - margin.right} height={height}>
          <Group top={margin.top} left={margin.left}>
            <Axis scale={xScale} top={yMax} />
            <Grid
              xScale={xScale}
              yScale={labelScale}
              width={xMax}
              height={yMax}
              numTicksRows={includedCommonTaskNames.length}
            />
            <TTLine
              title="TTR"
              xCoordinate={ttrXCoor}
              hoverData={ttrData}
              showTooltip={showTooltip}
              hideTooltip={hideTooltip}
              yMax={yMax}
            />
            <TTLine
              title="TTI"
              xCoordinate={ttiXCoor}
              hoverData={ttiData}
              showTooltip={showTooltip}
              hideTooltip={hideTooltip}
              yMax={yMax}
            />
            {spanEvents.map((task) => (
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
            {tasks.map((task, i) => (
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
              numTicks={includedCommonTaskNames.length}
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
                // if (split.at(-1) === 'render') {
                //   return split.at(-2)
                // }
                // if (split.at(-1)?.includes('-till-')) {
                //   return split.at(-1)
                // }
                // return split.join('.')
              }}
            />
          </Group>
        </svg>
      </main>
      <footer
        style={{
          position: 'fixed',
          bottom: 0,
          backgroundColor: 'white',
          height: `${footerHeight + footerScaleHeight}px`,
        }}
      >
        <svg width={width - margin.right} height={footerScaleHeight}>
          <Axis scale={xScale} top={1} left={margin.left} />
        </svg>
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'space-evenly',
            alignItems: 'center',
            gap: '10px',
            height: `${footerHeight}px`,
          }}
        >
          <MultiSelect setState={setState} state={state} />
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
