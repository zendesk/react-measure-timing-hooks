import React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { App } from './App'

const meta: Meta<typeof App> = {
  component: App,
}

// eslint-disable-next-line import/no-default-export
export default meta
type Story = StoryObj<typeof App>

export const Primary: Story = {
  render: () => <App />,
}
