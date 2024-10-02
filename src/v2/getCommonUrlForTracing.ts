const COMMON_EXTENSIONS = [
  '.html',
  '.js',
  '.css',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.svg',
  '.webp',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.otf',
  '.ico',
]

export function getCommonUrlForTracing(
  url: string,
  commonExtensions = COMMON_EXTENSIONS,
): {
  commonUrl: string
  query: Record<string, string | string[]>
  hash: string
} {
  let commonUrl = url
  let hash = ''
  const hashIndex = url.indexOf('#')
  if (hashIndex >= 0) {
    commonUrl = url.slice(0, hashIndex)
    hash = url.slice(hashIndex)
  }
  // Extract query string into a separate variable
  const queryStringIndex = url.indexOf('?')
  const query: Record<string, string | string[]> = {}
  if (queryStringIndex >= 0) {
    // Split the URL to get the query string part
    commonUrl = url.slice(0, queryStringIndex)
    const queryString = url.slice(queryStringIndex + 1)
    // Parse query string into an object
    queryString
      .split('&')
      .map((param) => param.split('='))
      .forEach(([key, value]) => {
        if (!key) return
        // decode URI components and handle the case for array parameters
        const decodedKey = decodeURIComponent(key)
        const decodedValue = value ? decodeURIComponent(value) : ''

        // Check if the key already exists
        const currentValue = query[decodedKey]
        if (currentValue) {
          // If it does and it's an array, we push the new value to it
          // If it's not an array, we convert it to an array and then add the new value
          query[decodedKey] = Array.isArray(currentValue)
            ? [...currentValue, decodedValue]
            : [currentValue, decodedValue]
        } else {
          // If it doesn't exist, we simply add the key-value pair
          query[decodedKey] = decodedValue
        }
      })
  }

  // if the URL ends with a common extension, replace file name with $file:
  const urlParts = commonUrl.split('/')
  const lastPart = urlParts.at(-1)!
  const extensionIndex = lastPart.lastIndexOf('.')
  const extension =
    extensionIndex >= 0 ? lastPart.slice(extensionIndex) : undefined
  if (extension && commonExtensions.includes(extension)) {
    urlParts[urlParts.length - 1] = '$file'
    commonUrl = urlParts.join('/')
  }

  // replace UUIDs:
  commonUrl = commonUrl.replace(
    // eslint-disable-next-line unicorn/better-regex
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g,
    '$uuid',
  )
  // replace 32-character or longer hex strings:
  commonUrl = commonUrl.replace(
    // eslint-disable-next-line unicorn/better-regex
    /[0-9a-f]{32,}/g,
    '$hex',
  )
  // Replace numeric parts of the ID with $id
  commonUrl = commonUrl.replace(/\d{2,}/g, '$d')

  return {
    commonUrl,
    query,
    hash,
  }
}
