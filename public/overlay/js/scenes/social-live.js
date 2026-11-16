// Social · Live now (story only). SUPER CUP style (spec 5.7): LIVE NOW, round line, duel, Watch live CTA.
// The band y ~1240-1350 stays free for the Instagram link sticker. Classic style keeps a simple fallback.
import { h, fit, teamLogo } from '../ui.js';
import { socialBase, socialHeader, socialFooter, isSupercup, sxRoot, sxHeader, sxMain, sxPlate, sxVs, sxCast, sxTag, sxItem, sxRoundName, sxBestOf, sxJoin, sxSponsors, sxTwitch, matchRef, teamRef } from './social-common.js';

function supercup(data, ctx) {
  const item = sxItem(data) ?? {};
  const side = (team, key) => h('div', { class: `sx-team ${key}`, 'data-ref': teamRef(team) }, sxPlate(team, 290, ctx, { side: key }), h('div', { class: 'sx-tagbig fit' }, sxTag(team)));
  const context = sxJoin(item.round?.title || sxRoundName(item.round?.name), sxBestOf(item.bestOf));
  return sxRoot(data, ctx, 'sx-live-now', { 'data-ref': matchRef(item) },
    sxHeader(data, { size: 'compact' }),
    sxMain(ctx,
      h('div', { class: 'sx-live' }, h('span', { class: 'sx-live-dot' }), h('div', { class: 'sx-live-w' }, h('span', { class: 'sx-live-a' }, 'LIVE'), h('span', { class: 'sx-live-b' }, 'NOW'))),
      context ? h('div', { class: 'sx-ctx fit' }, context) : null,
      h('div', { class: 'sx-duel' }, side(item.teamA, 'a'),
        h('div', { class: 'sx-center sx-vswrap' }, sxVs(108), h('div', { class: 'sx-live-cast' }, sxCast(item.cast))),
        side(item.teamB, 'b'))),
    h('footer', { class: 'sx-foot is-live' },
      h('div', { class: 'sx-cta' }, h('div', { class: 'sx-cta-label' }, 'WATCH LIVE ON'), sxTwitch(data, 'is-cta')),
      sxSponsors(data)));
}

export default {
  render(data, ctx) {
    if (isSupercup(data)) return supercup(data, ctx);
    const item = data.item ?? {};
    return h('div', { class: 'social social-live', 'data-ref': item.id ? `match:${item.id}` : null },
      ...socialBase(data, ctx), socialHeader(data, 'LIVE', 'LIVE NOW'),
      h('div', { class: 'so-versus-teams' },
        h('div', { class: 'so-versus-team', 'data-ref': item.teamA?.id ? `team:${item.teamA.id}` : null }, teamLogo(item.teamA, 'so-versus-logo'), fit('so-versus-team-name', item.teamA?.name || 'TBD')),
        h('div', { class: 'so-versus-divider' }),
        h('div', { class: 'so-versus-team', 'data-ref': item.teamB?.id ? `team:${item.teamB.id}` : null }, teamLogo(item.teamB, 'so-versus-logo'), fit('so-versus-team-name', item.teamB?.name || 'TBD'))),
      data.next ? h('div', { class: 'so-live-next' }, fit('so-live-next-text', `NEXT · ${data.next.teamA?.tag ?? 'TBD'} VS ${data.next.teamB?.tag ?? 'TBD'}`)) : null,
      socialFooter(data));
  },
};
