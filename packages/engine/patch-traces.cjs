const fs   = require('fs');
const path = require('path');
const dir  = '/Users/sagar.singh/Desktop/visdif/packages/engine/src/traces';

/** Parse arity from JVM descriptor */
function arityFromDescriptor(desc) {
  const m = desc.match(/^\(([^)]*)\)/);
  if (!m) return 0;
  const params = m[1];
  if (!params) return 0;
  let count = 0, i = 0;
  while (i < params.length) {
    const ch = params[i];
    if (ch === 'L') { count++; i = params.indexOf(';', i) + 1; }
    else if (ch === '[') { i++; }
    else { count++; i++; }
  }
  return count;
}

const files = fs.readdirSync(dir).filter(f => f.endsWith('.ts') && !f.includes('index'));
for (const file of files) {
  const fp  = path.join(dir, file);
  let   src = fs.readFileSync(fp, 'utf8');

  // Match VTableSlot literals WITHOUT arity field (flexible whitespace)
  // Pattern: slot:N, methodName:'...', [NO arity here] descriptor:'...', implementedBy:'...'
  const pattern = /\{\s*slot:\s*(\d+),\s*methodName:\s*('(?:[^']*)'|"(?:[^"]*)")\s*,\s*descriptor:\s*('(?:[^']*)'|"(?:[^"]*)")\s*,\s*implementedBy:\s*('(?:[^']*)'|"(?:[^"]*)")\s*\}/g;

  const out = src.replace(pattern, (match, slot, name, descriptor, implementedBy) => {
    const descRaw = descriptor.slice(1, -1);
    const arity   = arityFromDescriptor(descRaw);
    return `{ slot: ${slot}, methodName: ${name}, arity: ${arity}, descriptor: ${descriptor}, implementedBy: ${implementedBy} }`;
  });

  const changed = out !== src;
  if (changed) {
    fs.writeFileSync(fp, out);
    console.log('patched', file);
  } else {
    console.log('no change', file);
  }
}
