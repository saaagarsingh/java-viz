import { parse } from 'java-parser';

const ternSrc = `class T { static void main() { int x=10; int y=20; int z = (x > y) ? x : y; } }`;
const instSrc = `class T { static void main() { Object o = null; boolean b = o instanceof String; } }`;

function show(n, depth=0) {
  if (!n) return;
  const pad = '  '.repeat(depth);
  if (n.image !== undefined) { console.log(pad + JSON.stringify(n.image) + ' [' + (n.tokenType?.name ?? '') + ']'); return; }
  if (n.name) console.log(pad + n.name);
  for (const [k, arr] of Object.entries(n.children ?? {})) {
    if (arr.length) { console.log(pad + ' .' + k + ':'); arr.forEach(c => show(c, depth+2)); }
  }
}

function find(n, target) {
  if (n?.name === target) return n;
  for (const arr of Object.values(n?.children ?? {})) {
    for (const c of arr) {
      const r = find(c, target);
      if (r) return r;
    }
  }
}

console.log('=== conditionalExpression CST ===');
const ce = find(parse(ternSrc), 'conditionalExpression');
show(ce);

console.log('\n=== instanceof in binaryExpression CST ===');
const be = find(parse(instSrc), 'binaryExpression');
show(be);
