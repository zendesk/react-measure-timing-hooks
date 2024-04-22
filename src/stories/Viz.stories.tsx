/* eslint-disable eslint-comments/no-unlimited-disable */
/* eslint-disable */
import React, { useCallback, useMemo, useState, useEffect } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { Label } from '@visx/annotation'
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
import TicketData from '../2024/ticket-fixtures/ticket-open-all-fetches-and-renders.json'
import { LegendOrdinal, LegendItem, LegendLabel } from '@visx/legend'
import type {
  Operation,
  TaskDataEmbeddedInOperation,
} from '../2024/operationTracking'
import { Line } from '@visx/shape';
import debounce from 'lodash.debounce';
import { Col, Row } from '@zendeskgarden/react-grid';
import {
  Combobox,
  Field,
  Hint,
  IComboboxProps,
  Label as GardenLabel,
  Option
} from '@zendeskgarden/react-dropdowns.next';
import { ThemeProvider } from '@zendeskgarden/react-theming';

// Assume TicketData has the right shape to match the Operation type,
// if not, validate or transform the data to fit the Operation type.

const rootOperation = TicketData;

const filterOutTTR_TTI = () => {
  const operation = TicketData.operations['ticket/activation'];

  // Constants representing the common names for TTR and TTI tasks.
  const OPERATION_TTR_COMMON_NAME = 'performance/ticket/activation/ttr';
  const OPERATION_TTI_COMMON_NAME = 'performance/ticket/activation/tti';
  
  // Use helper functions to find the TTR and TTI data.
  const ttrData = operation.tasks.find((task) => task.commonName === OPERATION_TTR_COMMON_NAME) as TaskDataEmbeddedInOperation | undefined;
  const ttiData = operation.tasks.find((task) => task.commonName === OPERATION_TTI_COMMON_NAME) as TaskDataEmbeddedInOperation | undefined;
  
  // Extract durations if the tasks were found.
  const ttrDuration = ttrData?.duration;
  const ttiDuration = ttiData?.duration;
  
  // Make a deep copy of the tasks and includedCommonTaskNames to avoid mutating the original TicketData.
  const tasks = operation.tasks
    .filter((task) => task.commonName !== OPERATION_TTR_COMMON_NAME && task.commonName !== OPERATION_TTI_COMMON_NAME)
    .sort((a, b) => b.commonName.localeCompare(a.commonName));
  const includedCommonTaskNames = operation.includedCommonTaskNames.filter(
    (name) => name !== OPERATION_TTR_COMMON_NAME && name !== OPERATION_TTI_COMMON_NAME,
  );
  
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
    ttiDuration
  };
}

const {ticketActivationOperation, ttrData, ttiData, ttrDuration, ttiDuration} = filterOutTTR_TTI();

const DEFAULT_MARGIN = { top: 30, left: 200, right: 120, bottom: 30 }

const BAR_FILL_COLOR = {
  compute: '#2ca02c',
  fetch: '#1f77b4',
  render: '#ff7f0e',
}
const removeRenderNames = (name: string) => !name.includes('/render')
export interface StyledTableProps {
  filteredTaskNames: string[]
}
const StyledTable: React.FC<StyledTableProps> = ({filteredTaskNames}) => {
  // {<thead>
  //   <tr>
  //     <th style={{ textAlign: 'center', background: '#f0f0f0', padding: '1px', borderBottom: '1px solid #ccc' }}>Measurement</th>
  //     <th style={{ textAlign: 'center', background: '#f0f0f0', padding: '1px', borderBottom: '1px solid #ccc' }}>Value</th>
  //     {/* <th style={{ textAlign: 'center', background: '#f0f0f0', padding: '1px', borderBottom: '1px solid #ccc' }}>Description</th> */}
  //   </tr>
  // </thead>}

  return (
    <table style={{ width: '40%', borderCollapse: 'collapse', marginTop: '1px' }}>
      <tbody>
        <tr>
          <td style={{ textAlign: 'center', padding: '1px', borderBottom: '1px solid #eee' }}>ttr (ms)</td>
          <td style={{ textAlign: 'center', padding: '1px', borderBottom: '1px solid #eee' }}>{ttrDuration?.toFixed(1)}</td>
          {/* <td style={{ textAlign: 'center', padding: '1px', borderBottom: '1px solid #eee' }}>Collective time to finish rendering</td> */}
        </tr>
        <tr>
          <td style={{ textAlign: 'center', padding: '1px', borderBottom: '1px solid #eee' }}>tti (ms)</td>
          <td style={{ textAlign: 'center', padding: '1px', borderBottom: '1px solid #eee' }}>{ttiDuration?.toFixed(1)}</td>
          {/* <td style={{ textAlign: 'center', padding: '1px', borderBottom: '1px solid #eee' }}>First time user is able to interact with the page</td> */}
        </tr>
        <tr>
          <td style={{ textAlign: 'center', padding: '1px', borderBottom: 'none' }}>unique task count</td>
          <td style={{ textAlign: 'center', padding: '1px', borderBottom: 'none' }}>{filteredTaskNames.length}</td>
          {/* <td style={{ textAlign: 'center', padding: '1px', borderBottom: 'none' }}>Number of unique tasks performed during the operation</td> */}
        </tr>
      </tbody>
    </table>
  );
};

