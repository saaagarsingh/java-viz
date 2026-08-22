import { parseJava } from './parser.js';

const src = `
class T {
  static void main() {
    int x = 0;
    x++;
    int y = ++x;
    System.out.println("x=" + x + " y=" + y);
  }
}
`;
const ast = parseJava(src);
const main = ast.classes[0]!.methods[0]!;
console.log('statements:');
main.body!.forEach((s, i) => {
  console.log(`  [${i}]`, JSON.stringify(s));
});
