// Custom scene builder: scene + parameter + mode → { scene, params }. Used by Live and Export.
import { h } from './dom.js';
import { t } from './strings.js';
import { store } from './store.js';
import { ctlSelect, ctlSegmented, ctlCombo, ctlText, field } from './ui.js';
import { SCENES, sceneName, teamOptions, matchOptions, playerComboOptions, featureAutoTitle, cleanParams } from './scenes.js';

export function sceneBuilder({ onChange } = {}) {
  const state = store.state;
  const scene = ctlSelect({ options: SCENES.map((s) => ({ value: s, label: sceneName(s) })), value: 'versus' });
  const team = ctlSelect({ options: teamOptions(state) });
  const match = ctlSelect({ options: matchOptions(state, { auto: true }) });
  const day = ctlSegmented({ options: [{ value: 'today', label: t('scenes.today') }, { value: 'tomorrow', label: t('scenes.tomorrow') }, { value: 'date', label: t('live.date') }], value: 'today', size: 'sm' });
  const date = ctlText({ type: 'date', value: state.today });
  const src = ctlSegmented({ options: [{ value: 'feature', label: t('live.sourceFeature') }, { value: 'players', label: t('live.sourcePlayers') }], value: state.features.length ? 'feature' : 'players', size: 'sm' });
  const feature = ctlSelect({ options: featureOpts(state) });
  const pa = ctlCombo({ options: playerComboOptions(state), placeholder: t('live.playerA'), searchPlaceholder: t('matchups.searchPlayer') });
  const pb = ctlCombo({ options: playerComboOptions(state), placeholder: t('live.playerB'), searchPlaceholder: t('matchups.searchPlayer') });
  const mode = ctlSegmented({ options: [{ value: '', label: t('live.modeDefault', { mode: state.settings.mode }) }, { value: 'full', label: t('live.modeFull') }, { value: 'simple', label: t('live.modeSimple') }], value: '', size: 'sm' });

  const fTeam = field(t('live.team'), team);
  const fMatch = field(t('live.match'), match);
  const fDay = field(t('live.day'), day);
  const fDate = field(null, date);
  const fSrc = field(t('live.source'), src);
  const fFeature = field(t('live.feature'), feature);
  const fPA = field(t('live.playerA'), pa);
  const fPB = field(t('live.playerB'), pb);
  const fMode = field(t('live.mode'), mode);

  const el = h('div.builder', field(t('live.scene'), scene), fTeam, fMatch, fDay, fDate, fSrc, fFeature, fPA, fPB, fMode);

  function layout() {
    const s = scene.get();
    fTeam.hidden = s !== 'roster';
    fMatch.hidden = s !== 'versus' && s !== 'simple-vs';
    fDay.hidden = s !== 'schedule';
    fDate.hidden = s !== 'schedule' || day.get() !== 'date';
    fSrc.hidden = s !== 'matchup';
    fFeature.hidden = s !== 'matchup' || src.get() !== 'feature';
    fPA.hidden = fPB.hidden = s !== 'matchup' || src.get() !== 'players';
  }

  function get() {
    const s = scene.get();
    const params = {};
    if (s === 'roster') params.team = team.get();
    if (s === 'versus' || s === 'simple-vs') params.match = match.get();
    if (s === 'schedule') params.day = day.get() === 'date' ? (date.get() || state.today) : day.get();
    if (s === 'matchup') {
      if (src.get() === 'feature') params.feature = feature.get();
      else { params.a = pa.get(); params.b = pb.get(); }
    }
    if (mode.get()) params.mode = mode.get();
    return { scene: s, params: cleanParams(params) };
  }

  /** Load a cue into the fields without emitting change. */
  function set(cue) {
    if (!cue?.scene) return;
    const p = cue.params ?? {};
    scene.set(cue.scene);
    if (p.team) team.set(p.team);
    if (cue.scene === 'versus' || cue.scene === 'simple-vs') match.set(p.match ?? '');
    if (cue.scene === 'schedule') {
      if (!p.day || p.day === 'today' || p.day === 'tomorrow') day.set(p.day ?? 'today');
      else { day.set('date'); date.set(p.day); }
    }
    if (cue.scene === 'matchup') {
      if (p.feature) { src.set('feature'); feature.set(p.feature); }
      else if (p.a || p.b) { src.set('players'); pa.set(p.a ?? null); pb.set(p.b ?? null); }
    }
    mode.set(p.mode ?? '');
    layout();
  }

  function refresh(st) {
    team.setOptions(teamOptions(st));
    match.setOptions(matchOptions(st, { auto: true }));
    feature.setOptions(featureOpts(st));
    pa.setOptions(playerComboOptions(st));
    pb.setOptions(playerComboOptions(st));
  }

  const emit = () => { layout(); onChange?.(get()); };
  el.addEventListener('change', emit);
  layout();
  return { el, get, set, refresh };
}

function featureOpts(state) {
  if (!state.features.length) return [{ value: '', label: t('live.noMatchups'), disabled: true }];
  return state.features.map((f) => ({ value: f.id, label: f.title || featureAutoTitle(f) }));
}
