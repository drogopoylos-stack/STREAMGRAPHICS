import { SCENE_IDS } from './scenes.js';
import { ICON_SET_IDS, ICON_SLOTS } from './icon-sets.js';

export const DESIGN_FONTS = [
  { id: 'fira-extra', name: 'Fira Sans Extra Condensed', css: '"Fira Sans Extra Condensed", sans-serif' },
  { id: 'fira', name: 'Fira Sans Condensed', css: '"Fira Sans Condensed", sans-serif' },
  { id: 'commissioner', name: 'Commissioner', css: '"Commissioner Variable", sans-serif' },
  { id: 'noto', name: 'Noto Serif Display', css: '"Noto Serif Display", Georgia, serif' },
  { id: 'arial', name: 'Arial', css: 'Arial, sans-serif' },
  { id: 'georgia', name: 'Georgia', css: 'Georgia, serif' },
];
export const FONT_ROLES = [
  { id: 'title', name: 'Headlines', example: 'STARTING SOON', hint: 'Screen titles, VS marks and main headings' },
  { id: 'body', name: 'Names & body text', example: 'Team Phoenix · Player One', hint: 'Team names, player names, descriptions and body copy' },
  { id: 'label', name: 'Labels', example: 'MATCHDAY · JUNGLE · TOP 4', hint: 'Tournament kickers, roles, captions and small labels' },
  { id: 'numbers', name: 'Scores & times', example: '18:00   2 : 1', hint: 'Scoreboards, match times and statistics' },
];
export const FRAME_STYLES = ['original', 'none', 'line', 'corners', 'double'];
export const BOX_STYLES = ['original', 'glass', 'solid', 'outline'];
export const TEXT_TOKENS = ['tournament', 'short', 'season', 'date', 'stage', 'team', 'teamA', 'teamB'];
export const BG_MOTIONS = ['none', 'drift', 'rays', 'embers'];
export const BG_SPEEDS = ['slow', 'normal', 'fast'];
export const BG_INTENSITIES = ['subtle', 'normal', 'strong'];
export const BG_DEFAULT = { show: true, motion: 'none', speed: 'normal', intensity: 'normal' };
export function resolveBackground(config, scene) { return { ...BG_DEFAULT, ...config?.backgrounds?.default, ...config?.backgrounds?.screens?.[scene] }; }
const slot = (id, label, selector, role = 'label', editable = true, example = '') => ({ id, label, selector, role, editable, example });
const header = [slot('kicker', 'Tournament / kicker', '.hdr-kicker', 'label', true, '{tournament} · {season}'), slot('title', 'Screen title', '.hdr-title', 'title'), slot('subtitle', 'Subtitle / date', '.hdr-sub', 'body')];
const names = slot('teams', 'Team names', '.wait-team,.sc-name,.vs-name,.sv-name,.sv-tag,.tv-name,.tv-tag,.r-name,.tr-tag,.so-team-name,.so-versus-team-name,.so-lineup-team-name,.so-lineup-tag,.so-roster-name,.nb-name,.mu-team,.sx-tag,.sx-tagbig,.sx-fullname,.sx-card-tag,.sx-slot-tag', 'body', false);
const players = slot('players', 'Player names', '.pc-nick,.mc-nick,.tl-nick,.so-lineup-nick,.so-player-nick,.mu-nick,.mu-ph-a,.mu-ph-b,.pc-name,.mu-name,.sx-nick', 'body', false);
const roles = slot('roles', 'Player roles', '.pc-role,.mc-role,.tl-role,.so-lineup-role,.so-player-role', 'label', false);
const scores = slot('scores', 'Scores', '.score,.nb-score,.so-fixture-vs,.sx-score,.sx-bigscore,.sx-ln-score,.sx-card-score', 'numbers', false);
const sponsors = slot('sponsors', 'Sponsor strip', '.spons', 'label', false);
// SUPER CUP social style (data.social.style === 'supercup', docs/specs/SOCIAL-SUPERCUP.md §7): editable texts with the spec defaults.
const scTexts = [slot('eventYear', 'Event year', '.sx-year', 'title', true, '2027'), slot('eventTitle', 'Event title', '.sx-title', 'title', true, 'SUPER CUP'), slot('sponsorLabel', 'Sponsor label', '.sx-sponsor-label', 'label', true, 'POWERED BY'), slot('twitch', 'Twitch link', '.sx-twitch-url', 'label', true, 'twitch.tv/HellenicLegends')];
const scCast = [slot('castLabel', 'With cast label', '.sx-cast.is-on > .sx-cast-t', 'label', true, 'W/ CAST'), slot('noCastLabel', 'No cast label', '.sx-cast.is-off > .sx-cast-t', 'label', true, 'NO CAST')];
const scRound = (title, kicker) => [slot('roundTitle', 'Round title', '.sx-round', 'title', true, title), slot('roundKicker', 'Round kicker', '.sx-kicker', 'label', true, kicker)];
const scFinal = slot('finalLabel', 'Final label', '.sx-meta-final,.sx-final,.sx-card-final', 'label', true, 'FINAL');
const scRoles = ['Top', 'Jungle', 'Mid', 'Bot', 'Support'].map(role => slot(`role${role}`, `Role label · ${role}`, `.sx-role.r-${role.toLowerCase()}`, 'label', true, role.toUpperCase()));
const socialHeader = [slot('brand', 'Tournament name', '.so-league-name', 'label', true, '{tournament}'), slot('season', 'Season', '.so-season'), slot('category', 'Category label', '.so-category'), slot('eyebrow', 'Eyebrow', '.so-eyebrow', 'label', true, 'THE STAGE IS SET'), slot('title', 'Screen title', '.so-title', 'title'), slot('footer', 'Footer caption', '.so-footer-caption'), sponsors];

