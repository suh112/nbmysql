import { build, context } from 'esbuild';

const watch = process.argv.includes('--watch');

const options = {
    entryPoints: ['src/server.ts'],
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'cjs',
    outfile: 'dist/server.js',
    minify: !watch,
    sourcemap: watch,
    banner: { js: '(function(){"use strict";' },
    footer: { js: '})();' },
};

if (watch) {
    const ctx = await context(options);
    await ctx.watch();
    console.log('watching for changes...');
} else {
    await build(options);
    console.log('build complete -> dist/server.js');
}
