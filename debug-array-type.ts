// Temporary debug file - can be deleted
// Used to debug array type parsing issues
// Issue: 1D arrays were being parsed as 2D (int[] showing as int[][])
// Fix: Added check in transformType to avoid double-wrapping array types
