/* eslint-disable no-magic-numbers */
/* eslint-disable import/no-extraneous-dependencies */

import React from 'react'
import styled from 'styled-components'
import { Annotation, Label } from '@visx/annotation'
import { localPoint } from '@visx/event'
import { Bar, Line } from '@visx/shape'
import type { BarProps } from '@visx/shape/lib/shapes/Bar'
import type { LineProps } from '@visx/shape/lib/shapes/Line'
import type { AddSVGProps } from '@visx/shape/lib/types'
import { WithTooltipProvidedProps } from '@visx/tooltip/lib/enhancers/withTooltip'
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
  xCoordinate?: number
  color?: string
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
    data,
    showTooltip,
    hideTooltip,
    onClick,
    scrollContainerRef,
    xCoordinate,
    color,
    title,
    annotateAt,
    ...restProps
  } = props
  let tooltipTimeout: number

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
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={onClick}
      />
    ) : (
      // @ts-expect-error odd typing issue
      <StyledBar
        {...restProps}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={onClick}
      />
    )

  return (
    <>
      {element}
      {annotateAt === 'top' && xCoordinate && (
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
