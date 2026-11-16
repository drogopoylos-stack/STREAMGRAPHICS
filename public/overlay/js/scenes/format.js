import { h, fit, plate } from '../ui.js';
import { sceneHeader, leagueLine } from './common.js';

export default {
  render(data, ctx) {
    const format = data.format;
    const stages = format?.stages || [];
    return h('div', { class: 'format-screen' }, plate(data.theme, 'main', ctx),
      sceneHeader({ league: data.league, kicker: leagueLine(data.league), title: 'How It Works', sub: format?.subtitle || 'Tournament format to be announced' }),
      h('div', { class: 'brk-rule rule' }),
      h('div', { class: 'format-stages', style: { '--format-cols': Math.max(1, stages.length) } }, stages.map((stage, i) => h('section', { class: 'format-stage', in: 'up', d: 320 + i * 100 },
        h('span', { class: 'format-step' }, String(i + 1).padStart(2, '0')),
        fit('format-name display', stage.name, { 'data-lines': 2 }),
        fit('format-headline display', stage.headline),
        h('div', { class: 'format-points' }, (stage.lines || []).map(line => h('p', {}, line))),
        i < stages.length - 1 ? h('span', { class: 'format-arrow' }, '›') : null))),
      format?.footer ? h('div', { class: 'format-footer' }, format.footer) : null);
  },
};
