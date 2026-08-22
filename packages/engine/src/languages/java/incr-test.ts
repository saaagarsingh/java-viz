import { parseJava } from './parser.js';
import { JavaInterpreter } from './interpreter.js';

const src = `
class T {
  static void main() {
    int x = 0;
    x++;
    System.out.println("after x++: x=" + x);
    x++;
    System.out.println("after x++: x=" + x);
    int y = ++x;
    System.out.println("after y=++x: x=" + x + " y=" + y);
    int z = x++;
    System.out.println("after z=x++: x=" + x + " z=" + z);
  }
}
`;

const r = new JavaInterpreter().interpret(parseJava(src));
const out = r.steps[r.steps.length - 1]?.stdout ?? [];
console.log(out.join('\n'));
if (r.error) console.error('ERROR:', r.error);