export interface TTLineProps {
  hoverData: TaskDataEmbeddedInOperation | undefined
  xCoordinate: number
  yMax: number
  showTooltip: (data: Partial<WithTooltipProvidedProps<TaskDataEmbeddedInOperation>>) => void
  hideTooltip: () => void
}
const TTLine: React.FC<TTLineProps> = ({hoverData, xCoordinate, yMax, showTooltip, hideTooltip}) => {
  let tooltipTimeout: number

  return (
    <Line
      from={{ x: xCoordinate, y: 0 }}
      to={{ x: xCoordinate, y: yMax }}
      stroke={'red'}
      strokeWidth={2}
      opacity={0.8}
      onMouseLeave={() => {
        // Prevent tooltip from flickering.
        tooltipTimeout = window.setTimeout(() => {
          hideTooltip()
        }, 300)
      }}
      onMouseMove={(event) => {
        if (tooltipTimeout) clearTimeout(tooltipTimeout)
        // Update tooltip position and data
        // const eventSvg = event.target;
        const coords = localPoint(event.target.ownerSVGElement, event)
        if (coords) {
          showTooltip({
            tooltipLeft: coords.x + 10,
            tooltipTop: coords.y + 10,
            tooltipData: hoverData,
          })
        }
      }}
  />
  )
  
}

const FILTER_OPTIONS = [
  'Collapse Render Spans',
  'Fetch',
  'Compute',
];


export interface MultiSelectProps {
  setCollapseRenders: React.Dispatch<React.SetStateAction<boolean>>
  setDisplayFetches: React.Dispatch<React.SetStateAction<boolean>>
  setDisplayComputes: React.Dispatch<React.SetStateAction<boolean>>
}
const MultiSelect: React.FC<MultiSelectProps> = ({setCollapseRenders, setDisplayFetches, setDisplayComputes}) => {
  const [options, setOptions] = useState(FILTER_OPTIONS);

  const handleChange = useCallback<NonNullable<IComboboxProps['onChange']>>(({ selectionValue, inputValue, type }) => {
    if (selectionValue?.includes('Collapse Render Spans')) {
      setCollapseRenders(true);
    } 
    else if (!selectionValue?.includes('Collapse Render Spans') && (type === 'input:keyDown:Enter' || type === 'option:click' || type === 'fn:setSelectionValue')){
      setCollapseRenders(false);
    }

    if (selectionValue?.includes('Fetch')) {
      setDisplayFetches(true);
    } 
    else if (!selectionValue?.includes('Fetch') && (type === 'input:keyDown:Enter' || type === 'option:click' || type === 'fn:setSelectionValue')){
      setDisplayFetches(false);
    }

    if (selectionValue?.includes('Compute')) {
      setDisplayComputes(true);
    } 
    else if (!selectionValue?.includes('Compute') && (type === 'input:keyDown:Enter' || type === 'option:click' || type === 'fn:setSelectionValue')){
      setDisplayComputes(false);
    }
    
    if (inputValue !== undefined) {
      if (inputValue === '') {
        setOptions(FILTER_OPTIONS);
      } else {
        const regex = new RegExp(inputValue.replace(/[.*+?^${}()|[\]\\]/giu, '\\$&'), 'giu');

        setOptions(FILTER_OPTIONS.filter(option => option.match(regex)));
      }
    }
  }, [setCollapseRenders]);

  const debounceHandleChange = useMemo(() => debounce(handleChange, 150), [handleChange]);

  useEffect(() => {
    return () => debounceHandleChange.cancel();
  }, [debounceHandleChange]);

  return (
    <Row justifyContent="center">
      <Col sm={7}>
        <Field>
          <GardenLabel>Filter</GardenLabel>
          <Combobox
            isAutocomplete
            isMultiselectable
            maxHeight="auto"
            listboxMaxHeight='200px'
            onChange={debounceHandleChange}
          >
            {options.length === 0 ? (
              <Option isDisabled label="" value="No matches found" />
            ) : (
              options.map(value => <Option key={value} value={value} isSelected={true}/>)
            )}
          </Combobox>
        </Field>
      </Col>
    </Row>
  );
};

