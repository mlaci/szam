import resolve from "@rollup/plugin-node-resolve"
import typescript from "@rollup/plugin-typescript"
export default {
    input: 'worker.ts',
    output: {
      file: 'worker-bundle.js',
      format: 'esm',
      sourcemap: true
    },
    plugins: [resolve(), typescript()]
  };