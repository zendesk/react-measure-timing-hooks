import { ESLintConfig } from '@beemo/driver-eslint'

const config: ESLintConfig = {
  rules: {
    '@typescript-eslint/member-ordering': 'off',
    // just in case we want to support older browsers
    'unicorn/prefer-at': 'off',
    'compat/compat': 'off',
  },
}

export default config
