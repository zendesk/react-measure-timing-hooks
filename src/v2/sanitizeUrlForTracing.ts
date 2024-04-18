export function sanitizeUrlForTracing(url: string): {
  commonUrl: string
  query: Record<string, string | string[]>
} {
  // Extract query string into a separate variable
  const queryStringIndex = url.indexOf('?')
  const query: Record<string, string | string[]> = {}
  let commonUrl = url
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

  // Remove URL scheme
  // const urlWithoutScheme = commonUrl.replace(/(^\w+:|^)\/\//, '');
  // Replace numeric parts of the ID with $ID
  let sanitizedUrl = commonUrl.replace(/\/\d+/g, '/$id')
  // replace UUIDs as well:
  sanitizedUrl = sanitizedUrl.replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g,
    '$uuid',
  )

  return {
    commonUrl: sanitizedUrl,
    query,
  }
}
