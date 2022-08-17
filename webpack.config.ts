// call like: yarn webpack build --mode production --entry ./lib/hashids.ts --env moduleTarget=esm --env engineTarget=web --env outDir=dist/umd

import path from 'path'

// eslint-disable-next-line import/no-default-export
export default ({
  moduleTarget = 'esm',
  codeTarget = 'es2020',
  engineTarget = 'web',
  filename = 'main.js',
  outDir = moduleTarget,
}: {
  moduleTarget: string
  codeTarget?: string
  engineTarget?: string
  filename?: string
  outDir?: string
}): import('webpack').Configuration => {
  return {
    target: [codeTarget, engineTarget],
    experiments: {
      outputModule: true,
      // futureDefaults: true,
      // topLevelAwait: true,
      // css: false,
    },
    resolve: {
      extensions: ['.ts', '.tsx', '...'],
      alias: {
        '#image_overlay': path.join(__dirname, 'src/dummy.png'),
      },
    },
    mode: 'production',
    optimization: {
      concatenateModules: true,
    },
    entry: {
      main: {
        import: './src/main',
        // this should work, but doesn't for some reason:
        baseUri: 'data:',
      },
    },
    output: {
      module: true,
      library: {
        type: 'module',
      },
      chunkFormat: 'module',
      filename,
      path: path.join(process.cwd(), outDir),
      publicPath: '',
      importMetaName: `({url: 'https://_'})`,
    },
    devtool: 'source-map',
    module: {
      rules: [
        {
          test: /\.tsx?$/i,
          use: [
            {
              loader: 'ts-loader',
              options: {
                transpileOnly: true,
                compilerOptions: {
                  module: 'esnext',
                  target: 'es2015',
                  esModuleInterop: false,
                  sourceMap: true,
                },
              },
            },
          ],
        },
        {
          test: /\.css$/i,
          use: [
            { loader: 'style-loader', options: { injectType: 'lazyStyleTag' } },
            'css-loader',
          ],
        },
        {
          test: /\.svg$/i,
          type: 'asset/inline',
        },
      ],
    },
    ignoreWarnings: [
      {
        module: /node_modules\/lodash\/_freeGlobal\.js$/,
      },
    ],
    externals: ['react', 'react-dom'],
    externalsType: 'module',
  }
}
