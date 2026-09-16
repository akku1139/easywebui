import * as esbuild from 'esbuild';

async function build() {
  await esbuild.build({
    entryPoints: ['src/worker/index.ts'],
    bundle: true,
    outfile: 'dist/_worker.js',
    format: 'esm',
    target: 'es2022',
    platform: 'browser',
    minify: true,
    sourcemap: false,
    external: [],
    define: {
      'process.env.NODE_ENV': '"production"',
    },
  });
  
  console.log('✓ Worker built successfully');
}

build().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
