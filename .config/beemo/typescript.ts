import type TypeScript from '@niieani/scaffold/src/configs/typescript'

export default {
  compilerOptions: {
    jsx: 'react',
    target: 'es2015',
  },
  'ts-node': {
    compilerOptions: {
      module: 'commonjs',
    },
  },
} as typeof TypeScript