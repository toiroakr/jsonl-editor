const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
	name: 'esbuild-problem-matcher',

	setup(build) {
		build.onStart(() => {
			console.log('[watch] build started');
		});
		build.onEnd((result) => {
			result.errors.forEach(({ text, location }) => {
				console.error(`✘ [ERROR] ${text}`);
				console.error(`    ${location.file}:${location.line}:${location.column}:`);
			});
			console.log('[watch] build finished');
		});
	},
};

/**
 * @type {import('esbuild').Plugin}
 */
const templateHtmlSrcPath = path.join(__dirname, 'src', 'preview-template.html');
const templateHtmlDestPath = path.join(__dirname, 'dist', 'preview-template.html');
const copyHtmlPlugin = {
	name: 'copy-html',
	setup(build) {
  		build.onEnd(() => {
			// Ensure dist directory exists
			if (!fs.existsSync(path.dirname(templateHtmlDestPath))) {
				fs.mkdirSync(path.dirname(templateHtmlDestPath), { recursive: true });
			}
			// Copy HTML file
			fs.copyFileSync(templateHtmlSrcPath, templateHtmlDestPath);
		});
	},
};

async function main() {
	const ctx = await esbuild.context({
		entryPoints: [
			'src/extension.ts'
		],
		bundle: true,
		format: 'cjs',
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		platform: 'node',
		outfile: 'dist/extension.js',
		external: ['vscode'],
		logLevel: 'silent',
		plugins: [
			copyHtmlPlugin,
			/* add to the end of plugins array */
			esbuildProblemMatcherPlugin,
		],
	});
	if (watch) {
		await ctx.watch();

		fs.watch(templateHtmlSrcPath, async (eventType) => {
			if (eventType === 'change') {
				await ctx.rebuild();
			}
		});
	} else {
		await ctx.rebuild();
		await ctx.dispose();
	}
}

main().catch(e => {
	console.error(e);
	process.exit(1);
});
