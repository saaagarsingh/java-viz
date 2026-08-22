#!/usr/bin/env node
/**
 * Fix all trace files to add Phase 2 fields
 * - Add threadId to StackFrame objects
 * - Add markWord and monitor to HeapObject objects
 * - Add activeThreadId and threadStates to Step objects
 */

const fs = require('fs');
const path = require('path');

const tracesDir = path.join(__dirname, 'packages', 'engine', 'src', 'traces');

// Find all trace files except index.ts
const traceFiles = fs.readdirSync(tracesDir)
  .filter(f => f.endsWith('.ts') && f !== 'index.ts')
  .map(f => path.join(tracesDir, f));

console.log(`Found ${traceFiles.length} trace files to fix`);

traceFiles.forEach(file => {
  let content = fs.readFileSync(file, 'utf-8');
  const originalContent = content;

  // Fix 1: Add threadId to StackFrame objects that don't have it
  // Only if there's operandStack but no threadId before it
  content = content.replace(
    /(\s+)operandStack:\s*\[\],(\s+?)}/g,
    (match, indent, nextIndent) => {
      if (match.includes('threadId:')) return match; // Already has threadId
      return `${indent}threadId: 'main',\n${indent}operandStack: [],${nextIndent}}`;
    }
  );

  // Fix 2: Add threadId to StackFrame objects with non-empty operandStack
  content = content.replace(
    /(\s+)operandStack:\s*\[.*?\],(\s+?)}/gs,
    (match, indent) => {
      if (match.includes('threadId:')) return match; // Already has threadId
      return match.replace('operandStack:', `threadId: 'main',\n${indent}operandStack:`);
    }
  );

  // Fix 3: Add markWord and monitor to HeapObject objects
  content = content.replace(
    /(\s+)fields:\s*\[(\s*(?:\{[^}]*\}\s*,)*\s*(?:\{[^}]*\})?)\s*\],(\s*[}\]])/g,
    `$1fields: [$2],\n$1markWord: 'unlocked' as const,\n$1monitor: null,$3`
  );

  // Fix 4: Add activeThreadId and threadStates to Step objects
  content = content.replace(
    /(\s+)stdout:\s*\[\],(\s*}\s*,?)/g,
    `$1stdout: [],\n$1activeThreadId: 'main',\n$1threadStates: new Map([['main', 'RUNNABLE']]),$2`
  );

  if (content !== originalContent) {
    fs.writeFileSync(file, content, 'utf-8');
    console.log(`✓ Updated ${path.basename(file)}`);
  } else {
    console.log(`- No changes needed for ${path.basename(file)}`);
  }
});

console.log('Done!');

