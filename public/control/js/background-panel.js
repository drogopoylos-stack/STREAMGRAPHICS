import { h } from './dom.js';
import { api } from './api.js';
import { store } from './store.js';
import { t } from './strings.js';
import { panel, ctlSelect, field, dropZone, btn, busy, toast, toastError } from './ui.js';

export function backgroundPanel() {
  const select = ctlSelect();
  const zone = dropZone({ src: store.state.settings.theme.bgImage, ratio: '16 / 9', onFile: async file => {
    try {
      const background = await api.backgroundUpload(file);
      await store.load();
      update(store.state);
      select.set(background.id);
      zone.setSrc(background.url);
      toast(t('graphics.backgroundUploaded'), 'ok');
    } catch (error) { toastError(error); }
  } });
  const apply = async scope => {
    const background = store.state.backgrounds?.find(item => item.id === select.get());
    if (!background) { toast(t('graphics.chooseBackground'), 'error'); return; }
    const theme = scope === 'social' ? { socialBgImage: background.url } : { bgImage: background.url, versusBgImage: background.url, socialBgImage: background.url };
    try { await api.put('/api/settings', { theme }); store.refresh(); toast(t('common.saved'), 'ok'); }
    catch (error) { toastError(error); }
  };
  const all = btn(t('graphics.backgroundAll'), { size: 'sm', kind: 'primary' });
  const social = btn(t('graphics.backgroundSocial'), { size: 'sm' });
  all.addEventListener('click', () => busy(all, () => apply('all')));
  social.addEventListener('click', () => busy(social, () => apply('social')));
  const reset = btn(t('graphics.backgroundReset'), { size: 'sm', onclick: async () => {
    try { await api.put('/api/settings', { theme: { bgImage: null, versusBgImage: null, socialBgImage: null } }); zone.setSrc(null); store.refresh(); }
    catch (error) { toastError(error); }
  } });
  select.el.addEventListener('change', () => zone.setSrc(store.state.backgrounds?.find(item => item.id === select.get())?.url ?? null));
  const el = panel(t('graphics.backgroundTitle'), h('p.panel-sub', t('graphics.backgroundHint')), zone,
    field(t('live.background'), select), h('div.panel-actions', all, social, reset));
  function update(state) {
    select.setOptions([{ value: '', label: t('graphics.chooseBackground') }, ...(state.backgrounds ?? []).map(item => ({ value: item.id, label: item.name }))]);
  }
  update(store.state);
  return { el, update };
}
