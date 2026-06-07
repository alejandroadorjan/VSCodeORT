/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// This file contains the webview runtime behavior for the dashboard.
// It was extracted from dashboard.html to keep HTML purely structural.

const hs = __healthScore__;
const sr = __successRate__;
const mttr = __ciRecoveryTime__;
const cfr = __ciFailureRate__;
const succ = __success__;
const fail = __failed__;
const inp = __inProgress__;
const sp = __successPercent__;
const fp = __failedPercent__;
const ip = __inProgressPercent__;
const op = __otherPercent__;
const avgD = __avgDuration__;
const releaseFrequency = __releaseFrequency__;
const leadTimeDays = __leadTimeDays__;
const correctionRate = __postReleaseCorrectionRate__;

const dashboardText = __dashboardText__;

(function () {
	const isDark = document.body.classList.contains('vscode-dark') ||
		document.body.classList.contains('vscode-high-contrast');

	const cs = getComputedStyle(document.documentElement);
	const cSuccess = (cs.getPropertyValue('--dashboard-success') || '#7ec850').trim();
	const cFailed = (cs.getPropertyValue('--dashboard-failed') || '#e05c5c').trim();
	const cAmber = (cs.getPropertyValue('--dashboard-amber') || '#e0a030').trim();
	const cBlue = (cs.getPropertyValue('--dashboard-blue') || '#4f9bf5').trim();
	const cOther = (cs.getPropertyValue('--dashboard-other') || '#e0a030').trim();
	const trackLight = (cs.getPropertyValue('--dashboard-track-light') || '#e8e8e8').trim();
	const trackDark = (cs.getPropertyValue('--dashboard-track-dark') || '#333333').trim();

	const tsEl = document.getElementById('timestamp');
	if (tsEl) {tsEl.textContent = new Date().toLocaleTimeString();}

	if (inp > 0) {
		const pill = document.getElementById('ip-pill');
		if (pill) {pill.classList.remove('hidden');}
		const ipCount = document.getElementById('ip-count');
		if (ipCount) {ipCount.textContent = inp;}
	}

	const runsDetail = document.getElementById('runs-detail');
	if (runsDetail) {runsDetail.textContent = dashboardText.runsDetail.replace('{0}', succ).replace('{1}', fail);}

	const avgFormatted = avgD >= 60
		? `${Math.floor(avgD / 60)}m ${avgD % 60}s`
		: `${avgD}s`;
	const avgEl = document.getElementById('avg-dur-val');
	if (avgEl) {avgEl.textContent = avgFormatted;}

	const bsub = document.getElementById('build-sub');
	if (bsub) {
		if (avgD < 120) {bsub.innerHTML = `<span class="badge badge-green">${dashboardText.fast}</span>`;}
		else if (avgD < 300) {bsub.innerHTML = `<span class="badge badge-blue">${dashboardText.moderate}</span>`;}
		else {bsub.innerHTML = `<span class="badge badge-amber">${dashboardText.slow}</span>`;}
	}

	const hb = document.getElementById('health-badge');
	if (hb) {
		if (hs > 85) {hb.className = 'badge badge-green', hb.textContent = dashboardText.excellent;}
		else if (hs > 65) {hb.className = 'badge badge-amber', hb.textContent = dashboardText.fair;}
		else {hb.className = 'badge badge-red', hb.textContent = dashboardText.atRisk;}
	}

	const mb = document.getElementById('mttr-badge');
	if (mb) {
		if (mttr === 0) {mb.className = 'badge badge-blue', mb.textContent = dashboardText.noData;}
		else if (mttr < 60) {mb.className = 'badge badge-green', mb.textContent = dashboardText.elite;}
		else if (mttr < 120) {mb.className = 'badge badge-blue', mb.textContent = dashboardText.high;}
		else {mb.className = 'badge badge-amber', mb.textContent = dashboardText.medium;}
	}

	const cb = document.getElementById('cfr-badge');
	if (cb) {
		if (cfr < 5) {cb.className = 'badge badge-green', cb.textContent = dashboardText.elite;}
		else if (cfr < 15) {cb.className = 'badge badge-blue', cb.textContent = dashboardText.high;}
		else {cb.className = 'badge badge-amber', cb.textContent = dashboardText.medium;}
	}

	setReleaseBadge(document.getElementById('release-frequency-badge'), releaseFrequency, [
		{ limit: 1, className: 'badge badge-green', label: dashboardText.elite },
		{ limit: 0.5, className: 'badge badge-blue', label: dashboardText.high },
		{ limit: 0.1, className: 'badge badge-amber', label: dashboardText.medium },
	], dashboardText.low, true);
	setReleaseBadge(document.getElementById('lead-time-badge'), leadTimeDays, [
		{ limit: 1, className: 'badge badge-green', label: dashboardText.elite },
		{ limit: 7, className: 'badge badge-blue', label: dashboardText.high },
		{ limit: 30, className: 'badge badge-amber', label: dashboardText.medium },
	], dashboardText.low, false);
	setReleaseBadge(document.getElementById('correction-rate-badge'), correctionRate, [
		{ limit: 5, className: 'badge badge-green', label: dashboardText.elite },
		{ limit: 15, className: 'badge badge-blue', label: dashboardText.high },
		{ limit: 30, className: 'badge badge-amber', label: dashboardText.medium },
	], dashboardText.low, false);
	setupRunInsightsPagination();
	setupWorkflowFailureToggles();

	setOutcomeVisuals([sp, fp, op, ip], [cSuccess, cFailed, cOther, cBlue]);

	// set success progress fill
	const pf = document.querySelector('.progress-fill'); if (pf) {pf.style.width = sr + '%';}

	const gc = document.getElementById('gauge');
	if (gc && gc.getContext) {
		const gctx = gc.getContext('2d');
		const gaugeColor = hs > 85 ? cSuccess : hs > 65 ? cAmber : cFailed;
		const trackColor = isDark ? trackDark : trackLight;
		gctx.clearRect(0, 0, 180, 100);
		gctx.beginPath(); gctx.arc(90, 95, 68, Math.PI, 2 * Math.PI);
		gctx.strokeStyle = trackColor; gctx.lineWidth = 14; gctx.stroke();
		gctx.beginPath(); gctx.arc(90, 95, 68, Math.PI, Math.PI + (hs / 100) * Math.PI);
		gctx.strokeStyle = gaugeColor; gctx.lineWidth = 14; gctx.lineCap = 'round'; gctx.stroke();
	}

	const ul = document.getElementById('issueList');
	if (ul) {
		ul.querySelectorAll('li').forEach(li => {
			if (li.classList.contains('no-data')) {return;}
			li.classList.add('issue-list-item');
			const title = li.querySelector('.issue-title');
			const right = li.querySelector('.issue-right');
			if (title) {title.classList.add('issue-title');}
			if (right) {right.classList.add('issue-right');}
		});
	}
})();

