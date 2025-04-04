import React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { TraceManagerDebugger } from '../../v3/TraceManagerDebugger'
import { App } from './App'
import { traceManager } from './traceManager'

const meta: Meta<typeof App> = {
  component: App,
}

// eslint-disable-next-line import/no-default-export
export default meta
type Story = StoryObj<typeof App>

export const Primary: Story = {
  render: () => <App />,
}

export const WithDebugger: Story = {
  render: () => (
    <div>
      <div style={{ marginTop: '20px' }}>
        <TraceManagerDebugger traceManager={traceManager} />
      </div>
      <App />
    </div>
  ),
}
