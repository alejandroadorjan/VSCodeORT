/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const repoRoot = path.resolve(__dirname, '..');

const env = {
	...process.env,
	NODE_OPTIONS: '--max-old-space-size=16384',
	CHILD_CONCURRENCY: '1'
};

function parseVersion(version) {

	return version.replace(/^v/, '')
					.trim()
					.split('.')
					.map(Number);
}

function compareVersions(current, required) {

	const currentParts = parseVersion(current);
	const requiredParts = parseVersion(required);

	const max = Math.max(currentParts.length, requiredParts.length);

	for (let i = 0; i < max; i++) {

		const c = currentParts[i] || 0;
		const r = requiredParts[i] || 0;

		if (c > r) {
			return 1;
		}

		if (c < r) {
			return -1;
		}
	}

	return 0;
}

function validateNodeVersion() {

	const nvmrcPath = path.join(repoRoot, '.nvmrc');

	if (!fs.existsSync(nvmrcPath)) {

		console.warn('.nvmrc not found, skipping Node.js validation');

		return;
	}

	const requiredVersion = fs
							.readFileSync(nvmrcPath, 'utf8')
							.trim();

	const currentVersion = process.version;

	console.log(`Required Node.js version: v${requiredVersion}`);
	console.log(`Current  Node.js version: ${currentVersion}`);

	const comparison = compareVersions(currentVersion, requiredVersion);

	if (comparison < 0) {

		console.error('\nERROR: Node.js version is too old.\n');

		console.error(`Required: >= ${requiredVersion}`);
		console.error(`Current : ${currentVersion}\n`);

		process.exit(1);
	}

	console.log('Node.js version check passed\n');
}

function run(command, args, options = {}) {

	return new Promise((resolve, reject) => {

		const child = spawn(command, args, {
			cwd: repoRoot,
			env,
			shell: true,
			stdio: 'inherit',
			...options
		});

		child.on('exit', (code) => {

			if (code === 0) {
				resolve();
			} else {
				reject(new Error(`${command} exited with code ${code}`));
			}
		});

		child.on('error', reject);
	});
}

function launchVSCode() {

	const platform = os.platform();

	console.log(`\nLaunching VS Code on ${platform}\n`);

	if (platform === 'win32') {

		spawn(
			'cmd',
			[
				'/c',
				'start',
				'"VSCode-OSS"',
				'cmd',
				'/k',
				'scripts\\code.bat'
			],
			{
				cwd: repoRoot,
				env,
				shell: true,
				detached: true,
				stdio: 'ignore'
			}
		);

	} else if (platform === 'linux') {

		spawn(
			'bash',
			['-c', './scripts/code.sh'],
			{
				cwd: repoRoot,
				env,
				detached: true,
				stdio: 'ignore'
			}
		);

	} else if (platform === 'darwin') {

		spawn(
			'bash',
			['-c', './scripts/code.sh'],
			{
				cwd: repoRoot,
				env,
				detached: true,
				stdio: 'ignore'
			}
		);

	} else {

		throw new Error(`Unsupported platform: ${platform}`);
	}
}

async function main() {

	validateNodeVersion();

	console.log('\n=== npm install ===\n');
	await run('npm', ['install']);

	console.log('\n=== npm run compile ===\n');
	await run('npm', ['run', 'compile']);

	console.log('\n=== npm run watch ===\n');
	const watchProcess = spawn('npm', ['run', 'watch'], {
		cwd: repoRoot,
		env,
		shell: true
	});

	let codeStarted = false;

	let outputBuffer = '';

	const watchReadyPattern = /\[watch-copilot\s*\]\s*\[watch:tsc\s*\].*Found 0 errors\. Watching for file changes\./i;

	const handleOutput = (data) => {

		const text = data.toString();

		process.stdout.write(text);

		outputBuffer += text;

		if (
			!codeStarted &&
			watchReadyPattern.test(outputBuffer)
		) {

			codeStarted = true;

			console.log('\nwatch ready detected\n');

			launchVSCode();
		}

		// evitar crecimiento infinito
		if (outputBuffer.length > 100000) {
			outputBuffer = outputBuffer.slice(-50000);
		}
	};

	watchProcess.stdout.on('data', handleOutput);
	watchProcess.stderr.on('data', handleOutput);

	watchProcess.on('exit', (code) => {

		console.log(`watch ends with ${code}`);

		process.exit(code ?? 0);
	});
}

main().catch(err => {

	console.error('\nERROR:\n', err);

	process.exit(1);
});