// Custom scene builder: scene + parameter + mode → { scene, params }. Used by Live and Export.
import { h } from './dom.js';
import { t } from './strings.js';
import { store } from './store.js';
import { ctlSelect, ctlSegmented, ctlCombo, ctlText, ctlNumber, ctlToggle, field } from './ui.js';
import { SCENES, sceneName, teamOptions, matchOptions, playerComboOptions, featureAutoTitle, cleanParams } from './scenes.js';
import { isPortrait, sceneDefinition, sceneFormats } from '../../shared/scenes.js';

/** Every bracket round of the active tournament, for the social-schedule Round picker (empty value = by day). */
export function roundOptions(state) {
  const brackets = state.settings.brackets ?? [];
  const grouped = brackets.length > 1;
  return brackets.flatMap(bracket => (bracket.rounds ?? []).filter(round => round.id).map(round => ({
    value: round.id,
    label: round.name || round.id,
    ...(grouped ? { group: bracket.name || bracket.id } : {}),
  })));
}

/**
 * Params of social-schedule: a bracket round replaces the day; pagination still applies.
 * `results: false` asks the scene for the VS layout of played matches (params.results = '0').
 */
export function socialScheduleParams({ round, day, date, today, page, results } = {}) {
  const params = {};
  if (round) params.round = round;
  else params.day = day === 'date' ? (date || today) : day;
  if (page > 1) params.page = page;
  if (results === false) params.results = '0';
  return params;
}

