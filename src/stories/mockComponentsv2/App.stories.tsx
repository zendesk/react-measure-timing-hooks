import React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { App } from './App'

const meta: Meta<typeof App> = {
  component: App,
}

export default meta
type Story = StoryObj<typeof App>

export const Primary: Story = {
  render: () => <App />,
}
