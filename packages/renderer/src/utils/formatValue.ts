import type { Value } from '@jvm-viz/engine';

/** Returns a display string and a CSS class for a Value */
export function formatValue(v: Value): { text: string; cls: string } {
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
      return { text: `→ ${v.objectId}`, cls: 'field-row__value--ref' };
  }
}
