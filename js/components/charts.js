const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
  return node;
}

export function ringChart(pct, { size = 92, stroke = 10, label = '' } = {}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, pct));
  const offset = circumference * (1 - clamped / 100);

  const svg = svgEl('svg', { width: size, height: size, viewBox: `0 0 ${size} ${size}`, class: 'ring-chart' });

  const track = svgEl('circle', {
    cx: size / 2, cy: size / 2, r: radius, fill: 'none', stroke: 'var(--ring-track)', 'stroke-width': stroke,
  });
  const progress = svgEl('circle', {
    cx: size / 2,
    cy: size / 2,
    r: radius,
    fill: 'none',
    stroke: 'var(--ring-progress)',
    'stroke-width': stroke,
    'stroke-linecap': 'round',
    'stroke-dasharray': circumference,
    'stroke-dashoffset': offset,
    transform: `rotate(-90 ${size / 2} ${size / 2})`,
  });

  svg.appendChild(track);
  svg.appendChild(progress);

  const text = svgEl('text', {
    x: '50%', y: '50%', 'text-anchor': 'middle', dy: '0.35em', class: 'ring-chart-label',
  });
  text.textContent = label || `${clamped}%`;
  svg.appendChild(text);

  return svg;
}

export function barChart(data, { height = 80, gap = 6, max } = {}) {
  const ceiling = max || Math.max(1, ...data.map((d) => d.value));
  const wrap = document.createElement('div');
  wrap.className = 'bar-chart';
  wrap.style.height = `${height}px`;

  data.forEach((d) => {
    const col = document.createElement('div');
    col.className = 'bar-chart-col';
    col.style.marginRight = `${gap}px`;

    const bar = document.createElement('div');
    bar.className = 'bar-chart-bar';
    const pct = Math.max(2, Math.round((d.value / ceiling) * 100));
    bar.style.height = `${pct}%`;
    if (d.highlight) bar.classList.add('is-today');

    const labelEl = document.createElement('span');
    labelEl.className = 'bar-chart-label';
    labelEl.textContent = d.label;

    col.appendChild(bar);
    col.appendChild(labelEl);
    wrap.appendChild(col);
  });

  return wrap;
}

export function sparkline(values, { width = 160, height = 40, pad = 4 } = {}) {
  const svg = svgEl('svg', { width, height, viewBox: `0 0 ${width} ${height}`, class: 'sparkline' });
  if (!values.length) return svg;

  const max = Math.max(1, ...values);
  const stepX = (width - pad * 2) / Math.max(1, values.length - 1);
  const points = values.map((v, i) => {
    const x = pad + i * stepX;
    const y = height - pad - (v / max) * (height - pad * 2);
    return `${x},${y}`;
  });

  const line = svgEl('polyline', {
    points: points.join(' '), fill: 'none', stroke: 'var(--ring-progress)', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
  });
  svg.appendChild(line);
  return svg;
}
