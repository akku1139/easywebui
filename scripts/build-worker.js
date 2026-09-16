import * as esbuild from 'esbuild';
import { writeFileSync } from 'fs';

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
  
  // Generate _routes.json for Cloudflare Pages
  // Note: Wildcard * matches any number of path segments (including slashes)
  // So /api/* will match /api/mcp-oauth/discover
  const routes = {
    version: 1,
    include: ['/api/*'],
    exclude: []
  };
  
  writeFileSync('dist/_routes.json', JSON.stringify(routes, null, 2));
  console.log('✓ _routes.json generated');
}

build().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