function setReleaseBadge(element, value, tiers, fallbackLabel, higherIsBetter) {
	if (!element) {
		return;
	}

	for (const tier of tiers) {
		if ((higherIsBetter && value >= tier.limit) || (!higherIsBetter && value <= tier.limit)) {
			element.className = tier.className;
			element.textContent = tier.label;
			return;
		}
	}

	element.className = 'badge badge-red';
	element.textContent = fallbackLabel;
}

function setupRunInsightsPagination() {
	const pager = document.getElementById('runInsightsPager');
	const previousButton = document.getElementById('runInsightsPrev');
	const nextButton = document.getElementById('runInsightsNext');
	const status = document.getElementById('runInsightsPageStatus');
	if (!pager || !previousButton || !nextButton || !status) {
		return;
	}

	const pageCount = Number(pager.dataset.pageCount || '1');
	let currentPage = 0;

	const updatePage = () => {
		document.querySelectorAll('.run-insight[data-page]').forEach(item => {
			item.classList.toggle('hidden', Number(item.getAttribute('data-page')) !== currentPage);
		});
		previousButton.disabled = currentPage === 0;
		nextButton.disabled = currentPage >= pageCount - 1;
		status.textContent = `${currentPage + 1} / ${pageCount}`;
	};

	previousButton.addEventListener('click', () => {
		currentPage = Math.max(0, currentPage - 1);
		updatePage();
	});
	nextButton.addEventListener('click', () => {
		currentPage = Math.min(pageCount - 1, currentPage + 1);
		updatePage();
	});
	updatePage();
}

function setupWorkflowFailureToggles() {
	document.querySelectorAll('.workflow-failure-toggle').forEach(button => {
		button.addEventListener('click', () => {
			const detailsId = button.getAttribute('aria-controls');
			const details = detailsId ? document.getElementById(detailsId) : null;
			if (!details) {
				return;
			}

			const expanded = button.getAttribute('aria-expanded') === 'true';
			details.classList.toggle('hidden', expanded);
			button.setAttribute('aria-expanded', String(!expanded));
			button.textContent = expanded ? button.dataset.collapsed : button.dataset.expanded;
		});
	});
}

function setOutcomeVisuals(values, colors) {
	const percentIds = ['success-pct', 'failed-pct', 'other-pct', 'inprogress-pct'];
	const segmentIds = ['outcome-success', 'outcome-failed', 'outcome-other', 'outcome-inprogress'];
	const labels = [dashboardText.success, dashboardText.failed, dashboardText.other, dashboardText.inProgress];

	for (let index = 0; index < values.length; index++) {
		const percentEl = document.getElementById(percentIds[index]);
		if (percentEl) {
			percentEl.textContent = values[index] + '%';
		}

		const segmentEl = document.getElementById(segmentIds[index]);
		if (segmentEl) {
			segmentEl.style.width = values[index] + '%';
			segmentEl.title = labels[index] + ': ' + values[index] + '%';
		}
	}

	const canvas = document.getElementById('donutChart');
	if (canvas) {
		canvas.setAttribute('aria-label', labels.map((label, index) => label + ' ' + values[index] + '%').join(', '));
	}
	drawDonutFallback(canvas, values, colors);
}

function drawDonutFallback(canvas, values, colors) {
	if (!canvas || !canvas.getContext) {
		return;
	}

	const context = canvas.getContext('2d');
	const size = Math.min(canvas.clientWidth || 150, canvas.clientHeight || 150);
	const scale = window.devicePixelRatio || 1;
	canvas.width = Math.max(1, Math.round(size * scale));
	canvas.height = Math.max(1, Math.round(size * scale));
	context.scale(scale, scale);

	const center = size / 2;
	const radius = Math.max(0, (size / 2) - 8);
	const lineWidth = Math.max(10, radius * 0.32);
	let startAngle = -Math.PI / 2;

	for (let index = 0; index < values.length; index++) {
		const value = values[index];
		if (value <= 0) {
			continue;
		}

		const endAngle = startAngle + ((value / 100) * Math.PI * 2);
		context.beginPath();
		context.arc(center, center, radius, startAngle, endAngle);
		context.strokeStyle = colors[index];
		context.lineWidth = lineWidth;
		context.lineCap = 'butt';
		context.stroke();
		startAngle = endAngle;
	}
}
