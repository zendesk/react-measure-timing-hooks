import type { MapSchemaToTypes, RelationSchemaValue } from './types'

/**
 * Validates and coerces a relatedTo object against a schema
 * @param relatedTo The relatedTo object to validate and coerce
 * @param schema The schema to validate against
 * @returns An object containing the coerced relatedTo and any validation errors
 */
export function validateAndCoerceRelatedToAgainstSchema<
  RelationSchemaT extends Record<string, RelationSchemaValue>,
>(
  relatedTo: MapSchemaToTypes<RelationSchemaT>,
  schema: RelationSchemaT,
): { relatedTo: MapSchemaToTypes<RelationSchemaT>; errors: string[] } {
  const errors: string[] = []
  const coercedRelatedTo: Record<string, unknown> = { ...relatedTo }

  // Check if all required keys from the schema are present in the relatedTo
  for (const [key, schemaValue] of Object.entries(schema)) {
    if (!(key in relatedTo)) {
      errors.push(`Missing required key: "${key}"`)
      // eslint-disable-next-line no-continue
      continue
    }

    const value = relatedTo[key]

    // Validate and coerce the value based on the schema type
    switch (schemaValue) {
      case String: {
        if (typeof value !== 'string') {
          errors.push(
            `Expected "${key}" to be a string, but got ${typeof value}`,
          )
          try {
            // Attempt to coerce to string
            coercedRelatedTo[key] = String(value)
          } catch {
            errors.push(`Failed to coerce "${key}" to string: ${value}`)
          }
        }

        break
      }
      case Number: {
        if (typeof value !== 'number') {
          errors.push(
            `Expected "${key}" to be a number, but got ${typeof value}`,
          )
          const coercedValue = Number(value)
          if (!Number.isNaN(coercedValue)) {
            coercedRelatedTo[key] = coercedValue
          } else {
            errors.push(`Failed to coerce "${key}" to number: ${value}`)
          }
        }

        break
      }
      case Boolean: {
        if (typeof value !== 'boolean') {
          errors.push(
            `Expected "${key}" to be a boolean, but got ${typeof value}`,
          )
          // eslint-disable-next-line unicorn/prefer-ternary
          if (value === 'true' || value === 'false') {
            coercedRelatedTo[key] = value === 'true'
          } else {
            // Use Boolean constructor which returns true for truthy values and false for falsy values
            coercedRelatedTo[key] = Boolean(value)
          }
        }

        break
      }
      default:
        if (Array.isArray(schemaValue) && !schemaValue.includes(value)) {
          // For enum types (readonly array of literals)
          // No coercion possible for enum types, just validate
          errors.push(
            `Expected "${key}" to be one of [${schemaValue.join(
              ', ',
            )}], but got ${String(value)}`,
          )
        }
    }
  }

  // Check if there are extra keys in the relatedTo that are not in the schema
  for (const key of Object.keys(relatedTo)) {
    if (!(key in schema)) {
      errors.push(`Unexpected key: "${key}"`)
    }
  }

  return {
    relatedTo: coercedRelatedTo as MapSchemaToTypes<RelationSchemaT>,
    errors,
  }
}
