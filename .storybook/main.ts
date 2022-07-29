import type { StorybookViteConfig } from '@storybook/builder-vite'

const config: StorybookViteConfig = {
  stories: ['../src/**/*.stories.mdx', '../src/**/*.stories.@(js|jsx|ts|tsx)'],
  addons: [
    '@storybook/addon-links',
    '@storybook/addon-essentials',
    '@storybook/addon-interactions',
  ],
  framework: '@storybook/react',
  core: {
    builder: '@storybook/builder-vite',
  },
  // other storybook options...,
  async viteFinal(config, options) {
    // modify and return config
    return config
  },
}

export default config
