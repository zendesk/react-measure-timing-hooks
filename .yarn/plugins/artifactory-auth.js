// Adds artifactory authentication to the config, using common Zendesk env variables
const isCi = Boolean(process.env.CI)

module.exports = {
  name: `artifactory-auth`,
  factory: (yarnRequire) => {
    const ensureMap = (map, key) => {
      return map.get(key) || map.set(key, new Map()).get(key)
    }

    const authenticateArtifactory = (config) => {
      const npmScopes = ensureMap(config.values, 'npmScopes')
      const scope = ensureMap(npmScopes, 'zendesk')

      if (scope.get('npmAuthToken') || scope.get('npmAuthIdent')) {
        // All set!
      } else if (npmScopes.get('zendesk-artifactory')?.get('npmAuthToken')) {
        // Copy auth token from `zendesk-artifactory`
        // Unfortunately, with Yarn 3 we cannot just login to the `zendesk` scope,
        // as repositories config will override the user settings...
        scope.set(
          'npmAuthToken',
          npmScopes.get('zendesk-artifactory')?.get('npmAuthToken'),
        )
      } else if (
        process.env.ARTIFACTORY_USERNAME &&
        process.env.ARTIFACTORY_API_KEY
      ) {
        scope.set(
          'npmAuthIdent',
          `${process.env.ARTIFACTORY_USERNAME}:${process.env.ARTIFACTORY_API_KEY}`,
        )
      } else if (
        !(process.argv.includes('--version') || process.argv[2] === 'config')
      ) {
        // eslint-disable-next-line no-console
        console.log(`
    You're not logged in to the Artifactory!
    Make sure ARTIFACTORY_USERNAME and ARTIFACTORY_API_KEY are set in your environment.
          `)

        if (isCi) process.exit(1)
      }
    }

    return {
      hooks: {
        registerPackageExtensions(config, registerPackageExtension) {
          authenticateArtifactory(config)
        },
      },
    }
  },
}
