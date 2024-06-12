import React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { useScreenSize } from '@visx/responsive'

import OperationVisualizer, { type OperationVisualizerProps } from '../../v2/visualizer'

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
