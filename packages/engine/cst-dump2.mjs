import { parse } from 'java-parser';

const src = `class T { static void main() { int x = 0; int y = ++x; } }`;

function findAll(n, target, acc=[]) {
  if (n?.name === target) acc.push(n);
  for (const arr of Object.values(n?.children ?? {})) for (const c of arr) findAll(c, target, acc);
  return acc;
}
function show(n, depth=0) {
  if (!n) return;
  const pad = '  '.repeat(depth);
  if (n.image !== undefined) { process.stdout.write(pad + JSON.stringify(n.image) + ' [' + (n.tokenType?.name ?? '') + ']\n'); return; }
  if (n.name) process.stdout.write(pad + n.name + '\n');
  for (const [k, arr] of Object.entries(n.children ?? {})) {
    if (arr.length) { process.stdout.write(pad + ' .' + k + ':\n'); arr.forEach(c => show(c, depth+2)); }
  }
}

const vis = findAll(parse(src), 'variableInitializer');
console.log('variableInitializer for y=++x:');
show(vis[1] ?? vis[0]);
