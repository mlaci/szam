import resolve from "@rollup/plugin-node-resolve"
import typescript from "@rollup/plugin-typescript"
export default [
  {
    input: 'src/worker.ts',
    output: {
      file: 'docs/worker-bundle.js',
      format: 'esm',
      sourcemap: true
    },
    plugins: [resolve(), typescript()]
  },
  {
    input: 'src/main.ts',
    output: {
      file: 'docs/main-bundle.js',
      format: 'esm',
      sourcemap: true
    },
    plugins: [resolve(), typescript()]
  }
]