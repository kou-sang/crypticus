// Codificación JS <-> formato de valores de la REST API de Firestore.

export type FirestoreValue =
  | { nullValue: null }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { stringValue: string }
  | { arrayValue: { values?: FirestoreValue[] } }
  | { mapValue: { fields?: Record<string, FirestoreValue> } }
  | { timestampValue: string };

export type Fields = Record<string, FirestoreValue>;

// ---------- Codificación ----------

export function encodeValue(value: unknown): FirestoreValue {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (typeof value === 'string') return { stringValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
  if (typeof value === 'object') return { mapValue: { fields: encodeFields(value as Record<string, unknown>) } };
  throw new Error(`Tipo no soportado: ${typeof value}`);
}

export function encodeFields(record: Record<string, unknown>): Fields {
  const fields: Fields = {};
  for (const [key, value] of Object.entries(record)) {
    if (value !== undefined) fields[key] = encodeValue(value);
  }
  return fields;
}

export function decodeValue(value: FirestoreValue): unknown {
  if ('nullValue' in value) return null;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('stringValue' in value) return value.stringValue;
  if ('timestampValue' in value) return Date.parse(value.timestampValue);
  if ('arrayValue' in value) return (value.arrayValue.values ?? []).map(decodeValue);
  if ('mapValue' in value) return decodeFields(value.mapValue.fields ?? {});
  return null;
}

export function decodeFields(fields: Fields): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) out[key] = decodeValue(value);
  return out;
}