export function sceneBuilder({ onChange, sceneFilter = () => true } = {}) {
  const state = store.state;
  const allowedScenes = st => SCENES.filter(s => sceneFilter(s) && (!st.settings.enabledScenes?.length || st.settings.enabledScenes.includes(s))).map(s => ({ value: s, label: sceneName(s) }));
  const scene = ctlSelect({ options: allowedScenes(state), value: allowedScenes(state).find(s => s.value === 'versus')?.value || allowedScenes(state)[0]?.value });
  const team = ctlSelect({ options: teamOptions(state) });
  const bracketOptions = st => (st.settings.brackets || []).map(bracket => ({ value: bracket.id, label: bracket.name }));
  const bracket = ctlSelect({ options: bracketOptions(state) });
  const match = ctlSelect({ options: matchOptions(state, { auto: true }) });
  const day = ctlSegmented({ options: [{ value: 'today', label: t('scenes.today') }, { value: 'tomorrow', label: t('scenes.tomorrow') }, { value: 'date', label: t('live.date') }, { value: 'all', label: t('scenes.allDays') }], value: 'today', size: 'sm' });
  const date = ctlText({ type: 'date', value: state.today });
  const src = ctlSegmented({ options: [{ value: 'feature', label: t('live.sourceFeature') }, { value: 'players', label: t('live.sourcePlayers') }], value: state.features.length ? 'feature' : 'players', size: 'sm' });
  const feature = ctlSelect({ options: featureOpts(state) });
  const pa = ctlCombo({ options: playerComboOptions(state), placeholder: t('live.playerA'), searchPlaceholder: t('matchups.searchPlayer') });
  const pb = ctlCombo({ options: playerComboOptions(state), placeholder: t('live.playerB'), searchPlaceholder: t('matchups.searchPlayer') });
  const mode = ctlSegmented({ options: [{ value: '', label: t('live.modeDefault', { mode: state.settings.mode }) }, { value: 'full', label: t('live.modeFull') }, { value: 'simple', label: t('live.modeSimple') }], value: '', size: 'sm' });
  const background = ctlSelect({ options: backgroundOpts(state) });
  const effect = ctlSelect({ value: 'halftone', options: [{ value: 'halftone', label: t('live.effectHalftone') }, { value: 'prism', label: t('live.effectPrism') }, { value: 'none', label: t('live.effectNone') }] });
  const page = ctlNumber({ value: 1, min: 1, max: 99 });
  const format = ctlSelect({ options: [{ value: 'story', label: 'Story 1080×1920' }, { value: 'post', label: 'Post 1080×1350' }], value: 'story' });
  const round = ctlSelect({ options: roundOptions(state) });
  const results = ctlToggle({ value: true });

  const fTeam = field(t('live.team'), team);
  const fBracket = field(t('scenes.bracket'), bracket);
  const fMatch = field(t('live.match'), match);
  const fDay = field(t('live.day'), day);
  const fDate = field(null, date);
  const fSrc = field(t('live.source'), src);
  const fFeature = field(t('live.feature'), feature);
  const fPA = field(t('live.playerA'), pa);
  const fPB = field(t('live.playerB'), pb);
  const fMode = field(t('live.mode'), mode);
  const fBackground = field(t('live.background'), background);
  const fEffect = field(t('live.effect'), effect, { hint: t('live.effectHint') });
  const fPage = field(t('live.page'), page, { hint: t('live.pageHint') });
  const fFormat = field('Social format', format, { hint: 'Post 1080×1350 or story 1080×1920.' });
  const fRound = field('Round', round, { hint: 'Show one bracket round. Empty = by day.' });
  const fResults = field('Show results', results, { hint: 'Played matches show the final score instead of VS.' });

  const el = h('div.builder', field(t('live.scene'), scene), fBracket, fTeam, fMatch, fDay, fDate, fRound, fResults, fSrc, fFeature, fPA, fPB, fFormat, fMode, fBackground, fEffect, fPage);

  const isSocial = (id) => sceneDefinition(id)?.group === 'social';

  function refreshPlayers(st) {
    const options = playerComboOptions(st);
    const social = scene.get() === 'social-versus';
    const chosenMatch = st.matches.find(item => item.id === (match.get() || st.nextMatch));
    for (const [control, teamId] of [[pa, chosenMatch?.teamA], [pb, chosenMatch?.teamB]]) {
      const eligible = new Set(st.players.filter(player => player.teamId === teamId && !player.hidden && player.role !== 'Coach').map(player => player.id));
      const filtered = social ? options.filter(option => eligible.has(option.value)) : options;
      control.setOptions(social ? [{ value: null, label: t('live.autoPlayer') }, ...filtered] : filtered);
      if (social && control.get() && !eligible.has(control.get())) control.set(null);
    }
  }

  function layout() {
    const s = scene.get();
    const schedule = s === 'social-schedule';
    const rounds = roundOptions(store.state);
    fTeam.hidden = s !== 'roster' && s !== 'social-roster';
    fBracket.hidden = s !== 'bracket' || bracketOptions(store.state).length < 2;
    fMatch.hidden = !['versus', 'simple-vs', 'social-versus'].includes(s);
    fRound.hidden = !schedule || !rounds.length;
    fResults.hidden = !schedule;
    fDay.hidden = s !== 'schedule' && !(schedule && !round.get());
    fDate.hidden = fDay.hidden || day.get() !== 'date';
    fSrc.hidden = s !== 'matchup';
    fFeature.hidden = s !== 'matchup' || src.get() !== 'feature';
    fPA.hidden = fPB.hidden = (s !== 'social-versus' || store.state.settings.rosterStyle === 'text') && (s !== 'matchup' || src.get() !== 'players');
    fMode.hidden = isPortrait(s);
    fEffect.hidden = s !== 'social-versus' || store.state.settings.rosterStyle === 'text';
    fPage.hidden = s !== 'social-schedule' && !(s === 'schedule' && day.get() === 'all');
    const formats = sceneFormats(s);
    fFormat.hidden = !isSocial(s);
    format.setOptions(formats.map(value => ({ value, label: value === 'post' ? 'Post 1080×1350' : 'Story 1080×1920' })));
    if (formats.length && !formats.includes(format.get())) format.set(formats[0]);
    refreshPlayers(store.state);
  }

  function get() {
    const s = scene.get();
    const params = {};
    if (s === 'roster' || s === 'social-roster') params.team = team.get();
    if (s === 'bracket' && bracket.get()) params.bracket = bracket.get();
    if (['versus', 'simple-vs', 'social-versus'].includes(s)) params.match = match.get();
    if (s === 'schedule') {
      params.day = day.get() === 'date' ? (date.get() || state.today) : day.get();
      if (day.get() === 'all' && page.get() > 1) params.page = page.get();
    }
    if (s === 'social-schedule') Object.assign(params, socialScheduleParams({ round: round.get(), day: day.get(), date: date.get(), today: state.today, page: page.get(), results: results.get() }));
    if (s === 'social-versus') { params.playerA = pa.get(); params.playerB = pb.get(); params.effect = effect.get(); }
    if (s === 'matchup') {
      if (src.get() === 'feature') params.feature = feature.get();
      else { params.a = pa.get(); params.b = pb.get(); }
    }
    if (mode.get() && !isPortrait(s)) params.mode = mode.get();
    if (isSocial(s)) params.format = format.get() || 'story';
    if (background.get()) params.background = background.get();
    return { scene: s, params: cleanParams(params) };
  }

  /** Load a cue into the fields without emitting change. */
  function set(cue) {
    if (!cue?.scene) return;
    const p = cue.params ?? {};
    scene.set(sceneFilter(cue.scene) ? cue.scene : allowedScenes(store.state)[0]?.value);
    if (cue.scene === 'bracket') bracket.set(p.bracket || bracketOptions(store.state)[0]?.value);
    if (p.team) team.set(p.team);
    if (['versus', 'simple-vs', 'social-versus'].includes(cue.scene)) match.set(p.match ?? '');
    if (cue.scene === 'schedule' || cue.scene === 'social-schedule') {
      if (!p.day || ['today', 'tomorrow', 'all'].includes(p.day)) day.set(p.day ?? 'today');
      else { day.set('date'); date.set(p.day); }
    }
    if (cue.scene === 'social-versus') { pa.set(p.playerA ?? null); pb.set(p.playerB ?? null); effect.set(p.effect ?? 'halftone'); }
    if (cue.scene === 'social-schedule') { round.set(p.round ?? ''); results.set(p.results !== '0'); }
    if (isSocial(cue.scene)) format.set(p.format ?? 'story');
    page.set(p.page ?? 1);
    background.set(p.background ?? '');
    if (cue.scene === 'matchup') {
      if (p.feature) { src.set('feature'); feature.set(p.feature); }
      else if (p.a || p.b) { src.set('players'); pa.set(p.a ?? null); pb.set(p.b ?? null); }
    }
    mode.set(p.mode ?? '');
    layout();
  }

  function refresh(st) {
    scene.setOptions(allowedScenes(st));
    bracket.setOptions(bracketOptions(st));
    team.setOptions(teamOptions(st));
    match.setOptions(matchOptions(st, { auto: true }));
    feature.setOptions(featureOpts(st));
    round.setOptions(roundOptions(st));
    pa.setOptions(playerComboOptions(st));
    pb.setOptions(playerComboOptions(st));
    background.setOptions(backgroundOpts(st));
    refreshPlayers(st);
    layout();
  }

  const emit = () => { layout(); onChange?.(get()); };
  el.addEventListener('change', emit);
  layout();
  return { el, get, set, refresh };
}

function backgroundOpts(state) {
  return [{ value: '', label: t('live.backgroundDefault') }, { value: 'preset', label: t('live.backgroundPreset') }, ...(state.backgrounds ?? []).map(item => ({ value: item.id, label: item.name }))];
}

function featureOpts(state) {
  if (!state.features.length) return [{ value: '', label: t('live.noMatchups'), disabled: true }];
  return state.features.map((f) => ({ value: f.id, label: f.title || featureAutoTitle(f) }));
}
