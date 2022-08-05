import type { ScaffoldConfig } from '@niieani/scaffold'

const config: ScaffoldConfig = {
  module: '@niieani/scaffold',
  drivers: ['babel', 'eslint', 'jest', 'prettier', 'typescript'],
  settings: {
    engineTarget: 'web',
    codeTarget: 'es2015',
  },
}

export default config
