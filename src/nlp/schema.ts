import schema from '../../packages/subtitle-contract/schema.json';

type Shape = { type?: string | string[]; enum?: unknown[]; pattern?: string; minimum?: number; required?: string[]; properties?: Record<string, Shape>; items?: Shape };
// The shared contract uses this bounded subset of Draft 2020-12. Unknown optional fields are preserved.
export function validateShape(value: unknown, shape: Shape = schema as Shape): void {
  if (shape.enum && !shape.enum.includes(value)) throw Error('Invalid contract enum');
  const matches = (type: string) => type === 'null' ? value === null : type === 'array' ? Array.isArray(value) : type === 'object' ? value !== null && typeof value === 'object' && !Array.isArray(value) : type === 'integer' ? Number.isSafeInteger(value) : typeof value === type;
  if (shape.type && !(Array.isArray(shape.type) ? shape.type : [shape.type]).some(matches)) throw Error('Invalid contract type');
  if (shape.pattern && (typeof value !== 'string' || !new RegExp(shape.pattern).test(value))) throw Error('Invalid contract string');
  if (shape.minimum !== undefined && (typeof value !== 'number' || value < shape.minimum)) throw Error('Invalid contract number');
  if (shape.items && Array.isArray(value)) for (const item of value) validateShape(item, shape.items);
  if (shape.properties && value !== null && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    for (const key of shape.required ?? []) if (!Object.hasOwn(object, key)) throw Error(`Missing contract field: ${key}`);
    for (const [key, child] of Object.entries(shape.properties)) if (Object.hasOwn(object, key)) validateShape(object[key], child);
  }
}
