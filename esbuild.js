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

/**
 * Copy bundled Prism.js assets from node_modules into media/prism/ so the
 * preview webview can load them locally (offline) via webview.asWebviewUri.
 *
 * @type {import('esbuild').Plugin}
 */
const prismDestDir = path.join(__dirname, 'media', 'prism');
const prismAssets = [
	{ src: path.join(__dirname, 'node_modules', 'prismjs', 'prism.js'), name: 'prism.js' },
	{ src: path.join(__dirname, 'node_modules', 'prismjs', 'components', 'prism-json.min.js'), name: 'prism-json.min.js' },
	{ src: path.join(__dirname, 'node_modules', 'prismjs', 'components', 'prism-json5.min.js'), name: 'prism-json5.min.js' },
];
const copyPrismPlugin = {
	name: 'copy-prism',
	setup(build) {
		build.onStart(() => {
			fs.mkdirSync(prismDestDir, { recursive: true });
			for (const asset of prismAssets) {
				if (!fs.existsSync(asset.src)) {
					throw new Error(`Prism asset not found: ${asset.src}. Did you run \`pnpm install\`?`);
				}
				fs.copyFileSync(asset.src, path.join(prismDestDir, asset.name));
			}
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
			copyPrismPlugin,
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
