/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// This file contains the webview runtime behavior for the dashboard.
// It was extracted from dashboard.html to keep HTML purely structural.

const hs = __healthScore__;
const sr = __successRate__;
const mttr = __mttr__;
const cfr = __changeFailureRate__;
const succ = __success__;
const fail = __failed__;
const canc = __cancelled__;
const inp = __inProgress__;
const sp = __successPercent__;
const fp = __failedPercent__;
const avgD = __avgDuration__;
const tot = __totalRuns__;

const chartLabels = __chartLabels__;
const chartSuccess = __chartSuccess__;
const chartFailed = __chartFailed__;
const chartDur = __chartDur__;
const dashboardText = __dashboardText__;

(function () {
	const isDark = document.body.classList.contains('vscode-dark') ||
		document.body.classList.contains('vscode-high-contrast');

	const cs = getComputedStyle(document.documentElement);
	const cSuccess = (cs.getPropertyValue('--dashboard-success') || '#7ec850').trim();
	const cFailed = (cs.getPropertyValue('--dashboard-failed') || '#e05c5c').trim();
	const cAmber = (cs.getPropertyValue('--dashboard-amber') || '#e0a030').trim();
	const cBlue = (cs.getPropertyValue('--dashboard-blue') || '#4f9bf5').trim();
	const cOther = (cs.getPropertyValue('--dashboard-other') || '#888888').trim();
	const cSuccessRgb = (cs.getPropertyValue('--dashboard-success-rgb') || '126,200,80').trim();
	const cBlueRgb = (cs.getPropertyValue('--dashboard-blue-rgb') || '79,155,245').trim();
	const trackLight = (cs.getPropertyValue('--dashboard-track-light') || '#e8e8e8').trim();
	const trackDark = (cs.getPropertyValue('--dashboard-track-dark') || '#333333').trim();
	const gridLight = (cs.getPropertyValue('--dashboard-grid-light') || 'rgba(0,0,0,0.05)').trim();
	const gridDark = (cs.getPropertyValue('--dashboard-grid-dark') || 'rgba(255,255,255,0.05)').trim();
	const tickLight = (cs.getPropertyValue('--dashboard-tick-light') || '#aaa').trim();
	const tickDark = (cs.getPropertyValue('--dashboard-tick-dark') || '#666').trim();

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

	const otherPct = Math.max(0, 100 - sp - fp);
	const otherEl = document.getElementById('other-pct');
	if (otherEl) {otherEl.textContent = otherPct + '%';}

	const setBar = (id, count, variantClass) => {
		const el = document.getElementById(id);
		if (el) {
			el.style.width = Math.round((count / tot) * 100) + '%';
			if (variantClass) {el.classList.add(variantClass);}
		}
	};
	setBar('bar-success', succ, 'success');
	setBar('bar-failed', fail, 'failure');
	setBar('bar-cancelled', canc, 'other');
	setBar('bar-inprogress', inp, 'inprogress');

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

	const gridColor = isDark ? gridDark : gridLight;
	const tickColor = isDark ? tickDark : tickLight;

	new Chart(document.getElementById('statusChart'), {
		type: 'bar',
		data: {
			labels: chartLabels,
			datasets: [
				{ label: dashboardText.success, data: chartSuccess, backgroundColor: cSuccess, borderRadius: 2, borderSkipped: false, stack: 'a' },
				{ label: dashboardText.failed, data: chartFailed, backgroundColor: cFailed, borderRadius: 2, borderSkipped: false, stack: 'a' }
			]
		},
		options: {
			responsive: true, maintainAspectRatio: false,
			plugins: {
				legend: { display: false }, tooltip: {
					callbacks: { label: ctx => ctx.dataset.label + ': ' + (ctx.raw ? '✓' : '–') }
				}
			},
			scales: {
				x: { stacked: true, ticks: { color: tickColor, font: { size: 10 }, autoSkip: false, maxRotation: 0 }, grid: { color: gridColor } },
				y: { stacked: true, display: false, beginAtZero: true, max: 1 }
			}
		}
	});

	new Chart(document.getElementById('durChart'), {
		type: 'line',
		data: {
			labels: chartLabels,
			datasets: [{
				label: dashboardText.durationSeconds,
				data: chartDur,
				borderColor: cBlue,
				backgroundColor: 'rgba(' + cBlueRgb + ',0.08)',
				borderWidth: 1.5,
				pointRadius: 3,
				pointBackgroundColor: cBlue,
				tension: 0.3,
				fill: true
			}]
		},
		options: {
			responsive: true, maintainAspectRatio: false,
			plugins: { legend: { display: false } },
			scales: {
				x: { ticks: { color: tickColor, font: { size: 10 }, autoSkip: false, maxRotation: 0 }, grid: { color: gridColor } },
				y: { ticks: { color: tickColor, font: { size: 10 } }, grid: { color: gridColor }, beginAtZero: true }
			}
		}
	});

	new Chart(document.getElementById('donutChart'), {
		type: 'doughnut',
		data: {
			labels: [dashboardText.success, dashboardText.failed, dashboardText.other],
			datasets: [{ data: [sp, fp, otherPct], backgroundColor: [cSuccess, cFailed, cOther], borderWidth: 0, hoverOffset: 4 }]
		},
		options: {
			responsive: true, maintainAspectRatio: false,
			cutout: '68%',
			plugins: {
				legend: { display: false },
				tooltip: { callbacks: { label: c => c.label + ': ' + c.parsed + '%' } }
			}
		}
	});

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
