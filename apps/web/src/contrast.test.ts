import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it } from 'vitest';

let style: HTMLStyleElement;

beforeEach(() => {
  style = document.createElement('style');
  style.textContent = readFileSync('src/styles.css', 'utf8');
  document.head.append(style);
});
afterEach(() => { style.remove(); document.body.replaceChildren(); });

function luminance(color: string) {
  const channels = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map((value) => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrast(element: HTMLElement) {
  const foreground = luminance(getComputedStyle(element).color);
  let ancestor: HTMLElement | null = element;
  let background = 'rgb(255, 255, 255)';
  while (ancestor) {
    const color = getComputedStyle(ancestor).backgroundColor;
    if (color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent') { background = color; break; }
    ancestor = ancestor.parentElement;
  }
  const backdrop = luminance(background);
  return (Math.max(foreground, backdrop) + 0.05) / (Math.min(foreground, backdrop) + 0.05);
}

it.each([
  ['result headings', 'result-columns', 'main'],
  ['timestamp ruler', 'time-ruler', 'player'],
  ['recording metadata', 'recording-meta', 'sidebar'],
  ['section labels', 'section-label', 'player'],
  ['window duration', 'window-duration', 'selected'],
  ['result limitations', 'result-notes', 'main'],
  ['footer', 'workbench-footer', 'main'],
  ['recording count', 'count', 'sidebar'],
  ['upload limits', 'upload-limit', 'sidebar'],
  ['empty recording list', 'rail-empty', 'sidebar'],
  ['model identity', 'model-id', 'sidebar'],
  ['model loading status', 'model-loaded', 'sidebar'],
  ['session label', 'local-tag', 'sidebar'],
  ['breadcrumb', 'breadcrumb', 'main'],
  ['active recording metadata', 'metadata', 'main'],
  ['transport status', 'transport-state', 'player'],
  ['empty transport', 'empty-transport', 'player'],
  ['match rank', 'rank', 'selected'],
  ['empty results', 'results-empty', 'main'],
  ['waveform fallback status', 'wave-fallback', 'player'],
])('keeps %s at normal-text contrast of at least 4.5:1', (_, className, parentClass) => {
  const parent = document.createElement('div');
  parent.className = parentClass;
  if (parentClass === 'selected') parent.style.backgroundColor = '#e9f1eb';
  const label = document.createElement('span');
  label.className = className;
  label.textContent = '00:10.0';
  parent.append(label);
  document.body.append(parent);
  expect(contrast(label)).toBeGreaterThanOrEqual(4.5);
});
