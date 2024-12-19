/* eslint-disable import/no-extraneous-dependencies */

import React from 'react'
import { Annotation, Label } from '@visx/annotation'
import { localPoint } from '@visx/event'
import { Line } from '@visx/shape'
import { WithTooltipProvidedProps } from '@visx/tooltip'
import { MappedSpanAndAnnotation } from '../types'

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

export default TTLine
