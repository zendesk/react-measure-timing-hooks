import type { StorybookConfig } from '@storybook/react-webpack5'
import remarkGfm from 'remark-gfm'
// import { mergeConfig } from 'vite'

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(js|jsx|ts|tsx)'],
  addons: [
    '@storybook/addon-essentials',
    '@storybook/addon-webpack5-compiler-swc',
    // '@storybook/addon-links',
    // '@storybook/addon-interactions',
    // '@storybook/addon-actions',
    // '@storybook/addon-viewport',
    // {
    //   name: '@storybook/addon-docs',
    //   options: {
    //     mdxPluginOptions: {
    //       mdxCompileOptions: {
    //         remarkPlugins: [remarkGfm],
    //       },
    //     },
    //   },
    // },
    // '@storybook/addon-controls',
    // '@storybook/addon-backgrounds',
    // '@storybook/addon-toolbars',
    // '@storybook/addon-measure',
    // '@storybook/addon-outline',
  ],
  framework: '@storybook/react-webpack5',
  // framework: {
  //   // name: '@storybook/react-vite',
  //   name: '@storybook/react-webpack5',
  //   options: {},
  // },
  core: {},
  // other storybook options...,
  webpackFinal(config, options) {
    const assetRule = config.module?.rules?.find((m) => typeof m === 'object' && m.test instanceof RegExp && m.test.test('.svg'))
    if (!assetRule || typeof assetRule !== 'object') {
      throw new Error('SVG rule not found')
    }
    assetRule.test = /\.(ico|jpg|jpeg|png|apng|gif|eot|otf|webp|ttf|woff|woff2|cur|ani|pdf)(\?.*)?$/

    config.module?.rules?.unshift({
      test: /\.svg$/,
      // issuer: /\.[jt]sx?$/,
      use: [{loader: '@svgr/webpack', options: {exportType: 'named'}}, 'url-loader'],
      // type: 'asset/resource',
      // generator: { filename: 'static/media/[path][name][ext]' }
    })
    console.log(config.module?.rules)
    return config
  },
  // async viteFinal(config, options) {
  //   return mergeConfig(config, {

  //   })
  // },
  typescript: {
    check: false,
    reactDocgen: 'react-docgen',
    reactDocgenTypescriptOptions: {}, // Available only when reactDocgen is set to 'react-docgen-typescript'
    // skipCompiler: true,
  },
  docs: {
    autodocs: true,
  },
}
export default config