export interface OperationVisualizerProps {
  width: number
  margin?: { top: number; right: number; bottom: number; left: number }
  events?: boolean
}
const OperationVisualizer: React.FC<OperationVisualizerProps> = ({
  width,
  margin = DEFAULT_MARGIN,
  events = false,
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

  const commonNamesToBeRemoved = new Set();
  const filteredTasks = ticketActivationOperation.tasks.filter(task => {
    if ((!displayFetches && task.kind === 'fetch') || (!displayComputes && task.kind === 'compute')) {
      commonNamesToBeRemoved.add(task.commonName);
      return false
    }
    return true;
  }) 
  
  const filteredTaskNames = taskNames.filter((taskName) => !commonNamesToBeRemoved.has(taskName))
  // Render proportions
  const tickHeight = 20
  const height = filteredTaskNames.length * tickHeight + margin.top + margin.bottom

  const xMax = width - margin.left - margin.right
  const yMax = height - margin.bottom - margin.top - 50

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
    domain: Object.keys(BAR_FILL_COLOR),
    range: Object.values(BAR_FILL_COLOR),
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
        <div style={{
          display: 'flex',
          flexDirection: 'row', // Align children in a row
          justifyContent: 'center',
          alignItems: 'center', // Center children vertically
          padding: '10px',
          gap: '20px' // Optional: set gap between children
        }}>
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
          {filteredTasks.map((task, i) => (
            <Bar
              opacity={0.4}
              rx={4}
              key={i}
              x={xScale(task.operationStartOffset)}
              y={labelScale(`${task.commonName}`)}
              width={xScale(task.duration)}
              height={labelScale.bandwidth()}
              fill={BAR_FILL_COLOR[task.kind]}
              onMouseLeave={() => {
                // Prevent tooltip from flickering.
                tooltipTimeout = window.setTimeout(() => {
                  hideTooltip()
                }, 300)
              }}
              onMouseMove={(event: React.MouseEvent<SVGRectElement>) => {
                if (tooltipTimeout) clearTimeout(tooltipTimeout)
                // Update tooltip position and data
                // const eventSvg = event.target;
                const coords = localPoint(event.target.ownerSVGElement, event)
                if (coords) {
                  showTooltip({
                    tooltipLeft: coords.x + 10,
                    tooltipTop: coords.y + 10,
                    tooltipData: task,
                  })
                }
              }}
            />
          ))}
          <TTLine
            yMax={yMax}
            xCoordinate={ttrXCoor}
            hoverData={ttrData}
            showTooltip={showTooltip}
            hideTooltip={hideTooltip}
          />
          <TTLine
            yMax={yMax}
            xCoordinate={ttiXCoor}
            hoverData={ttiData}
            showTooltip={showTooltip}
            hideTooltip={hideTooltip}
          />
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

        <div style={{
          display: 'flex',
          flexDirection: 'row', // Align children in a row
          justifyContent: 'space-evenly',
          alignItems: 'center', // Center children vertically
          padding: '10px',
          gap: '20px' // Optional: set gap between children
        }}>
          <MultiSelect setCollapseRenders={setCollapseRenders} setDisplayFetches={setDisplayFetches} setDisplayComputes={setDisplayComputes}/>

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
