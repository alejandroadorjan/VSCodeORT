(function () {
	const vscode = acquireVsCodeApi();

	// ---- Open file on click ----
	document.querySelectorAll('.file-name').forEach(el => {
		el.style.cursor = 'pointer';
		el.addEventListener('click', () => {
			const filename = el.getAttribute('title');
			if (filename) {
				vscode.postMessage({ type: 'openFile', filename });
			}
		});
	});

	// ---- Signal info tooltips ----
	document.querySelectorAll('.signal-info-btn').forEach(btn => {
		btn.addEventListener('click', e => {
			e.stopPropagation();
			const signalId = btn.getAttribute('data-signal');
			document.getElementById('tooltip-' + signalId)?.classList.toggle('visible');
		});
	});
	document.addEventListener('click', e => {
		if (!e.target.closest('.signal-tooltip') && !e.target.closest('.signal-info-btn')) {
			document.querySelectorAll('.signal-tooltip.visible').forEach(t => t.classList.remove('visible'));
		}
	});

	// ---- Settings panel ----
	const config = window.__config;
	if (!config) { return; }

	const pathRowsContainer = document.getElementById('path-score-rows');
	const addPathBtn = document.getElementById('add-path-btn');
	const saveBtn = document.getElementById('save-settings-btn');
	const feedback = document.getElementById('save-feedback');

	if (!pathRowsContainer || !addPathBtn || !saveBtn || !feedback) { return; }

	// Build initial path score rows from current config
	function createPathRow(pattern, score) {
		const row = document.createElement('div');
		row.className = 'path-score-row';
		row.innerHTML = `
			<input type="text" class="path-input" placeholder="src/vs/workbench/" value="${escAttr(pattern)}">
			<input type="number" class="score-input" min="0" max="10" value="${Number(score)}">
			<button type="button" class="path-delete-btn" title="Remove">×</button>
		`;
		row.querySelector('.path-delete-btn').addEventListener('click', () => row.remove());
		return row;
	}

	// Populate existing entries
	for (const [pattern, score] of Object.entries(config.pathScores || {})) {
		pathRowsContainer.appendChild(createPathRow(pattern, score));
	}

	addPathBtn.addEventListener('click', () => {
		const row = createPathRow('', 1);
		pathRowsContainer.appendChild(row);
		row.querySelector('.path-input').focus();
	});

	// Populate simple fields
	document.getElementById('lines-minor').value = config.lines?.minor ?? 200;
	document.getElementById('lines-major').value = config.lines?.major ?? 500;
	document.getElementById('threshold-medium').value = config.thresholds?.medium ?? 3;
	document.getElementById('threshold-high').value = config.thresholds?.high ?? 5;
	document.getElementById('label-low').value = config.labels?.low ?? 'risk:low';
	document.getElementById('label-medium').value = config.labels?.medium ?? 'risk:medium';
	document.getElementById('label-high').value = config.labels?.high ?? 'risk:high';

	// Save
	saveBtn.addEventListener('click', () => {
		// Collect path scores
		const pathScores = {};
		pathRowsContainer.querySelectorAll('.path-score-row').forEach(row => {
			const pattern = row.querySelector('.path-input').value.trim();
			const score = parseInt(row.querySelector('.score-input').value, 10);
			if (pattern) {
				pathScores[pattern] = isNaN(score) ? 0 : score;
			}
		});

		const newConfig = {
			pathScores,
			lines: {
				minor: parseInt(document.getElementById('lines-minor').value, 10) || 200,
				major: parseInt(document.getElementById('lines-major').value, 10) || 500,
			},
			thresholds: {
				medium: parseInt(document.getElementById('threshold-medium').value, 10) || 3,
				high: parseInt(document.getElementById('threshold-high').value, 10) || 5,
			},
			labels: {
				low: document.getElementById('label-low').value.trim() || 'risk:low',
				medium: document.getElementById('label-medium').value.trim() || 'risk:medium',
				high: document.getElementById('label-high').value.trim() || 'risk:high',
			},
		};

		vscode.postMessage({ type: 'saveSettings', config: newConfig });

		feedback.textContent = 'Saved. Re-analyzing...';
		feedback.className = 'save-feedback saved';
		setTimeout(() => { feedback.textContent = ''; feedback.className = 'save-feedback'; }, 3000);
	});

	function escAttr(str) {
		return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	}
}());