// New screens can register semantic [data-design-slot] elements and/or extend this catalogue.
export const DESIGN_SLOTS = {
  waiting: [slot('brand', 'Tournament name', '.wait-cup', 'label', true, '{tournament}'), slot('title', 'Main message', '.wait-title', 'title', true, 'STARTING SOON'), slot('caption', 'Caption', '.wait-caption', 'label', true, 'THE NEXT CHAPTER BEGINS HERE'), slot('scheduleLabel', 'Today’s matches label', '.wait-schedule-label', 'label', true, 'TODAY’S MATCHES'), slot('date', 'Today’s date', '.wait-date', 'label', false), slot('matches', 'Today’s match list', '.wait-matches', 'body', false), slot('empty', 'No matches message', '.wait-empty', 'body', true, 'Match schedule to be announced'), slot('times', 'Match times', '.wait-time', 'numbers', false), names, scores],
  schedule: [...header, names, slot('times', 'Match times', '.sc-time > span:first-child', 'numbers', false), slot('stage', 'Match stage', '.sc-stage', 'label', false), slot('bestOf', 'Best-of labels', '.sc-bo', 'label', false), scores, slot('status', 'Live / final labels', '.sc-live,.sc-final', 'label', false), slot('empty', 'No matches message', '.sch-empty-t', 'title', true, 'No matches scheduled'), sponsors],
  versus: [...header, slot('stage', 'Match stage heading', '.vs-stage', 'title', true, '{stage}'), slot('meta', 'Match date / best of', '.vs-when', 'label', false), names, players, roles, scores, slot('vs', 'VS label', '.vs-disc > span,.tv-centre > span', 'title', true, 'VS'), slot('lineup', 'Lineup heading', '.vs-ltitle > span', 'label', true, 'Starting Five'), slot('records', 'Team records', '.vs-record', 'numbers', false), sponsors],
  'simple-vs': [slot('kicker', 'Tournament heading', '.sv-kicker > span', 'label', true, '{tournament}'), names, slot('vs', 'VS label', '.sv-vs', 'title', true, 'VS'), slot('meta', 'Match date / stage / best of', '.sv-when', 'label', false), slot('status', 'Match status badge', '.sv-badge', 'label', false), scores],
  roster: [...header, slot('label', 'Roster label', '.tr-label,.r-title > .kicker', 'label', true, 'TEAM ROSTER'), names, players, roles, slot('record', 'Team record', '.r-record', 'numbers', false), slot('league', 'League name', '.r-league', 'label', true, '{tournament}'), slot('roleColumn', 'Role column heading', '.tr-columns > span:first-child', 'label', true, 'ROLE'), slot('playerColumn', 'Player column heading', '.tr-columns > span:last-child', 'label', true, 'PLAYER'), slot('bench', 'Substitutes / staff', '.tl-bench,.r-bench .bench-list', 'body', false), slot('benchLabel', 'Bench heading', '.tl-bench-label,.bench-label > span', 'label', true, 'Subs & staff'), sponsors],
  matchup: [slot('kicker', 'Tournament heading', '.mu-kicker', 'label', true, '{tournament}'), slot('title', 'Matchup title', '.mu-title', 'title', true, 'Player Matchup'), names, players, slot('statistics', 'Statistics table', '.mu-rows', 'numbers', false), slot('champions', 'Top champions heading', '.mu-champs-l', 'label', true, 'Top champions'), slot('headToHead', 'Head-to-head label', '.mu-h2h-l', 'label', true, 'Head-to-head'), slot('empty', 'No detailed stats message', '.mu-nostats', 'body', true, 'Detailed stats will appear once match data is in.')],
  bracket: [...header, names, scores, slot('rounds', 'Round headings', '.nb-round-name', 'label', false), slot('meta', 'Match information', '.nb-meta,.gsl-when,.gsl-match-label', 'label', false), slot('footer', 'Footer', '.nb-footer-copy', 'label', true, '{short} · EVERY SERIES COUNTS'), slot('legend', 'Bracket legend', '.gsl-legend,.nb-footer-note', 'label', false)],
  format: [...header, slot('names', 'Stage names', '.format-name', 'title', false), slot('headlines', 'Stage headlines', '.format-headline', 'title', false), slot('points', 'Format descriptions', '.format-points', 'body', false), slot('footer', 'Footer', '.format-footer', 'label')],
  sponsors: [...header, slot('mainLabel', 'Main sponsor heading', '.sp-main-label', 'label', true, 'Main Sponsors'), slot('partnersLabel', 'Partners heading', '.sp-partners-label', 'label', true, 'Official Partners'), slot('names', 'Sponsor names', '.sp-name', 'body', false), slot('empty', 'Coming soon title', '.sp-empty-t', 'title', true, 'Coming Soon'), slot('emptyCaption', 'Coming soon caption', '.sp-empty-s', 'body', true, 'Partnership announcements')],
  'social-schedule': [...socialHeader, names, scores, slot('date', 'Date', '.so-date-text,.sx-meta-date', 'body', false), slot('timezone', 'Timezone label', '.so-timezone', 'label', true, 'LOCAL TIME'), slot('times', 'Match times', '.so-fixture-time,.sx-meta-time', 'numbers', false), slot('bestOf', 'Best-of labels', '.so-fixture-bo', 'label', false), slot('emptyTitle', 'No matches title', '.so-no-matches > strong,.sx-empty > strong', 'title', true, 'STAY TUNED.'), slot('empty', 'No matches message', '.so-no-matches > span,.sx-empty > span', 'body', true, 'No matches scheduled for this day.'),
    ...scTexts, ...scRound('SECOND ROUND', 'TOP 4 QUALIFYING · BEST OF 3'), scFinal, ...scCast],
  'social-versus': [...socialHeader, names, players, roles, slot('vs', 'VS label', '.so-versus-mark,.so-lineup-vs', 'title', true, 'VS'), slot('stage', 'Match stage', '.so-lineup-stage,.so-vs-stage', 'label', true, '{stage}'), slot('date', 'Match date', '.so-vs-date-label,.sx-ticket-dow,.sx-ticket-date', 'body', false), slot('time', 'Match time', '.so-vs-time,.sx-ticket-time', 'numbers', false),
    ...scTexts, ...scRound('SECOND ROUND', 'TOP 4 QUALIFYING · BEST OF 3'), slot('liveAtLabel', 'Live at label', '.sx-live-at', 'label', true, 'LIVE AT'), slot('broadcastLabel', 'Broadcast label', '.sx-broadcast', 'label', true, 'BROADCAST'), ...scCast],
  'social-roster': [...socialHeader, names, players, roles, ...scTexts, ...scRoles, slot('subLabel', 'Substitutes label', '.sx-sub-k', 'label', true, 'SUB'), slot('subs', 'Substitutes', '.sx-sub-v', 'body', true, '')],
  'social-result': [...socialHeader, names, scores, slot('qualification', 'Qualification band', '.so-result-band-text,.sx-band-text', 'label', true, ''),
    ...scTexts, ...scRound('SECOND ROUND', 'TOP 4 QUALIFYING · FINAL RESULT'), scFinal, slot('meta', 'Match date / best of', '.sx-sub', 'label', false)],
  'social-announce': [...socialHeader, slot('headline', 'Announcement headline', '.so-announce-title,.sx-display', 'title', true, 'QUALIFIER'), slot('kicker', 'Announcement kicker', '.so-announce-kicker,.sx-ann-kick-t', 'label', true, 'OPEN'),
    ...scTexts, slot('day', 'Day', '.sx-ann-day', 'title', true, '31'), slot('month', 'Month', '.sx-ann-month', 'title', true, 'OCTOBER'), slot('weekday', 'Weekday', '.sx-ann-dow', 'label', true, 'SATURDAY'), slot('time', 'Time', '.sx-ann-time', 'numbers', true, '11:00'), slot('info', 'Information line', '.sx-ann-info', 'label', true, 'TWO TEAMS QUALIFY FOR THE MAIN BRACKET')],
  'social-bracket': [...socialHeader, names, slot('kicker', 'Bracket kicker', '.so-bracket-kicker-text,.sx-kicker', 'label', true, 'SINGLE ELIMINATION · 2 OF 4 PLACES DECIDED'), slot('labels', 'Qualified / open labels', '.so-bracket-slot-label,.sx-slot-who', 'label', false), scores,
    ...scTexts, slot('roundTitle', 'Bracket title', '.sx-round', 'title', true, 'ROAD TO TOP 4'), slot('column1', 'First column heading', '.sx-ch.c1', 'label', true, 'FIRST ROUND'), slot('column2', 'Second column heading', '.sx-ch.c2', 'label', true, 'SECOND ROUND'), slot('column3', 'Last column heading', '.sx-ch.c3', 'label', true, 'TOP 4'), scFinal, slot('meta', 'Match dates / times', '.sx-card-date,.sx-card-time', 'label', false)],
  'social-live': [...socialHeader, names, scores, slot('cta', 'Watch live call to action', '.so-live-cta,.sx-cta-label', 'label', true, 'WATCH LIVE ON'), slot('next', 'Next match', '.so-live-next-text', 'label', false),
    ...scTexts, slot('liveLabel', 'LIVE word', '.sx-live-a', 'title', true, 'LIVE'), slot('nowLabel', 'NOW word', '.sx-live-b', 'title', true, 'NOW'), slot('roundKicker', 'Round line', '.sx-ctx', 'label', true, 'SECOND ROUND · BEST OF 3'), ...scCast],
  standings: [...header, names, slot('columns', 'Column headings', '.standings-columns', 'label', false), slot('numbers', 'Standings statistics', '.standings-row > span,.standings-points', 'numbers', false), slot('footer', 'Footer', '.nb-footer-copy', 'label', true, '{short} · LEAGUE TABLE')],
};
// Elements that the Layout tab can move and resize. `fixed` keeps the proportions (corner handles only).
// Several nodes under one id (rows, cards) move together, or one by one with an "id#index" override.
const item = (id, label, selector, fixed = false) => ({ id, label, selector, fixed });
const headerItems = [item('header', 'Whole header', '.hdr'), item('headerLogo', 'League logo', '.hdr-logo', true), item('kicker', 'Tournament / kicker', '.hdr-kicker'), item('title', 'Screen title', '.hdr-title'), item('subtitle', 'Subtitle / date', '.hdr-sub'), item('headerRight', 'Header sponsors', '.hdr-right')];
const socialTopItems = [item('socialHeader', 'Whole header', '.so-header'), item('socialMast', 'Top bar', '.so-mast'), item('socialLogo', 'League logo', '.so-league-logo', true), item('socialBrand', 'Tournament name + season', '.so-brand'), item('socialCategory', 'Category label', '.so-category'), item('socialEyebrow', 'Eyebrow', '.so-eyebrow'), item('socialTitle', 'Screen title', '.so-title')];
const socialBottomItems = [item('socialFooter', 'Footer', '.so-footer'), item('socialCaption', 'Footer text', '.so-footer-row'), item('socialSponsors', 'Footer sponsors', '.so-sponsors')];
const lineupRowItems = [item('lineupRow', 'Player row', '.tl-row'), item('lineupRole', 'Role', '.tl-role'), item('lineupNick', 'Player name', '.tl-nick')];
const socialLineupItems = [item('socialRow', 'Player row', '.so-lineup-row'), item('socialRole', 'Role', '.so-lineup-role'), item('socialNick', 'Player name', '.so-lineup-nick')];
const sides = build => ['a', 'b'].flatMap(key => build(key, `Team ${key.toUpperCase()}`, `Player ${key.toUpperCase()}`));
// SUPER CUP style (sx-* nodes); ids start with "sc" so they never collide with the classic social elements.
const scTopItems = [item('scHeader', 'Whole header', '.sx-head'), item('scLogo', 'Event logo', '.sx-lock', true), item('scRound', 'Round title', '.sx-round'), item('scKicker', 'Kicker', '.sx-kicker')];
const scBottomItems = [item('scFooter', 'Footer', '.sx-foot'), item('scSponsor', 'Sponsor line', '.sx-sponsor'), item('scTwitch', 'Twitch link', '.sx-twitch')];
const scTeamItems = sides((k, t) => [item(`scTeam-${k}`, `${t} block`, `.sx-team.${k},.sx-ln.${k}`), item(`scPlate-${k}`, `${t} logo plate`, `.sx-team.${k} .sx-plate,.sx-ln.${k} .sx-plate`, true), item(`scTag-${k}`, `${t} tag`, `.sx-team.${k} .sx-tagbig,.sx-ln.${k} .sx-tagbig`), item(`scName-${k}`, `${t} name`, `.sx-team.${k} .sx-fullname,.sx-ln.${k} .sx-fullname`)]);
export const DESIGN_ELEMENTS = {
  waiting: [item('brand', 'Brand block', '.wait-brand'), item('logo', 'League logo', '.wait-logo', true), item('cup', 'Tournament name', '.wait-cup'), item('rule', 'Divider line', '.wait-rule'), item('title', 'Main message', '.wait-title'), item('caption', 'Caption', '.wait-caption'), item('schedule', 'Schedule block', '.wait-schedule'), item('scheduleLabel', 'Schedule heading', '.wait-schedule-label'), item('date', 'Date', '.wait-date'), item('matches', 'Match list', '.wait-matches'), item('match', 'Match box', '.wait-match'), item('time', 'Match time', '.wait-time'), item('teamLogo', 'Team logo', '.wait-team-logo', true), item('teamTag', 'Team tag', '.wait-team'), item('score', 'Score / VS', '.wait-score,.wait-vs'), item('empty', 'No matches message', '.wait-empty')],
  schedule: [...headerItems, item('rule', 'Divider line', '.sch-rule'), item('rows', 'All match rows', '.sch-rows'), item('row', 'Match row', '.srow'), item('time', 'Match time', '.sc-time'), ...sides((k, t) => [item(`name-${k}`, `${t} name`, `.sc-${k} .sc-name`), item(`logo-${k}`, `${t} logo`, `.sc-${k} .sc-logo`, true)]), item('centre', 'Score / VS', '.sc-mid'), item('info', 'Stage + best of', '.sc-info'), item('stage', 'Match stage', '.sc-stage'), item('bestOf', 'Best-of label', '.sc-bo'), item('empty', 'No matches box', '.sch-empty')],
  versus: [item('top', 'Whole header', '.vs-top'), item('leagueLogo', 'League logo', '.vs-llogo', true), item('meta', 'Stage + date block', '.vs-meta'), item('stage', 'Match stage', '.vs-stage-row'), item('when', 'Date / best of', '.vs-when'), item('sponsors', 'Sponsors', '.vs-spons-wrap'),
    ...sides((k, t) => [item(`side-${k}`, `${t} side`, `.vs-${k}`), item(`crest-${k}`, `${t} crest`, `.vs-${k} .vs-crest`, true), item(`name-${k}`, `${t} name`, `.vs-${k} .vs-name`), item(`sub-${k}`, `${t} tag + record`, `.vs-${k} .vs-sub`)]),
    item('centre', 'Centre block', '.vs-mid'), item('score', 'Score / VS mark', '.vs-scorewrap,.vs-discwrap'), item('status', 'Match status', '.vs-status'),
    ...sides((k, t) => [item(`lineup-${k}`, `${t} lineup`, `.vs-l${k}`), item(`lineupTitle-${k}`, `${t} lineup heading`, `.vs-l${k} .vs-ltitle`), item(`card-${k}`, `${t} player card`, `.vs-l${k} .mcard`), item(`photo-${k}`, `${t} player photo`, `.vs-l${k} .mc-photo`, true), item(`role-${k}`, `${t} player role`, `.vs-l${k} .mc-role`), item(`nick-${k}`, `${t} player name`, `.vs-l${k} .mc-nick`)]),
    ...headerItems, ...sides((k, t) => [item(`panel-${k}`, `${t} panel`, `.tv-${k}`), item(`textTeam-${k}`, `${t} heading`, `.tv-${k} .tv-team`), item(`textLogo-${k}`, `${t} logo`, `.tv-${k} .tv-logo`, true), item(`textTag-${k}`, `${t} tag`, `.tv-${k} .tv-tag`), item(`textName-${k}`, `${t} name`, `.tv-${k} .tv-name`), item(`textRows-${k}`, `${t} players`, `.tv-${k} .tv-rows`), item(`textBench-${k}`, `${t} substitutes`, `.tv-${k} .tv-bench`), item(`textRow-${k}`, `${t} player row`, `.tv-${k} .tl-row`), item(`textRole-${k}`, `${t} role`, `.tv-${k} .tl-role`), item(`textNick-${k}`, `${t} player name`, `.tv-${k} .tl-nick`)]), item('textCentre', 'Score / VS', '.tv-centre')],
  'simple-vs': [item('kicker', 'Tournament heading', '.sv-kicker'), item('band', 'Whole band', '.sv-band'), ...sides((k, t) => [item(`wing-${k}`, `${t} wing`, `.sv-${k}`), item(`crest-${k}`, `${t} crest`, `.sv-${k} .sv-crest`, true), item(`tag-${k}`, `${t} tag`, `.sv-${k} .sv-tag`), item(`name-${k}`, `${t} name`, `.sv-${k} .sv-name`)]), item('centre', 'Score / VS', '.sv-mid'), item('meta', 'Information line', '.sv-meta'), item('badge', 'Match status', '.sv-badge'), item('when', 'Date / stage', '.sv-when')],
  roster: [item('head', 'Whole header', '.r-head'), item('crest', 'Team crest', '.r-crest', true), item('heading', 'Team text block', '.r-title'), item('label', 'Roster label', '.r-title > .kicker'), item('name', 'Team name', '.r-name'), item('meta', 'Tag + record', '.r-meta'), item('leagueLogo', 'League logo', '.r-llogo', true), item('ornament', 'Ornament line', '.r-meander'), item('cards', 'All player cards', '.r-cards'), item('card', 'Player card', '.pcard'), item('photo', 'Player photo', '.pc-photo', true), item('cardTop', 'Role + flag', '.pc-top'), item('cardInfo', 'Name block', '.pc-info'), item('nick', 'Player name', '.pc-nick'), item('realName', 'Real name', '.pc-name'), item('bench', 'Bench bar', '.r-bench'), item('benchLabel', 'Bench heading', '.bench-label'), item('benchList', 'Bench list', '.bench-list'), item('chip', 'Bench player', '.chip'), item('sponsors', 'Sponsors', '.r-spons'),
    ...headerItems, item('textBrand', 'Team brand block', '.tr-brand'), item('textLogo', 'Team logo', '.tr-logo', true), item('textTag', 'Team tag', '.tr-tag'), item('textLabel', 'Roster label', '.tr-label'), item('textLineup', 'Lineup block', '.tr-lineup'), item('textColumns', 'Column headings', '.tr-columns'), item('textRows', 'Player list', '.tr-rows'), ...lineupRowItems, item('textBench', 'Substitutes', '.tr-bench')],
  matchup: [item('head', 'Whole header', '.mu-head'), item('kicker', 'Tournament heading', '.mu-kicker'), item('title', 'Matchup title', '.mu-title-row'), ...sides((k, t, p) => [item(`photo-${k}`, `${p} photo`, `.mu-photo-${k}`, true), item(`art-${k}`, `${t} crest`, `.mu-art-${k}`, true), item(`card-${k}`, `${p} block`, `.mu-card-${k}`), item(`team-${k}`, `${p} team`, `.mu-card-${k} .mu-teamrow`), item(`nick-${k}`, `${p} name`, `.mu-card-${k} .mu-nick`), item(`realName-${k}`, `${p} real name`, `.mu-card-${k} .mu-name`), item(`champions-${k}`, `${p} champions`, `.mu-card-${k} .mu-champs`)]), item('panel', 'Statistics panel', '.mu-panel'), item('panelHead', 'Panel heading', '.mu-panel-head'), item('rows', 'Statistics table', '.mu-rows'), item('row', 'Statistics row', '.mrow'), item('headToHead', 'Head-to-head', '.mu-h2h')],
  bracket: [...headerItems, item('rule', 'Divider line', '.brk-rule'), item('frame', 'Embed frame', '.brk-frame'), item('ghost', 'Placeholder bracket', '.brk-ghost'), item('final', 'Grand final box', '.brk-final'), item('box', 'Placeholder match', '.brk-box'), item('tree', 'Whole bracket', '.native-bracket'), item('lines', 'Bracket lines', '.nb-lines'), item('round', 'Round heading', '.nb-round'), item('match', 'Match box', '.nb-match'), item('qualified', 'Qualified team', '.nb-qualified'), item('entries', 'Top 4 teams', '.gsl-entries'), item('qualifiers', 'Qualifiers', '.gsl-qualifiers'), item('footer', 'Footer', '.nb-footer')],
  format: [...headerItems, item('rule', 'Divider line', '.brk-rule'), item('stages', 'All stages', '.format-stages'), item('stage', 'Stage box', '.format-stage'), item('step', 'Stage number', '.format-step'), item('name', 'Stage name', '.format-name'), item('headline', 'Stage headline', '.format-headline'), item('points', 'Description', '.format-points'), item('footer', 'Footer', '.format-footer')],
  sponsors: [...headerItems, item('rule', 'Divider line', '.sp-rule'), item('wall', 'Whole sponsor wall', '.sp-wall'), item('label', 'Section heading', '.sp-label'), item('mainRow', 'Main sponsor row', '.sp-main-row'), item('partnerGrid', 'Partner grid', '.sp-grid'), item('mainTile', 'Main sponsor tile', '.sp-tile.is-main'), item('partnerTile', 'Partner tile', '.sp-tile.is-partner'), item('empty', 'Coming soon box', '.sp-empty')],
  'social-schedule': [...socialTopItems, item('date', 'Date bar', '.so-date'), item('dateText', 'Date', '.so-date-text'), item('timezone', 'Timezone label', '.so-timezone'), item('fixtures', 'All matches', '.so-fixtures'), item('fixture', 'Match box', '.so-fixture'), item('index', 'Match number', '.so-match-index'), ...sides((k, t) => [item(`team-${k}`, `${t} block`, `.so-team-${k}`), item(`logo-${k}`, `${t} logo`, `.so-team-${k} .so-team-logo`, true), item(`name-${k}`, `${t} name`, `.so-team-${k} .so-team-name`)]), item('centre', 'Time + score block', '.so-match-centre'), item('time', 'Match time', '.so-fixture-time'), item('score', 'Score / VS', '.so-fixture-vs'), item('bestOf', 'Best-of label', '.so-fixture-bo'), item('empty', 'No matches message', '.so-no-matches'), ...socialBottomItems,
    ...scTopItems, item('scRows', 'All match rows', '.sx-rows'), item('scRow', 'Match row', '.sx-row'), item('scMeta', 'Date + time tab', '.sx-meta'), item('scBar', 'Match bar', '.sx-bar'), ...sides((k, t) => [item(`scWell-${k}`, `${t} logo`, `.sx-side.${k} .sx-well`, true), item(`scRowTag-${k}`, `${t} tag`, `.sx-side.${k} .sx-tag`)]), item('scCentre', 'VS / score', '.sx-mid'), item('scEmpty', 'No matches message', '.sx-empty'), ...scBottomItems],
  'social-versus': [...socialTopItems, item('kicker', 'Stage + best of', '.so-vs-kicker'), item('fighters', 'Both players', '.so-fighters'), ...sides((k, t, p) => [item(`fighter-${k}`, p, `.so-fighter-${k}`), item(`photo-${k}`, `${p} photo`, `.so-fighter-${k} .so-player-photo,.so-fighter-${k} .so-player-ink`, true), item(`caption-${k}`, `${p} name + role`, `.so-fighter-${k} .so-player-caption`)]), item('vs', 'VS mark', '.so-versus-mark,.so-lineup-vs'), item('teams', 'Team bar', '.so-versus-teams'), item('team', 'Team block', '.so-versus-team'), item('teamLogo', 'Team logo', '.so-versus-logo', true), item('teamName', 'Team name', '.so-versus-team-name'), item('date', 'Date + time block', '.so-vs-date'), item('dateText', 'Date', '.so-vs-date-label'), item('time', 'Match time', '.so-vs-time'),
    item('lineupMatch', 'Stage + best of', '.so-lineup-match'), item('panels', 'Both lineups', '.so-lineup-versus-panels'), ...[['a', 'first'], ['b', 'last']].flatMap(([k, side]) => { const team = `.so-lineup-team:${side}-of-type`, t = `Team ${k.toUpperCase()}`; return [item(`lineup-${k}`, `${t} lineup`, team), item(`lineupLogo-${k}`, `${t} logo`, `${team} .so-lineup-logo`, true), item(`lineupHeading-${k}`, `${t} heading`, `${team} .so-lineup-heading`), item(`lineupList-${k}`, `${t} player list`, `${team} .so-lineup-list`), item(`lineupRow-${k}`, `${t} player row`, `${team} .so-lineup-row`), item(`lineupRole-${k}`, `${t} role`, `${team} .so-lineup-role`), item(`lineupNick-${k}`, `${t} player name`, `${team} .so-lineup-nick`)]; }), ...socialBottomItems,
    ...scTopItems, item('scDuel', 'Both teams', '.sx-duel,.sx-diag'), ...scTeamItems, item('scVs', 'VS mark', '.sx-vswrap,.sx-vsrow'), item('scTicket', 'Date / time / broadcast', '.sx-ticket'), item('scCell', 'Ticket cell', '.sx-cell'), ...scBottomItems],
  'social-roster': [...socialTopItems, item('brandBlock', 'Team brand block', '.so-roster-brand'), item('teamLogo', 'Team logo', '.so-roster-logo', true), item('teamName', 'Team name', '.so-roster-name'), item('lineup', 'Player list', '.so-roster-lineup'), ...socialLineupItems, ...socialBottomItems,
    ...scTopItems, item('scTeam', 'Team identity', '.sx-teamid'), item('scTeamLogo', 'Team logo', '.sx-teamid .sx-logo', true), item('scTeamTag', 'Team tag', '.sx-team-tag'), item('scTeamName', 'Team name', '.sx-teamid .sx-fullname'), item('scTable', 'Roster table', '.sx-rtable'), item('scGhost', 'Faded team logo', '.sx-ghost', true), item('scSubs', 'Substitutes', '.sx-subrow'), ...scBottomItems],
  'social-result': [...socialTopItems, item('score', 'Score', '.so-result-score'), item('teams', 'Both teams', '.so-versus-teams'), item('team', 'Team block', '.so-versus-team'), item('teamLogo', 'Team logo', '.so-versus-logo', true), item('band', 'Qualification band', '.so-result-band'), ...socialBottomItems,
    ...scTopItems, item('scDuel', 'Both teams', '.sx-duel,.sx-board'), ...scTeamItems, item('scFinal', 'Final label', '.sx-final'), item('scScore', 'Score', '.sx-bigscore,.sx-ln-score'), item('scBand', 'Qualification band', '.sx-band'), item('scInfo', 'Date / best of', '.sx-sub'), ...scBottomItems],
  'social-announce': [...socialTopItems, item('announce', 'Announcement block', '.so-announce'), item('headline', 'Headline', '.so-announce-title'), item('kicker', 'Kicker', '.so-announce-kicker'), ...socialBottomItems,
    ...scTopItems, item('scAnnounce', 'Announcement block', '.sx-ann'), item('scAnnKicker', 'Kicker', '.sx-ann-kick'), item('scHeadline', 'Headline', '.sx-display'), item('scRule', 'Divider line', '.sx-ann-rule'), item('scDate', 'Date', '.sx-ann-date'), item('scTimeLine', 'Weekday + time', '.sx-ann-tline'), item('scInfo', 'Information line', '.sx-ann-info'), ...scBottomItems],
  'social-bracket': [...socialTopItems, item('kicker', 'Bracket kicker', '.so-bracket-kicker'), item('lanes', 'All lanes', '.so-bracket-lanes'), item('lane', 'Lane', '.so-bracket-lane'), item('feeder', 'Feeder match', '.so-bracket-match'), item('match', 'Round two match', '.so-bracket-match.is-decided'), item('slot', 'Qualified slot', '.so-bracket-slot'), ...socialBottomItems,
    ...scTopItems, item('scBracket', 'Whole bracket', '.sx-bk'), item('scColumns', 'Column headings', '.sx-bk-cols'), item('scLane', 'Lane', '.sx-lane'), item('scCard', 'Match card', '.sx-card'), item('scSlot', 'Top 4 slot', '.sx-slot'), item('scEmpty', 'No bracket message', '.sx-empty'), ...scBottomItems],
  'social-live': [...socialTopItems, item('teams', 'Both teams', '.so-versus-teams'), item('teamLogo', 'Team logo', '.so-versus-logo', true), item('next', 'Next match', '.so-live-next'), ...socialBottomItems,
    ...scTopItems, item('scLive', 'LIVE NOW', '.sx-live'), item('scContext', 'Round line', '.sx-ctx'), item('scDuel', 'Both teams', '.sx-duel'), ...scTeamItems, item('scVs', 'VS + cast', '.sx-vswrap'), item('scCta', 'Watch live', '.sx-cta'), ...scBottomItems],
  standings: [...headerItems, item('rule', 'Divider line', '.brk-rule'), item('table', 'Whole standings table', '.standings-table'), item('columns', 'Column headings', '.standings-columns'), item('row', 'Standings row', '.standings-row'), item('teamLogo', 'Team logo', '.standings-row .nb-logo', true), item('teamName', 'Team name', '.standings-name'), item('points', 'Points', '.standings-points'), item('footer', 'Footer', '.nb-footer')],
};
export const LAYOUT_LIMITS = { offset: 4000, minScale: 0.1, maxScale: 6, minSize: 10, maxSize: 4000 };
export function screenElements(scene) { return DESIGN_ELEMENTS[scene] || []; }
/** One element's override without its default values: { x, y, s, w, h }. */
export function cleanLayout(value = {}) {
  const out = {};
  if (value.x) out.x = Math.round(value.x * 10) / 10;
  if (value.y) out.y = Math.round(value.y * 10) / 10;
  if (value.s && value.s !== 1) out.s = Math.round(value.s * 1000) / 1000;
  if (value.w) out.w = Math.round(value.w);
  if (value.h) out.h = Math.round(value.h);
  return out;
}
const NO_ICONS = { icons: 'classic', iconPicks: {}, customIcons: {}, iconTint: false };
export const CUSTOM_ICON_URL = /^\/media\/design-icons\/[\w-]+\.png$/;
export const EMPTY_DESIGN = { fonts: { title: '', body: '', label: '', numbers: '' }, assets: { frame: 'original', boxes: 'original', radius: 0, opacity: 85, accent: '', accent2: '', ...NO_ICONS }, screens: {}, layouts: {}, backgrounds: { default: { ...BG_DEFAULT }, screens: {} } };
export const BUILTIN_DESIGNS = [
  { id: 'original', name: 'Original broadcast', builtin: true, config: structuredClone(EMPTY_DESIGN) },
  { id: 'clean', name: 'Clean broadcast', builtin: true, config: { ...structuredClone(EMPTY_DESIGN), fonts: { title: 'commissioner', body: 'fira', label: 'fira', numbers: 'commissioner' }, assets: { frame: 'line', boxes: 'glass', radius: 12, opacity: 80, accent: '', accent2: '', ...structuredClone(NO_ICONS) } } },
  { id: 'neon', name: 'Neon arena', builtin: true, config: { ...structuredClone(EMPTY_DESIGN), fonts: { title: 'fira-extra', body: 'commissioner', label: 'fira', numbers: 'commissioner' }, assets: { frame: 'corners', boxes: 'outline', radius: 4, opacity: 80, accent: '#763aff', accent2: '#47e7dd', ...structuredClone(NO_ICONS) } } },
  { id: 'classic', name: 'Classic gold', builtin: true, config: { ...structuredClone(EMPTY_DESIGN), fonts: { title: 'noto', body: 'fira', label: 'commissioner', numbers: 'commissioner' }, assets: { frame: 'double', boxes: 'solid', radius: 0, opacity: 88, accent: '#16334a', accent2: '#e7c276', ...structuredClone(NO_ICONS) } } },
];
export function screenSlots(scene) { return DESIGN_SLOTS[scene] || header; }
export function expandDesignText(text, data) {
  const values = { tournament: data.league?.name, short: data.league?.short, season: data.league?.season, date: data.dateLabel || data.match?.date, stage: data.match?.stage, team: data.team?.name, teamA: data.teamA?.name, teamB: data.teamB?.name };
  return text.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? '');
}
export function normalizeDesign(raw = {}) {
  const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  if (!object(raw)) fail('Design must be an object');
  const result = structuredClone(EMPTY_DESIGN);
  const font = value => { if (typeof value !== 'string' || (value && !DESIGN_FONTS.some(f => f.id === value))) fail('Choose a font from the library'); return value; };
  for (const role of FONT_ROLES) if (raw.fonts?.[role.id] !== undefined) result.fonts[role.id] = font(raw.fonts[role.id]);
  const assets = raw.assets || {};
  for (const [key, options] of [['frame', FRAME_STYLES], ['boxes', BOX_STYLES]]) if (assets[key] !== undefined) { if (!options.includes(assets[key])) fail(`Unknown ${key} style`); result.assets[key] = assets[key]; }
  for (const [key, min, max] of [['radius', 0, 36], ['opacity', 20, 100]]) if (assets[key] !== undefined) { if (!Number.isFinite(assets[key]) || assets[key] < min || assets[key] > max) fail(`Invalid ${key}`); result.assets[key] = assets[key]; }
  for (const key of ['accent', 'accent2']) if (assets[key] !== undefined) { if (typeof assets[key] !== 'string' || (assets[key] && !/^#[0-9a-f]{6}$/i.test(assets[key]))) fail('Use a six-digit colour'); result.assets[key] = assets[key]; }
  if (assets.icons !== undefined) { if (!ICON_SET_IDS.includes(assets.icons)) fail('Unknown icon style'); result.assets.icons = assets.icons; }
  if (assets.iconPicks !== undefined && !object(assets.iconPicks)) fail('Icon picks must be an object');
  for (const [slot, set] of Object.entries(assets.iconPicks || {})) if (ICON_SLOTS.some(s => s.id === slot) && ICON_SET_IDS.includes(set) && set !== result.assets.icons) result.assets.iconPicks[slot] = set;
  if (assets.iconTint !== undefined) { if (typeof assets.iconTint !== 'boolean') fail('Icon colour must be on or off'); result.assets.iconTint = assets.iconTint; }
  if (assets.customIcons !== undefined && !object(assets.customIcons)) fail('Custom icons must be an object');
  for (const [slot, url] of Object.entries(assets.customIcons || {})) {
    if (!ICON_SLOTS.some(s => s.id === slot) || typeof url !== 'string' || !CUSTOM_ICON_URL.test(url)) fail('Invalid custom icon');
    result.assets.customIcons[slot] = url;
  }
  if (raw.screens !== undefined && !object(raw.screens)) fail('Screen text must be an object');
  for (const [scene, slots] of Object.entries(raw.screens || {})) {
    if (!SCENE_IDS.includes(scene) || !object(slots)) fail('Unknown screen');
    const normalized = {};
    for (const [id, value] of Object.entries(slots)) {
      const definition = screenSlots(scene).find(s => s.id === id);
      if (!definition || !object(value)) fail('Unknown text field');
      const text = value.text ?? '';
      if (typeof text !== 'string' || text.length > 500 || (!definition.editable && text)) fail('Invalid text; match and roster data remain automatic');
      for (const match of text.matchAll(/\{(\w+)\}/g)) if (!TEXT_TOKENS.includes(match[1])) fail(`Unknown text token: {${match[1]}}`);
      if (value.enabled !== undefined && typeof value.enabled !== 'boolean') fail('Text visibility must be on or off');
      const size = value.size ?? 0;
      if (!Number.isFinite(size) || size !== 0 && (size < 10 || size > 260)) fail('Font size must be 10–260, or blank for original');
      normalized[id] = { text, enabled: value.enabled !== false, font: font(value.font ?? ''), size };
    }
    result.screens[scene] = normalized;
  }
  if (raw.layouts !== undefined && !object(raw.layouts)) fail('Screen layout must be an object');
  for (const [scene, values] of Object.entries(raw.layouts || {})) {
    if (!SCENE_IDS.includes(scene) || !object(values)) fail('Unknown screen');
    const known = new Set(screenElements(scene).map(e => e.id));
    const normalized = {};
    for (const [key, value] of Object.entries(values)) {
      const match = /^([\w-]+)(?:#(\d+))?$/.exec(key);
      // An element that a later version removed must not stop an old preset from loading.
      if (!match || !known.has(match[1])) continue;
      if (!object(value)) fail('Invalid element layout');
      const limit = (name, min, max) => { const n = value[name]; if (n != null && (!Number.isFinite(n) || n < min || n > max)) fail(`Invalid element layout: ${name}`); };
      limit('x', -LAYOUT_LIMITS.offset, LAYOUT_LIMITS.offset); limit('y', -LAYOUT_LIMITS.offset, LAYOUT_LIMITS.offset);
      limit('s', LAYOUT_LIMITS.minScale, LAYOUT_LIMITS.maxScale); limit('w', LAYOUT_LIMITS.minSize, LAYOUT_LIMITS.maxSize); limit('h', LAYOUT_LIMITS.minSize, LAYOUT_LIMITS.maxSize);
      const clean = cleanLayout(value);
      // A one-element entry stays even when empty: that element keeps its original place while its group moves.
      if (match[2] !== undefined || Object.keys(clean).length) normalized[key] = clean;
    }
    if (Object.keys(normalized).length) result.layouts[scene] = normalized;
  }
  if (raw.backgrounds !== undefined) {
    const bg = raw.backgrounds;
    if (!object(bg)) fail('Background settings must be an object');
    const entry = value => {
      if (!object(value)) fail('Background settings must be an object');
      const out = {};
      if (value.show !== undefined) { if (typeof value.show !== 'boolean') fail('Background visibility must be on or off'); out.show = value.show; }
      for (const [key, options] of [['motion', BG_MOTIONS], ['speed', BG_SPEEDS], ['intensity', BG_INTENSITIES]]) if (value[key] !== undefined) {
        if (typeof value[key] !== 'string') fail('Invalid background motion');
        if (options.includes(value[key])) out[key] = value[key];
      }
      return out;
    };
    if (bg.default !== undefined) Object.assign(result.backgrounds.default, entry(bg.default));
    if (bg.screens !== undefined && !object(bg.screens)) fail('Background settings must be an object');
    for (const [scene, value] of Object.entries(bg.screens || {})) {
      if (!SCENE_IDS.includes(scene)) continue;
      const clean = Object.fromEntries(Object.entries(entry(value)).filter(([key, v]) => v !== result.backgrounds.default[key]));
      if (Object.keys(clean).length) result.backgrounds.screens[scene] = clean;
    }
  }
  return result;
}
