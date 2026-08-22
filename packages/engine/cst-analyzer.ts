import { parse } from 'java-parser';
import * as fs from 'fs';

const src = fs.readFileSync('./src/languages/java/phase2-test-source.java', 'utf-8');

console.log('===== PARSING PHASE 2 TEST PROGRAM =====\n');

try {
  const cst = parse(src);
  
  // Helper to dump CST recursively
  function dumpNode(n: any, depth = 0, maxDepth = 6): string {
    if (depth > maxDepth) return '...';
    
    const indent = '  '.repeat(depth);
    let result = '';
    
    if (n?.name) {
      const childKeys = Object.keys(n.children ?? {})
        .filter(k => (n.children[k] as any[]).length > 0)
        .sort();
      result += indent + `📦 ${n.name}`;
      if (childKeys.length) result += ` { ${childKeys.join(', ')} }`;
      result += '\n';
      
      for (const key of childKeys) {
        (n.children[key] as any[]).forEach((c: any, i: number) => {
          result += indent + `  [${key}#${i}]:\n`;
          result += dumpNode(c, depth + 2, maxDepth);
        });
      }
    } else if (n?.image !== undefined) {
      result += indent + `🔤 TOKEN(${n.tokenType?.name ?? '?'}): "${n.image}"\n`;
    }
    
    return result;
  }
  
  // Find specific constructs
  function find(n: any, name: string): any[] {
    if (!n) return [];
    const results: any[] = [];
    if (n.name === name) results.push(n);
    for (const children of Object.values(n.children ?? {})) {
      for (const c of (children as any[])) results.push(...find(c, name));
    }
    return results;
  }
  
  // === SYNCHRONIZED METHODS ===
  console.log('\n\n========== SYNCHRONIZED METHOD ==========\n');
  const methods = find(cst, 'methodDeclaration');
  const syncMethods = methods.filter((m: any) => {
    const mods = m.children?.methodModifier ?? [];
    return mods.some((mod: any) => mod.children?.Synchronized);
  });
  
  if (syncMethods.length > 0) {
    console.log(`Found ${syncMethods.length} synchronized method(s):\n`);
    syncMethods.forEach((m: any, i: number) => {
      console.log(`--- Synchronized Method #${i} ---`);
      console.log(dumpNode(m, 0, 4));
      console.log();
    });
  }
  
  // === VOLATILE FIELDS ===
  console.log('\n\n========== VOLATILE FIELD ==========\n');
  const fields = find(cst, 'fieldDeclaration');
  const volFields = fields.filter((f: any) => {
    const mods = f.children?.fieldModifier ?? [];
    return mods.some((mod: any) => mod.children?.Volatile);
  });
  
  if (volFields.length > 0) {
    console.log(`Found ${volFields.length} volatile field(s):\n`);
    volFields.forEach((f: any, i: number) => {
      console.log(`--- Volatile Field #${i} ---`);
      console.log(dumpNode(f, 0, 3));
      console.log();
    });
  }
  
  // === SYNCHRONIZED STATEMENTS (blocks) ===
  console.log('\n\n========== SYNCHRONIZED BLOCK/STATEMENT ==========\n');
  const stmts = find(cst, 'statement');
  const syncStmts = stmts.filter((s: any) => {
    const childKeys = Object.keys(s.children ?? {});
    return childKeys.includes('Synchronized');
  });
  
  if (syncStmts.length > 0) {
    console.log(`Found ${syncStmts.length} synchronized statement(s):\n`);
    syncStmts.forEach((s: any, i: number) => {
      console.log(`--- Synchronized Statement #${i} ---`);
      console.log(dumpNode(s, 0, 4));
      console.log();
    });
  } else {
    console.log('No synchronized statements found (try checking synchronizedStatement rule)\n');
    
    // Try alternate rules
    const allStmts = find(cst, 'synchronizedStatement');
    if (allStmts.length > 0) {
      console.log(`Found synchronizedStatement nodes:\n`);
      allStmts.forEach((s: any, i: number) => {
        console.log(`--- Synchronized Statement #${i} ---`);
        console.log(dumpNode(s, 0, 4));
        console.log();
      });
    }
  }
  
  // === COMMENTS (for DSL thread directives) ===
  console.log('\n\n========== COMMENTS (DSL Thread Directives) ==========\n');
  console.log('Note: java-parser may not preserve comments by default.');
  console.log('You may need to enable comment preservation in parser config.\n');
  console.log('Expected DSL pattern in source:\n');
  const dslLines = src.split('\n').filter(l => l.includes('@thread'));
  dslLines.forEach(line => console.log('  ' + line));
  
  console.log('\n\n========== CST SUMMARY ==========\n');
  console.log(`Total methods found: ${methods.length}`);
  console.log(`  - Synchronized: ${syncMethods.length}`);
  console.log(`Total fields found: ${fields.length}`);
  console.log(`  - Volatile: ${volFields.length}`);
  console.log(`Total statements found: ${stmts.length}`);
  console.log(`  - Synchronized: ${syncStmts.length}`);
  
} catch (e) {
  console.error('Parse error:', e);
}
