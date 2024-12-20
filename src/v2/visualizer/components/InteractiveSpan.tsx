/* eslint-disable no-magic-numbers */
/* eslint-disable import/no-extraneous-dependencies */

import React from 'react'
import styled, { useTheme } from 'styled-components'
import { Annotation, Label } from '@visx/annotation'
import { localPoint } from '@visx/event'
import { Bar, Line } from '@visx/shape'
import type { BarProps } from '@visx/shape/lib/shapes/Bar'
import type { LineProps } from '@visx/shape/lib/shapes/Line'
import type { AddSVGProps } from '@visx/shape/lib/types'
import { Text } from '@visx/text'
import { WithTooltipProvidedProps } from '@visx/tooltip/lib/enhancers/withTooltip'
import type { ScaleBand, ScaleLinear } from '@visx/vendor/d3-scale'
import { getColor } from '@zendeskgarden/react-theming'
import { BAR_FILL_COLOR } from '../constants'
import { MappedSpanAndAnnotation } from '../types'

const interactiveStyles = `
  cursor: pointer;
  transition: all 0.2s ease-in-out;

  &:hover {
    filter: brightness(1.2);
  }
`

const StyledLine = styled(Line)`
  ${interactiveStyles}

  &:hover {
    stroke-opacity: 0.8;
    stroke-width: 3.5px;
  }
`

const StyledBar = styled(Bar)`
  ${interactiveStyles}

  &:hover {
    opacity: 0.7 !important;
    stroke: #fff;
    stroke-width: 2px;
  }
`

interface SharedAnnotationProps {
  xScale: ScaleLinear<number, number, never>
  yScale: ScaleBand<string>
  yMax: number
  titleColor?: string
  title?: string
  annotateAt?: 'top'
  data: MappedSpanAndAnnotation
  showTooltip: (
    data: Partial<WithTooltipProvidedProps<MappedSpanAndAnnotation>>,
  ) => void
  hideTooltip: () => void
}

interface InteractiveLineSpanProps
  extends SharedAnnotationProps,
    Omit<AddSVGProps<LineProps, SVGLineElement>, 'ref'> {
  type: 'line'
  onClick: () => void
  scrollContainerRef: React.RefObject<HTMLDivElement>
}

interface InteractiveBarSpanProps
  extends SharedAnnotationProps,
    Omit<AddSVGProps<BarProps, SVGLineElement>, 'ref'> {
  type: 'bar'
  onClick: () => void
  scrollContainerRef: React.RefObject<HTMLDivElement>
}

type InteractiveSpanProps = InteractiveLineSpanProps | InteractiveBarSpanProps

const InteractiveSpan: React.FC<InteractiveSpanProps> = (props) => {
  const {
    xScale,
    yScale,
    yMax,
    data,
    showTooltip,
    hideTooltip,
    onClick,
    scrollContainerRef,
    titleColor: color,
    title,
    annotateAt,
    ...restProps
  } = props
  let tooltipTimeout: number

  const theme = useTheme()

  const handleMouseLeave = () => {
    // prevent tooltip flickering
    tooltipTimeout = window.setTimeout(() => {
      hideTooltip()
    }, 300)
  }

  const handleMouseMove = (event: React.MouseEvent<SVGElement>) => {
    if (tooltipTimeout) clearTimeout(tooltipTimeout)
    if (!('ownerSVGElement' in event.target)) return

    const coords = localPoint(event.target.ownerSVGElement as Element, event)
    if (coords && scrollContainerRef.current) {
      const { scrollTop } = scrollContainerRef.current
      showTooltip({
        tooltipLeft: coords.x + 20,
        tooltipTop: coords.y + 10 - scrollTop,
        tooltipData: data,
      })
    }
  }

  const element =
    restProps.type === 'line' ? (
      <StyledLine
        {...restProps}
        from={{
          x: xScale(data.annotation.operationRelativeStartTime),
          y: 0,
        }}
        to={{
          x: xScale(data.annotation.operationRelativeEndTime),
          y: yMax,
        }}
        stroke={BAR_FILL_COLOR[data.type]}
        strokeOpacity={0.3}
        strokeWidth={2.5}
        strokeDasharray="8,4"
        strokeLinecap="round"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={onClick}
      />
    ) : (
      <>
        <StyledBar
          {...restProps}
          data-status={data.span.status}
          x={xScale(data.annotation.operationRelativeStartTime)}
          y={yScale(data.groupName)}
          width={xScale(data.span.duration)}
          height={yScale.bandwidth()}
          fill={
            data.span.status === 'error'
              ? getColor({ theme, variable: 'background.dangerEmphasis' })
              : BAR_FILL_COLOR[data.type]
          }
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onClick={onClick}
        />
        {data.span.status === 'error' && (
          <Text
            x={xScale(data.annotation.operationRelativeStartTime) + 4}
            y={yScale(data.groupName)! + yScale.bandwidth() / 2}
            dy=".33em"
            fontSize={12}
            textAnchor="start"
            fill={getColor({ theme, variable: 'background.danger' })}
            style={{ pointerEvents: 'none' }}
          >
            ❌ error
          </Text>
        )}
      </>
    )

  const xCoordinate = xScale(data.annotation.operationRelativeEndTime)

  return (
    <>
      {element}
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
            titleFontSize={13}
            subtitle={`${data.annotation.operationRelativeEndTime.toFixed(
              2,
            )} ms`}
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

export default InteractiveSpan
