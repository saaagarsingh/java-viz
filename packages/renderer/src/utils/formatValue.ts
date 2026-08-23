import type { Value } from '@jvm-viz/engine';

interface FormatValueOptions {
  objectLabels?: Map<string, string>;
  refDisplay?: 'compact' | 'verbose' | 'raw';
}

/** Returns a display string and a CSS class for a Value */
export function formatValue(v: Value, opts?: FormatValueOptions): { text: string; cls: string } {
  switch (v.kind) {
    case 'int':
    case 'long':
    case 'float':
    case 'double':
      return { text: String(v.value), cls: '' };
    case 'boolean':
      return { text: String(v.value), cls: '' };
    case 'char':
      return { text: `"${v.value}"`, cls: '' };
    case 'null':
      return { text: 'null', cls: 'field-row__value--null' };
    case 'uninitialized':
      return { text: '⟨uninit⟩', cls: 'field-row__value--uninit' };
    case 'ref':
      return { text: formatRef(v.objectId, opts), cls: 'field-row__value--ref' };
  }
}

function formatRef(objectId: string, opts?: FormatValueOptions): string {
  const mode = opts?.refDisplay ?? 'compact';
  if (mode === 'raw') return `→ ${objectId}`;

  const label = opts?.objectLabels?.get(objectId);
  if (!label) return `→ ${objectId}`;
  if (mode === 'verbose') return `→ ${label} (${objectId})`;
  return `→ ${label}`;
}
