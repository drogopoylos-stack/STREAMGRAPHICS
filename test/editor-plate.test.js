import test from 'node:test';
import assert from 'node:assert/strict';
import { plate, teamLogo, crest, playerPhoto, leagueLogo, sponsorStrip } from '../public/overlay/js/ui.js';

// A recording document checks the DOM contract without a browser or graphics driver.
function documentFor(t) {
  const previous = globalThis.document;
  globalThis.document = { createElement(tag) {
    const el = { tag, nodeType: 1, children: [], attrs: {}, dataset: {}, className: '',
      style: { setProperty(key, value) { this[key] = value; } },
      append(...children) { this.children.push(...children); },
      setAttribute(key, value) { this.attrs[key] = value; }, addEventListener() {} };
    el.classList = { toggle(name, on) { if (on) el.className += ` ${name}`; }, add(name) { el.className += ` ${name}`; } };
    return el;
  } };
  t.after(() => { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; });
}
test('plate off creates no DOM and None retains exactly the original two layers', t => {
  documentFor(t);
  assert.equal(plate({}, 'main', { bg: false, bgMotion: 'embers' }), null);
  const el = plate({}, 'main', { bg: true, bgMotion: 'none' });
  assert.deepEqual(el.children.map(n => n.className), ['plate-img', 'plate-shade']);
  assert.deepEqual(el.dataset, { in: 'plate', d: '0', dur: '900' });
});
test('all motion styles emit the CSS contract and never put an animation on the plate', t => {
  documentFor(t); t.mock.method(Date, 'now', () => 123456789);
  for (const motion of ['drift', 'rays', 'embers']) {
    const el = plate({ preset: 'sparta' }, 'main', { bg: true, bgMotion: motion, bgSpeed: 'slow', bgIntensity: 'strong', bgForce: true });
    assert.equal(el.dataset.bga, motion); assert.equal(el.dataset.bgaLevel, 'strong');
    assert.equal(el.dataset.framed, ''); assert.match(el.className, /bga-force/);
    assert.equal(el.style['--bga-time'], '1.5'); assert.equal(el.style['--bga-k'], '1.35');
    assert.equal(el.style['--bga-t'], `${-((123456789 % 72000) / 1000).toFixed(3)}s`);
    assert.equal(el.style.animation, undefined);
    assert.equal(el.children[2].className, 'bga-fx'); assert.equal(el.children[2].attrs['aria-hidden'], 'true');
    assert.equal(el.children[2].children.length, motion === 'embers' ? 32 : 0);
    if (motion === 'embers') assert.ok(el.children[2].children.every(n => n.tag === 'i' && !n.children.length));
  }
});
test('framed motion is restricted to built-in main/social plates, and clock phases agree', t => {
  documentFor(t); t.mock.method(Date, 'now', () => 96000);
  const ctx = { bg: true, bgMotion: 'drift', bgSpeed: 'normal', bgIntensity: 'subtle' };
  assert.equal(plate({ preset: 'sparta' }, 'social', ctx).dataset.framed, '');
  assert.equal(plate({ preset: 'sparta' }, 'versus', ctx).dataset.framed, undefined);
  assert.equal(plate({ bgImage: '/media/custom.png' }, 'main', ctx).dataset.framed, undefined);
  const first = plate({}, 'main', ctx), second = plate({}, 'main', ctx);
  assert.equal(first.style['--bga-t'], second.style['--bga-t']); assert.equal(first.style['--bga-k'], '0.6');
});
test('record images carry references and the default tournament emblem has its icon slot', t => {
  documentFor(t);
  const team = { id: 't1', logo: '/team.png' }, player = { id: 'p1', photo: '/player.png' };
  assert.equal(teamLogo(team).attrs['data-ref'], 'team:t1'); assert.equal(crest(team).attrs['data-ref'], 'team:t1');
  assert.equal(playerPhoto(player).attrs['data-ref'], 'player:p1');
  assert.equal(leagueLogo({ logo: '/brand/tournament.svg' }).children[0].dataset.iconSlot, 'Emblem');
  const strip = sponsorStrip([{ id: 's1', name: 'Sponsor', logo: '/sponsor.png' }]);
  assert.equal(strip.children[1].children[0].attrs['data-ref'], 'sponsor:s1');
});
