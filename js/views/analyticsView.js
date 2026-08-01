import { formatMinutes } from '../core/dates.js';
import {
  getTrend, getCompletionRate, getSubjectPerformance, getWeakAreas,
} from '../services/analytics.js';
import { escapeHtml, delegate } from '../components/dom.js';
import { barChart } from '../components/charts.js';
import { iconMarkup } from '../components/icons.js';

const viewState = { days: 7 };

export function render(container, { state }) {
  const trend = getTrend(state, viewState.days);
  const totalMinutes = trend.reduce((sum, t) => sum + t.minutes, 0);
  const completion = getCompletionRate(state, viewState.days);
  const performance = getSubjectPerformance(state, viewState.days).filter((p) => p.sessionsTotal > 0 || p.topicsTotal > 0);
  const weakAreas = getWeakAreas(state, viewState.days);

  container.innerHTML = `
    <section class="dash-section">
      <div class="section-header">
        <h2>Study trend</h2>
        <div class="range-toggle">
          <button class="btn-chip${viewState.days === 7 ? ' active' : ''}" data-range="7">7d</button>
          <button class="btn-chip${viewState.days === 30 ? ' active' : ''}" data-range="30">30d</button>
        </div>
      </div>
      <p class="stat-number">${formatMinutes(totalMinutes)}<span class="stat-unit"> studied</span></p>
      <div id="trendChartSlot"></div>
    </section>

    <section class="dash-stats">
      <div class="stat-card">
        <div class="stat-number">${completion.pct}%</div>
        <span class="stat-caption">Completion rate</span>
      </div>
      <div class="stat-card">
        <div class="stat-number">${completion.done}/${completion.total}</div>
        <span class="stat-caption">Sessions done</span>
      </div>
    </section>

    <section class="dash-section">
      <h2>Subject performance</h2>
      ${performance.length ? `
        <div class="perf-list">
          ${performance.map((p) => `
            <div class="perf-row">
              <div class="perf-header">
                <span class="chip-dot" style="background:${p.subject.color}"></span>
                <span>${escapeHtml(p.subject.name)}</span>
                <span class="perf-pct">${p.completionPct === null ? '—' : `${p.completionPct}%`}</span>
              </div>
              <div class="perf-bar-track"><div class="perf-bar-fill" style="width:${p.completionPct || 0}%;background:${p.subject.color}"></div></div>
              <div class="perf-meta">${p.topicsMastered}/${p.topicsTotal} topics mastered${p.avgQuizScore !== null ? ` · Quiz avg ${p.avgQuizScore}%` : ''}</div>
            </div>
          `).join('')}
        </div>
      ` : '<p class="empty-state-inline">Not enough activity yet.</p>'}
    </section>

    ${weakAreas.length ? `
    <section class="dash-section">
      <h2>Weak areas</h2>
      <div class="weak-list">
        ${weakAreas.map((w) => `
          <div class="weak-row">
            ${iconMarkup('trending-down', { size: 15 })}
            <span><strong>${escapeHtml(w.name)}</strong>${escapeHtml(w.reason)}</span>
          </div>
        `).join('')}
      </div>
    </section>` : ''}
  `;

  container.querySelector('#trendChartSlot').appendChild(
    barChart(trend.map((t) => ({
      label: t.dateKey.slice(5).split('-').reverse().join('/'),
      value: t.minutes,
      highlight: t.dateKey === trend[trend.length - 1].dateKey,
    })), { height: 100 }),
  );

  delegate(container, 'click', '[data-range]', (e, t) => {
    viewState.days = Number(t.dataset.range);
    render(container, { state });
  });
}
