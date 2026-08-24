import { runJava } from '../languages/java/index.js';
import type { Step } from '../types.js';

const source = `class Main {
  static void main() {
    int[] numbers = {10, 20, 30, 40, 50};
    numbers[1] = 25;
    int second = numbers[1];
    int len = numbers.length;
    
    int sum = 0;
    for (int n : numbers) {
      sum = sum + n;
    }
    
    System.out.println("second=" + second);
    System.out.println("sum=" + sum);
  }
}
`;

const result = runJava(source);
if (result.error) {
  throw new Error(`Phase 5 arrays trace failed: ${JSON.stringify(result.error)}`);
}

export const arraysAndEnhancedFor: Step[] = result.steps;
