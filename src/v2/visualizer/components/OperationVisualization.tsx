/* eslint-disable no-magic-numbers */
/* eslint-disable import/no-extraneous-dependencies */
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import debounce from 'lodash.debounce'
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
import {
  type OptionValue,
  Combobox,
  Field,
  IComboboxProps,
  Option,
} from '@zendeskgarden/react-dropdowns'
import { Grid as GardenGrid } from '@zendeskgarden/react-grid'
import { ThemeProvider } from '@zendeskgarden/react-theming'
import {
  type FilterOption,
  BAR_FILL_COLOR,
  COLLAPSE_ASSET_SPANS_TEXT,
  COLLAPSE_EMBER_RESOURCE_SPANS,
  COLLAPSE_IFRAME_SPANS,
  COLLAPSE_RENDER_SPANS_TEXT,
  FILTER_OPTIONS,
  MEASURES_TEXT,
  RESOURCES_TEXT,
} from '../constants'
import { MappedOperation } from '../mapTicketActivationData'
import { MappedSpanAndAnnotation } from '../types'

const DEFAULT_MARGIN = { top: 50, left: 200, right: 120, bottom: 30 }

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
            subtitle={`${(hoverData.span.duration === 0
              ? hoverData.annotation.operationRelativeStartTime
              : hoverData.span.duration
            ).toFixed(2)} ms`}
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

  useEffect(
    () => () => void debounceHandleChange.cancel(),
    [debounceHandleChange],
  )

  return (
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    <LegendDemo title="">
      <GardenGrid.Row justifyContent="center">
        <GardenGrid.Col sm={13}>
          <Field>
            <Field.Label>Filter</Field.Label>
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
        </GardenGrid.Col>
      </GardenGrid.Row>
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

export interface OperationVisualizationProps {
  width: number
  operation: MappedOperation
  setDisplayOptions: React.Dispatch<
    React.SetStateAction<Record<FilterOption, boolean>>
  >
  displayOptions: Record<FilterOption, boolean>
  margin?: { top: number; right: number; bottom: number; left: number }
}
const OperationVisualization: React.FC<OperationVisualizationProps> = ({
  width,
  operation,
  displayOptions,
  setDisplayOptions,
  margin = DEFAULT_MARGIN,
}) => {
  const { spanEvents, spanTypes, uniqueGroups, spansWithDuration } = operation

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

  return width < 10 ? null : (
    <ThemeProvider>
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
              />
            ))}
            {spansWithDuration.map((entry, i) => (
              <React.Fragment key={`entry-${i}`}>
                <Bar
                  opacity={0.4}
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
                        tooltipData: entry,
                      })
                    }
                  }}
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
          <MultiSelect setState={setDisplayOptions} state={displayOptions} />
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
            <strong>{tooltipData.groupName}</strong>
            <div style={{ marginTop: '5px', fontSize: '12px', opacity: '80%' }}>
              <div>kind: {tooltipData.type}</div>
              <div>occurrence: {tooltipData.annotation.occurrence}</div>
              <div>
                start:{' '}
                {tooltipData.annotation.operationRelativeStartTime.toFixed(2)}ms
              </div>
              <div>duration: {tooltipData.span.duration.toFixed(2)}ms</div>
              {tooltipData.span.performanceEntry && (
                <div>
                  <div>performanceEntry:</div>
                  <pre>
                    {JSON.stringify(tooltipData.span.performanceEntry, null, 2)}
                  </pre>
                </div>
              )}
              {tooltipData.span.attributes && (
                <div>
                  <div>Attributes:</div>
                  <pre>
                    {JSON.stringify(tooltipData.span.attributes, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </TooltipWithBounds>
      )}
    </ThemeProvider>
  )
}

// eslint-disable-next-line import/no-default-export
export default OperationVisualization
