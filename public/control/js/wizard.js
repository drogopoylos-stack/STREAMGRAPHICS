import { h } from './dom.js';
import { api } from './api.js';
import { store } from './store.js';
import { confirmDialog, toast, toastError, closeDrawer } from './ui.js';
import { switchTournament } from './tournaments.js';
import { DRAFT_KEY, steps, dayNames, formats, leads, palette, initials, autoTag, errorsFor, formatError, payload, parsePaste, toBroadcastDays } from './wizard-model.js';

export const id = 'new-tournament';
export const isDirty = () => false;
let host, draft, errors = {}, result = null, counts = {}, timer, sequence = 0, undo = null, tab = 0, pasteText = '', success = null, busy = false, returnReview = false, previewError = '', calendarMonth = null;
const files = new Map();
const button = (text, action, primary = false, extra = {}) => h(`button.btn${primary ? '.btn-primary' : ''}`, { type: 'button', onclick: action, ...extra }, text);
const note = (text, warn = false) => h(`div.note${warn ? '.warnbox' : ''}`, text);
const key = () => `k_${crypto.randomUUID()}`;
export function draftLabel() { try { const d = JSON.parse(localStorage.getItem(DRAFT_KEY)); return d ? `Continue tournament draft${d.name ? ` (${d.name})` : ''}` : 'Create tournament'; } catch { return 'Create tournament'; } }
export function startOver() { localStorage.removeItem(DRAFT_KEY); for(const entry of files.values())URL.revokeObjectURL(entry.url); files.clear(); draft = fresh(); success = null; errors = {}; result = null; tab = 0; pasteText = ''; undo = null; returnReview = false; window.dispatchEvent(new Event('wizard-draft-changed')); if (host) { paint(); refresh(); } }
export async function openWizard() { if(success)startOver(); await closeDrawer(); location.hash = '#/new-tournament'; if (host) show(); }
function fresh() {
  const current = store.state.tournaments.find(t => t.id === store.state.activeTournamentId);
  return { step: 1, name: '', short: '', season: '', theme: 'aegean', timezone: store.state.settings.timezone || 'Europe/Athens', designPresetId: store.state.designLibrary.defaultPresetId,
    logo: null, teams: [], seeds: [], format: 'single-elimination', options: { bestOf: 3, finalBestOf: null, thirdPlace: false, roundBestOf: {} },
    schedule: { startDate: '', broadcastDays: current?.broadcastDays?.length ? [...current.broadcastDays] : [5,6,7], times: ['18:00','20:00'], perDay: 2 }, tbdDates: false, sheet: null };
}
function loadDraft() {
  try { const raw = JSON.parse(localStorage.getItem(DRAFT_KEY)); if (raw && Array.isArray(raw.teams) && Array.isArray(raw.seeds) && raw.schedule && Array.isArray(raw.schedule.broadcastDays) && Array.isArray(raw.schedule.times) && raw.options && typeof raw.name === 'string' && typeof raw.short === 'string' && raw.step >= 1 && raw.step <= 7) return { ...fresh(), ...raw }; } catch { /* Ignore an invalid draft. */ }
  return fresh();
}
function save() { draft.savedAt = new Date().toISOString(); localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...draft, logo: null })); window.dispatchEvent(new Event('wizard-draft-changed')); updateSummary(); queuePreview(); }
export function mount(el) {
  host = el; draft = loadDraft();
  resumeSheetAction();
  document.addEventListener('keydown', e => {
    if (!host || host.hidden || success || document.querySelector('dialog[open]')) return;
    if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); next(); }
    if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); move(Math.max(draft.regenerateId ? 3 : 1, draft.step - 1)); }
    if (e.ctrlKey && e.key.toLowerCase() === 'z' && undo && draft.step === 4) { e.preventDefault(); restoreDraw(); }
  });
  paint(); refresh();
}
export function show() { if (!draft) return; paint(); refresh(); }
export function update() { updateSummary(); }
function changed(repaint = false) { save(); const warning=host?.querySelector('#wz-duplicate-name'); if(warning){const other=store.state.tournaments.find(t=>t.name.trim().toLowerCase()===draft.name.trim().toLowerCase());warning.textContent=other?`Another tournament is called ${other.name}. Use a different name to tell them apart.`:'';} if (repaint) paint(); }
function input(label, path, value, oninput, props = {}, hint = '') {
  const control = h('input.input', { id: `wz-${path}`, 'aria-invalid': errors[path] ? 'true' : null, 'aria-describedby': `wz-error-${path}`, value: value ?? '', oninput: e => { oninput(e.target.value); changed(); }, ...props });
  return h('label.field', { for: `wz-${path}` }, h('span.field-label', label), control, hint ? h('span.hint', hint) : null, h('span.err', { id: `wz-error-${path}`, role: 'alert', 'data-error': path }, errors[path] ?? ''));
}
function check(label, value, action, path = '') {
  return h('label.check-row', h('input', { type: 'checkbox', checked: value, onchange: e => { action(e.target.checked); changed(true); } }), label, h('span.err', { id: `wz-error-${path}`, role: 'alert', 'data-error': path }, errors[path] ?? ''));
}
function select(label, path, value, choices, action) {
  return h('label.field', h('span.field-label', label), h('select.input', { id: `wz-${path}`, value, onchange: e => { action(e.target.value); changed(true); } }, choices.map(([v,l]) => h('option', { value: v, selected: String(v) === String(value) }, l))));
}
function segment(label, name, values) {
  return h('div.field', h('span.field-label', label), h('div.seg', values.map(([v,l]) => h('button', { type: 'button', 'aria-pressed': draft.options[name] === v ? 'true' : 'false', onclick: () => { draft.options[name] = v; changed(true); } }, l))));
}
function logoPicker(k, label, url = '') {
  function pick(file) {
    if (!file) return;
    if (files.has(k)) URL.revokeObjectURL(files.get(k).url);
    files.set(k, { file, url: URL.createObjectURL(file) });
    if (k !== 'league') draft.teams.find(t => t.key === k).hadLogo = true;
    changed(true);
  }
  return h('label.logo-pick', { ondragover: e => e.preventDefault(), ondrop: e => { e.preventDefault(); pick(e.dataTransfer.files[0]); } },
    files.has(k) ? h('img', { src: files.get(k).url, alt: '' }) : url ? h('img', { src: url, alt: '' }) : label,
    h('input', { type: 'file', accept: 'image/png,image/svg+xml,image/webp', 'aria-label': label, onchange: e => pick(e.target.files[0]) }));
}
function paint() {
  if (!host) return;
  if (success) { paintSuccess(); return; }
  const step = draft.step;
  const rail = h('nav.wz-rail', { 'aria-label': 'Tournament setup steps' }, steps.map((name,i) => {
    const n = i + 1, invalid = n < step && Object.keys(errorsFor(draft,n)).length;
    const allowed = (!draft.regenerateId || n >= 3) && Array.from({length:n-1},(_,j)=>j+1).every(j => !Object.keys(errorsFor(draft,j)).length);
    return h(`button.wz-step${n === step ? '.is-current' : invalid ? '.is-error' : n < step ? '.is-done' : ''}`, { type:'button', disabled: !allowed && n !== step, 'aria-current': n === step ? 'step' : null, onclick: () => move(n) }, h('i', n < step && !invalid ? '✓' : n), h('span', name));
  }));
  const main = h('main.wz-main', h('h2', { id:'wz-title', tabindex:-1, 'aria-live':'polite', 'aria-label':`Step ${step} of 7, ${steps[step-1]}` }, steps[step-1]), h('p.lead', draft.format === 'gsl' && step === 4 ? 'Seeds are spread over the groups in a snake: 1 and 2 are in different groups.' : leads[step-1]), ...[nameStep,teamsStep,formatStep,seedingStep,scheduleStep,sheetStep,reviewStep][step-1]());
  host.replaceChildren(h('div.wz', h('header.wz-head', h('div', h('div.section-title', draft.regenerateId ? 'Regenerate bracket' : 'Create tournament'), h('p.section-sub', 'Teams, format, bracket and schedule in a few steps. Nothing is created until you press Create.')), button('✕ Close · draft is kept', () => location.hash = '#/live')),
    rail, main, h('details.wz-side', { open: true }, h('summary','Your tournament'), h('div.sum', { id:'wz-summary' })),
    h('footer.wz-foot', button('← Back', () => move(step-1), false, { disabled:step <= (draft.regenerateId ? 3 : 1) }), h('span.saved', { id:'wz-saved' }, 'Draft saved'), button('Start over', startOver), h('span.spacer'), h('span.hint', `Step ${step} of 7`), button(step === 7 ? busy ? 'Creating…' : draft.regenerateId ? 'Replace bracket' : 'Create tournament' : `Next: ${steps[step]} →`, next, true, { id:'wz-next', disabled:busy }))));
  updateSummary(); paintPreview();
}
function updateSummary() {
  const el = host?.querySelector('#wz-summary'); if (!el || !draft) return;
  const data = [['Name',draft.name || 'Not named yet'],['Teams',draft.teams.length],['Format',formats.find(f => f.id === draft.format)?.label],['Matches',result?.counts.matches ?? '—'],['Schedule', draft.tbdDates ? 'Dates TBD' : `${draft.schedule.broadcastDays.map(d=>dayNames[d-1]).join(', ')} · ${result?.counts.days ?? '—'} days`],['Sheet',draft.sheet ? 'Connected after Create · sync off' : 'Later']];
  el.replaceChildren(...data.map(([k,v])=>h('div',h('span',k),h('b',v))));
  const saved = host.querySelector('#wz-saved'); if (saved && draft.savedAt) saved.textContent = `Draft saved · ${new Date(draft.savedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}`;
}
function move(n) {
  if (n < (draft.regenerateId ? 3 : 1) || n > 7) return;
  draft.step = n; errors = {}; save(); paint(); host.querySelector('#wz-title')?.focus();
}
async function next() {
  if (busy) return;
  errors = errorsFor(draft, draft.step);
  if (Object.keys(errors).length) { paint(); focusError(); return; }
  if (draft.step === 7) { await create(); return; }
  move(returnReview && [1,2,3,4,5,6].every(n=>!Object.keys(errorsFor(draft,n)).length) ? 7 : draft.step+1);
}
function focusError() {
  const first = Object.keys(errors)[0]; const field = host.querySelector(`#wz-${CSS.escape(first)}`) || host.querySelector('.wz-main input,.wz-main button');
  field?.setAttribute('aria-invalid','true'); field?.focus(); field?.scrollIntoView({block:'center'});
}
function nameStep() {
  const name = input('Tournament name *','name',draft.name,v=>{draft.name=v;if(!draft.shortEdited){draft.short=initials(v);const el=host.querySelector('#wz-short');if(el)el.value=draft.short;}}, {maxlength:100},'Shown as {tournament} on graphics.');
  const duplicate = store.state.tournaments.find(t=>t.name.trim().toLowerCase()===draft.name.trim().toLowerCase());
  return [name, h('p.warn',{id:'wz-duplicate-name',role:'status'},duplicate?`Another tournament is called ${duplicate.name}. Use a different name to tell them apart.`:''),
    h('div.grid2', input('Short name','short',draft.short,v=>{draft.short=v.toUpperCase();draft.shortEdited=true;},{maxlength:8},'Up to 8 characters.'), input('Season','season',draft.season,v=>draft.season=v,{maxlength:80})),
    h('div.field-label','Colours and background'),h('div.grid2', ['aegean','sparta'].map(theme=>h(`button.theme${draft.theme===theme?'.on':''}`,{type:'button','aria-pressed':draft.theme===theme?'true':'false',onclick:()=>{draft.theme=theme;changed(true);}},h('div.img',{style:{backgroundImage:`url(/brand/${theme}-main.jpg)`}},h('b',theme)),h('div.sw',theme==='aegean'?'Navy · gold · sky blue':'Black · crimson · gold')))),
    select('Graphics design','designPresetId',draft.designPresetId,store.state.designLibrary.presets.map(p=>[p.id,p.name]),v=>draft.designPresetId=v), h('span.hint','A preset from the Graphics designer library.'),
    h('div.field',h('span.field-label','Tournament logo'),logoPicker('league','PNG / SVG / WebP · choose or drop a logo'),h('span.hint','Until then the trophy emblem is shown.')),
    h('details',h('summary','Advanced'),input('Timezone','timezone',draft.timezone,v=>draft.timezone=v))];
}
function addTeam(row = {}) {
  const k=key(), color=palette[draft.teams.length%palette.length]; draft.teams.push({key:k,name:'',tag:'',colors:{primary:color,secondary:color},...row});draft.seeds.push(k);changed(true);
}
function teamsStep() {
  const rows = h('div.team-list', draft.teams.map((team,i)=>h('div.team-row', h('span',i+1), team.tbd ? null : logoPicker(team.key,'+ logo',team.logo),
    team.tbd ? h('div', 'To be decided') : h('div',input('Team name',`name-${team.key}`,team.name,v=>team.name=v),team.copy ? h('span.src',`copied from ${team.sourceName} with ${team.playerCount||0} players`) : team.hadLogo&&!files.has(team.key) ? h('span.warn','logo not kept, pick it again') : null),
    team.tbd ? null : input('Tag',`tag-${team.key}`,team.tag,v=>team.tag=v.toUpperCase(),{maxlength:5}),team.tbd ? null : h('input',{type:'color',value:team.colors.primary,'aria-label':`Colour for ${team.name}`,oninput:e=>{team.colors={primary:e.target.value,secondary:e.target.value};changed();}}),
    button('✕',()=>{draft.teams=draft.teams.filter(t=>t.key!==team.key);draft.seeds=draft.seeds.filter(k=>k!==team.key);changed(true);},false,{'aria-label':`Remove ${team.name||'place'}`}))));
  const tabs = h('div.tabs',{role:'tablist'},['Add one by one','Paste a list','Copy from a tournament'].map((name,i)=>h(`button${i===tab?'.on':''}`,{type:'button',role:'tab','aria-selected':i===tab?'true':'false',onclick:()=>{tab=i;paint();}},name)));
  let controls;
  if(tab===0){
    let edited=false;const name=h('input.input',{id:'wz-add-name',placeholder:'Team name','aria-label':'New team name',oninput:e=>{if(!edited)tag.value=autoTag(e.target.value);}}), tag=h('input.input',{placeholder:'Tag','aria-label':'New team tag',maxlength:5,oninput:()=>edited=true});
    const add=()=>{if(!name.value.trim()){name.focus();return;}addTeam({name:name.value.trim(),tag:tag.value.trim().toUpperCase()||autoTag(name.value)});host.querySelector('#wz-add-name')?.focus();};
    name.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();add();}};tag.onkeydown=name.onkeydown;
    controls=h('div.addrow',name,tag,button('Add team',add,true));
  } else if(tab===1){
    const parsed=parsePaste(pasteText,draft.teams);const summary=h('p.hint',parsed.summary), add=button(`Add ${parsed.rows.length} teams`,()=>{const p=parsePaste(pasteText,draft.teams);for(const row of p.rows){const color=palette[draft.teams.length%12],k=key();draft.teams.push({key:k,...row,colors:{primary:color,secondary:color}});draft.seeds.push(k);}pasteText='';changed(true);},true);
    controls=h('div',h('textarea.input',{id:'wz-paste','aria-label':'One team per line, optional tag after comma or tab',value:pasteText,placeholder:'Team Phantasma, TP\nWolves Legion',oninput:e=>{pasteText=e.target.value;const p=parsePaste(pasteText,draft.teams);summary.textContent=p.summary;add.textContent=`Add ${p.rows.length} teams`;}}),summary,add);
  } else controls=button('Choose tournament and teams…',copyDialog,true);
  return [h('span.err',{role:'alert','data-error':'teams'},errors.teams??''),rows,button('＋ Add a place to be decided',()=>addTeam({tbd:true})),tabs,controls];
}
async function copyDialog() {
  const selectEl=h('select.input',{'aria-label':'Copy from tournament'},store.state.tournaments.map(t=>h('option',{value:t.id},t.name)));
  const list=h('div.team-list'),players=h('input',{type:'checkbox',checked:true});let source;
  const copyBtn=button('Copy teams',()=>{const selected=[...list.querySelectorAll('input:checked')].map(e=>source.teams.find(t=>t.id===e.value));for(const t of selected){if(draft.teams.some(x=>x.name.toLowerCase()===t.name.toLowerCase()))continue;const k=key();draft.teams.push({key:k,name:t.name,tag:t.tag,logo:t.logo,colors:t.colors,copy:{tournamentId:selectEl.value,teamId:t.id,players:players.checked},sourceName:store.state.tournaments.find(x=>x.id===selectEl.value)?.name,playerCount:players.checked?source.players.filter(p=>p.teamId===t.id).length:0});draft.seeds.push(k);}dlg.close();changed(true);},true);
  const foot=h('p.hint');const load=async()=>{try{source=await api.get(`/api/tournaments/${selectEl.value}/wizard`);list.replaceChildren(...source.teams.map(t=>h('label.check-row',h('input',{type:'checkbox',value:t.id,onchange:()=>copyBtn.textContent=`Copy ${list.querySelectorAll('input:checked').length} teams`}),t.logo?h('img',{src:t.logo,width:24,height:24,alt:''}):null,`${t.name} · ${source.players.filter(p=>p.teamId===t.id).length} players`)));foot.textContent=`Copies are independent: changing a team here does not change it in ${store.state.tournaments.find(t=>t.id===selectEl.value)?.name}. Logos and photos are copied.`;}catch(e){foot.textContent=e.message;}};
  selectEl.onchange=load;
  const dlg=h('dialog.dialog',h('h2','Copy from a tournament'),selectEl,list,h('label.check-row',players,'Copy their players and rosters too'),foot,h('div.dialog-actions',button('Cancel',()=>dlg.close()),copyBtn));document.body.append(dlg);dlg.onclose=()=>dlg.remove();dlg.showModal();await load();
}
function formatStep() {
  const n=draft.teams.length;
  const cards=h('div.cards',{role:'radiogroup','aria-label':'Tournament format'},formats.map(f=>{
    const reason=formatError(f,n);return h(`button.card${draft.format===f.id?'.on':''}${reason?'.off':''}`,{type:'button',role:'radio','aria-checked':draft.format===f.id?'true':'false','aria-disabled':reason?'true':'false',onclick:()=>{if(reason)return;draft.format=f.id;draft.options={bestOf:3,finalBestOf:null,roundBestOf:{}};changed(true);}},h('span.diagram',{'aria-hidden':true},f.diagram),h('div',h('h4',f.label),h('p',f.line),h(`div.${reason?'why':'meta'}`,{'data-format-count':f.id},reason||`${n} teams → ${counts[f.id]?.counts.matches??'…'} matches${f.id==='gsl'?` · ${n/4} groups of 4`:''}`)));
  }));
  const opts=[segment('Best of','bestOf',[[1,'1'],[3,'3'],[5,'5']])];
  if(draft.format!=='round-robin')opts.push(segment('Final','finalBestOf',[[null,'Same'],[3,'BO3'],[5,'BO5'],...(['single-elimination','double-elimination'].includes(draft.format)?[[7,'BO7']]:[])]));
  if(draft.format==='single-elimination')opts.push(check('Third place match',draft.options.thirdPlace,v=>draft.options.thirdPlace=v,'thirdPlace'));
  if(draft.format==='double-elimination')opts.push(check('Grand final reset',draft.options.grandFinalReset,v=>draft.options.grandFinalReset=v),h('span.hint','If the lower-bracket team wins the grand final, a second final decides the title.'));
  if(draft.format==='round-robin')opts.push(check('Home and away (everyone plays twice)',draft.options.double,v=>draft.options.double=v));
  const rounds=result?.brackets.flatMap(b=>b.rounds)??[];
  opts.push(h('details',h('summary','Advanced ▸ Best of per round'),...rounds.filter((r,i,all)=>all.findIndex(x=>x.id===r.id)===i).map(r=>select(r.name,`round-${r.id}`,draft.options.roundBestOf?.[r.id]??'', [['','Same'],[1,'1'],[3,'3'],[5,'5']],v=>{draft.options.roundBestOf??={};if(v)draft.options.roundBestOf[r.id]=Number(v);else delete draft.options.roundBestOf[r.id];}))));
  const byes=2**Math.ceil(Math.log2(n))-n;
  return [cards,h('span.err',{role:'alert','data-error':'format'},errors.format??''),h('div.panel',...opts),byes&&['single-elimination','double-elimination'].includes(draft.format)?note(`With ${n} teams, seeds ${Array.from({length:byes},(_,i)=>i+1).join(' and ')} get a bye in the first round.`):null,h('div', {id:'wz-warnings'})];
}
function reorder(from,to) { if(to<0||to>=draft.seeds.length)return;const [k]=draft.seeds.splice(from,1);draft.seeds.splice(to,0,k);changed(true);host.querySelector(`[data-seed="${to}"]`)?.focus();host.querySelector('#wz-seed-announcement').textContent=`${teamName(k)}, seed ${to+1}`; }
function restoreDraw(){if(!undo)return;draft.seeds=undo;undo=null;changed(true);toast('Random draw undone.');}
function seedingStep() {
  const list=h('div',draft.seeds.map((k,i)=>h('div.seed',{tabindex:0,draggable:true,'data-seed':i,'aria-label':`Seed ${i+1}, ${teamName(k)}`,ondragstart:e=>e.dataTransfer.setData('text/plain',String(i)),ondragover:e=>e.preventDefault(),ondrop:e=>{e.preventDefault();reorder(Number(e.dataTransfer.getData('text/plain')),i);},onkeydown:e=>{if(e.altKey&&['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();reorder(i,i+(e.key==='ArrowUp'?-1:1));}}},h('span.grip','⠿'),h('b.n',i+1),h('div',teamName(k),draft.teams.find(t=>t.key===k)?.seedHint?h('small.src',draft.teams.find(t=>t.key===k).seedHint):null),h('div',button('↑',()=>reorder(i,i-1),false,{'aria-label':`Move ${teamName(k)} up`}),button('↓',()=>reorder(i,i+1),false,{'aria-label':`Move ${teamName(k)} down`})) )));
  const previous=h('select.input',{'aria-label':'Seed by tournament result',onchange:async e=>{if(e.target.value)await seedBy(e.target.value);}},h('option',{value:''},'Seed by tournament result ▾'),store.state.tournaments.map(t=>h('option',{value:t.id},t.name)));
  return [h('div.chips',button('⇅ Random draw',()=>{undo=[...draft.seeds];for(let i=draft.seeds.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[draft.seeds[i],draft.seeds[j]]=[draft.seeds[j],draft.seeds[i]];}if(draft.seeds.join()===undo.join())draft.seeds.reverse();changed(true);toast(h('span','Random draw applied. ',button('Undo',restoreDraw)));}),button('Reverse',()=>{draft.seeds.reverse();changed(true);}),undo?button('Undo',restoreDraw):null),previous,h('div.seeds',list,h('div',{id:'wz-first-round','aria-live':'polite'})),h('div',{id:'wz-seed-announcement',role:'status'})];
}
async function seedBy(id) {
  try {
    const source=await api.get(`/api/tournaments/${id}/wizard`), name=store.state.tournaments.find(t=>t.id===id).name;
    const ranks=source.ranking??[];let found=0;
    const ranked=draft.seeds.map((k,i)=>{const t=draft.teams.find(t=>t.key===k),old=source.teams.find(s=>s.id===t.copy?.teamId||s.id===t.sourceTeamId)||source.teams.find(s=>s.tag?.toUpperCase()===t.tag?.toUpperCase())||source.teams.find(s=>s.name?.toLowerCase()===t.name?.toLowerCase());const rank=ranks.findIndex(x=>x===old?.id);if(rank>=0){found++;t.seedHint=`${rank+1} in ${name}`;}return{k,i,rank:rank<0?Infinity:rank};});
    ranked.sort((a,b)=>a.rank-b.rank||a.i-b.i);draft.seeds=ranked.map(x=>x.k);changed(true);toast(`${found} teams seeded by ${name}. ${draft.seeds.length-found} had no result there and were placed last.`);
  } catch(e){toastError(e);}
}
function teamName(k) { return draft.teams.find(t=>t.key===k)?.name || 'To be decided'; }
function scheduleStep() {
  const s=draft.schedule;
  const days=h('div.field',h('span.field-label','Broadcast days'),h('div.chips',dayNames.map((d,i)=>h(`button.chip${s.broadcastDays.includes(i+1)?'.on':''}`,{type:'button','aria-pressed':s.broadcastDays.includes(i+1)?'true':'false',onclick:()=>{s.broadcastDays=s.broadcastDays.includes(i+1)?s.broadcastDays.filter(x=>x!==i+1):[...s.broadcastDays,i+1].sort();changed(true);}},d))),h('span.err',{role:'alert','data-error':'broadcastDays'},errors.broadcastDays??''));
  const times=h('div.field',h('span.field-label','Start times'),h('div.day-times',s.times.map((time,i)=>h('div',h('input.input',{type:'text',value:time,'aria-label':`Start time ${i+1}`,placeholder:'18:00',onchange:e=>{s.times[i]=e.target.value;s.times=[...new Set(s.times)].sort();changed(true);}}),button('✕',()=>{s.times.splice(i,1);changed(true);},false,{'aria-label':`Remove ${time}`}))),button('＋ time',()=>{s.times.push('');changed(true);})),h('span.hint',`${draft.timezone} · the tournament timezone.`),h('span.err',{role:'alert','data-error':'times'},errors.times??''));
  return [h('div.grid2',h('div.form-stack',input('First match day','startDate',s.startDate,v=>{s.startDate=v;calendarMonth=null;},{type:'date',disabled:draft.tbdDates}),s.startDate&&s.startDate<new Date().toISOString().slice(0,10)?h('p.warn','The first match day is in the past.'):null,days,times,input('Matches per day','perDay',s.perDay,v=>s.perDay=Number(v),{type:'number',min:1,max:12},'Up to the number of start times.'),s.perDay>s.times.length?h('p.warn','Some matches will share a start time.'):null,check('Leave dates empty (TBD), plan later',draft.tbdDates,v=>draft.tbdDates=v)),h('div',{id:'wz-calendar','aria-live':'polite'}))];
}
function sheetStep() {
  return [h(`label.choice${!draft.sheet?'.on':''}`,h('input',{type:'radio',name:'sheet',checked:!draft.sheet,onchange:()=>{draft.sheet=null;changed(true);}}),h('div',h('h4','Later'),h('p','Edit dates and scores here in the control panel. Recommended for a first setup.'))),h(`label.choice${draft.sheet?'.on':''}`,h('input',{type:'radio',name:'sheet',checked:!!draft.sheet,onchange:()=>{draft.sheet={url:'',sheetName:'Matches'};changed(true);}}),h('div.sheet-fields',h('h4','Connect a Google Sheet'),h('p','Paste the link of a sheet shared as Anyone with the link → Viewer.'),draft.sheet?input('Google Sheet URL','sheetUrl',draft.sheet.url,v=>draft.sheet.url=v,{type:'url'}):null,draft.sheet?input('Sheet name','sheetName',draft.sheet.sheetName,v=>draft.sheet.sheetName=v):null,h('p.hint',"After you press Create, download the match list (CSV) and paste it into the sheet's Matches tab. Sync starts when you turn it on in the next screen, so the new matches are never overwritten by an empty sheet.")))];
}
function reviewStep() {
  const p=payload(draft),preset=store.state.designLibrary.presets.find(x=>x.id===draft.designPresetId);
  const data=[['Name & look',`${draft.name} · ${draft.short} · ${draft.theme}`,1],['Teams',`${draft.teams.length} places`,2],['Format',formats.find(f=>f.id===draft.format)?.label,3],['Seeding',draft.seeds.map(teamName).join(' → '),4],['Schedule',draft.tbdDates?'Dates TBD':`${draft.schedule.broadcastDays.map(d=>dayNames[d-1]).join(', ')} · ${draft.schedule.times.join(', ')}`,5],['Google Sheet',draft.sheet?'Link saved · sync off':'Later',6]];
  return [h('div.err',{id:'wz-server-error',role:'alert',tabindex:-1},errors.server??''),h('div.rev',h('div.panel',h('div.panel-title','Summary'),data.map(([name,value,step])=>h('div.row',h('span',name),h('div',value,button('Edit',()=>{returnReview=true;move(step);},false,{disabled:!!draft.regenerateId&&step<3}))))),h('div.panel',h('div.panel-title','What will be created'),h('div.checklist',h('div',`A new tournament workspace “${draft.name}”`),h('div',`${p.teams.length} teams (${draft.teams.filter(t=>!t.tbd&&!t.logo&&!files.has(t.key)).length} without a logo yet)`),h('div',`${draft.teams.reduce((sum,t)=>sum+(t.playerCount||0),0)} players copied with their rosters`),h('div',`${result?.counts.matches??'…'} matches with dates, best-of and bracket links`),h('div',`${result?.brackets.length??'…'} bracket(s)`),h('div',`Design “${preset?.name??'Default'}” applied`),h('div','Format graphic text')),note('The current tournament stays active. You can switch after creating.'))),h('div.panel',h('div.panel-title','Bracket preview'),h('div.preview-sections',{id:'wz-bracket-preview'}))];
}
function queuePreview(){clearTimeout(timer);timer=setTimeout(refresh,250);sequence++;}
async function refresh() {
  if(!draft||success)return;const seq=++sequence,p=payload(draft);previewError='';
  if(draft.teams.length<2)return;
  const optionsFor=f=>f===draft.format?p.options:{bestOf:p.options.bestOf};
  const jobs=formats.filter(f=>!formatError(f,draft.teams.length)).map(async f=>{try{return[f.id,await api.post('/api/formats/preview',{format:f.id,teams:p.seeds,options:optionsFor(f.id)})];}catch(e){return[f.id,null,e.message];}});
  const values=await Promise.all(jobs);if(seq!==sequence)return;
  const nextCounts=Object.fromEntries(values.map(([id,r])=>[id,r]));
  let nextResult=null,error='';
  try {nextResult=await api.post('/api/formats/preview',{format:p.format,teams:p.seeds,options:p.options,...(!Object.keys(errorsFor(draft,5)).length&&p.schedule?{schedule:p.schedule}:{})});}
  catch(e){error=e.message;}
  if(seq!==sequence)return;counts=nextCounts;result=nextResult;previewError=error;updateSummary();paintPreview();
}
function slotLabel(m,side) {
  if(m[`team${side}`])return `${draft.seeds.indexOf(m[`team${side}`])+1} ${teamName(m[`team${side}`])}`;
  const source=m[`team${side}Source`],parent=result.matches.find(x=>x.id===source?.matchId);
  return source?`${source.outcome==='loser'?'Loser':'Winner'} ${parent?.bracketCode??'TBD'}`:m[`team${side}Label`]||'To be decided';
}
function matchBox(m) {return h('div.bm',{'data-code':m.bracketCode},h('span.w',`${m.bracketCode}${m.optional?' · only if needed':''} · ${m.date??'Date TBD'} ${m.time??''} · BO${m.bestOf}`),h('div.t',slotLabel(m,'A')),h('div.t',slotLabel(m,'B')));}
function paintPreview() {
  if(!host||!draft)return;
  for(const f of formats){const el=host.querySelector(`[data-format-count="${f.id}"]`);if(el&&!formatError(f,draft.teams.length))el.textContent=`${draft.teams.length} teams → ${counts[f.id]?.counts.matches??'…'} matches${f.id==='gsl'?` · ${draft.teams.length/4} groups of 4`:''}`;}
  const warnings=host.querySelector('#wz-warnings');if(warnings)warnings.replaceChildren(...(draft.format==='double-elimination'?[note(draft.options.grandFinalReset?'The second final (GF2) is played only if the lower-bracket team wins the first. It is scheduled as a reserve slot.':'Without a reset, the grand final winner is champion, even if the upper-bracket team then has only one loss.',true)]:[]),...(previewError?[note(previewError,true)]:[]));
  if(!result)return;
  const first=host.querySelector('#wz-first-round');if(first){first.replaceChildren(h('h3','First round'),...result.brackets.map(b=>h('div',h('h4',b.name),...b.rounds[0].matches.map(id=>matchBox(result.matches.find(m=>m.id===id))))));}
  const bracket=host.querySelector('#wz-bracket-preview');if(bracket){bracket.replaceChildren(...result.brackets.map(b=>{
    const sides=draft.format==='double-elimination'?['upper','lower','final']:[null];
    const third=draft.format==='single-elimination'?b.rounds.find(r=>r.id==='third-place'):null;
    return h('section',h('h3',b.name),...sides.map(side=>h('div',side?h('h4',side==='upper'?'Upper bracket':side==='lower'?'Lower bracket':'Grand final'):null,h('div.brk',...b.rounds.filter(r=>(!side||r.side===side)&&r!==third).map(r=>h('div.col',h('h5',r.name),...r.matches.map(id=>matchBox(result.matches.find(m=>m.id===id))),third&&r.name==='Final'?h('div',h('h5','Third place'),...third.matches.map(id=>matchBox(result.matches.find(m=>m.id===id)))):null))))));
  }));}
  paintCalendar();
}
function paintCalendar(){
  const el=host.querySelector('#wz-calendar');if(!el)return;
  if(draft.tbdDates){el.replaceChildren(note(`${result.matches.length} matches · all dates and times TBD`));return;}
  if(!result.counts.first){el.replaceChildren(note('Choose your first match day to preview the calendar.'));return;}
  const months=[...new Set(result.matches.filter(m=>m.date).map(m=>m.date.slice(0,7)))].sort();
  calendarMonth=months.includes(calendarMonth)?calendarMonth:months[0];const index=months.indexOf(calendarMonth),start=new Date(`${calendarMonth}-01T00:00:00Z`),offset=(start.getUTCDay()+6)%7,last=new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+1,0)).getUTCDate();
  const cells=Array.from({length:offset},()=>h('div.d.out'));
  for(let day=1;day<=last;day++){const date=`${calendarMonth}-${String(day).padStart(2,'0')}`,wd=new Date(`${date}T00:00:00Z`).getUTCDay()||7,ms=result.matches.filter(m=>m.date===date).sort((a,b)=>a.time.localeCompare(b.time));cells.push(h(`div.d${ms.length?'.has':draft.schedule.broadcastDays.includes(wd)?'.pd':''}`,day,...ms.map(m=>h('em',`${m.time} ${m.bracketCode}${m.optional?' · only if needed':''}`))));}
  el.replaceChildren(h('div.chips',button('‹',()=>{calendarMonth=months[index-1];paintCalendar();},false,{disabled:index<=0}),h('b',start.toLocaleDateString('en-GB',{month:'long',year:'numeric',timeZone:'UTC'})),button('›',()=>{calendarMonth=months[index+1];paintCalendar();},false,{disabled:index>=months.length-1})),h('div.cal',...dayNames.map(d=>h('div.h',d)),...cells),note(`${result.counts.matches} matches on ${result.counts.days} days · ${result.counts.first} → ${result.counts.last}.`),draft.format==='single-elimination'&&result.matches.some(m=>m.bracketCode==='F'&&m.date>result.matches.find(x=>x.bracketCode==='SF1')?.date)?h('p.hint','The Final waits for the next broadcast day after the semifinals.'):null);
}
async function create(){
  for(let step=1;step<=6;step++){const e=errorsFor(draft,step);if(Object.keys(e).length){draft.step=step;errors=e;paint();focusError();return;}}
  if(draft.regenerateId&&!await confirmDialog({title:'Replace bracket',body:`Replace the ${draft.oldMatchCount} generated matches and the bracket? Teams and players stay.`,ok:'Replace bracket'}))return;
  busy=true;errors={};paint();
  try{
    const response=draft.regenerateId?await api.put(`/api/tournaments/${draft.regenerateId}/wizard`,payload(draft)):await api.post('/api/tournaments/wizard',payload(draft));
    success={...response,name:draft.name,previous:store.state.tournaments.find(t=>t.id===store.state.activeTournamentId)?.name,previousId:store.state.activeTournamentId,sheet:draft.sheet,missingLogos:draft.teams.filter(t=>!t.tbd&&!t.logo&&!files.has(t.key)).length,missingPlayers:draft.teams.filter(t=>!t.tbd&&!t.playerCount).length,failures:0};
    localStorage.removeItem(DRAFT_KEY);paintSuccess();
    const uploads=[...files].filter(([k])=>k==='league'||response.teamIds[k]);
    let done=0;for(const[k,{file}]of uploads){const line=host.querySelector('#wz-upload-progress');if(line)line.textContent=`Uploading ${uploads.length} logos… ${done}/${uploads.length}`;const fd=new FormData();fd.append('file',file,file.name);try{await api.post(k==='league'?`/api/tournaments/${response.tournament.id}/brand/league-logo`:`/api/tournaments/${response.tournament.id}/teams/${response.teamIds[k]}/logo`,fd);}catch{success.failures++;}done++;}
    await store.load();paintSuccess();files.clear();
  }catch(e){errors.server=e.message;success=null;paint();host.querySelector('#wz-server-error')?.focus();}
  finally{busy=false;if(!success)paint();}
}
function paintSuccess(){
  const s=success;if(!s)return;
  const switchTo=async route=>{if(store.state.activeTournamentId!==s.tournament.id)await switchTournament(s.tournament.id,route);else if(route)location.hash=`#/${route}`;};
  host.replaceChildren(h('div.wz',h('header.wz-head',h('div.section-title','Create tournament')),h('main.wz-main',{style:{gridColumn:'1 / -1'}},h('div.done-hero',h('div.big','✓'),h('h2',`${s.name} is ready`),h('p.lead',`${s.created.teams} teams, ${s.created.matches} matches and the bracket were created. The current tournament is still on air.`),h('div.chips',button(`Switch to ${s.name}`,()=>switchTo('live'),true),button(`Stay on ${s.previous}`,()=>location.hash='#/live'))),h('p',{id:'wz-upload-progress',role:'status'}),s.failures?note(`${s.failures} logos could not be uploaded. Add them in Teams.`,true):null,h('div.field-label','Next steps'),s.missingLogos?note(h('span',h('b',`${s.missingLogos} teams have no logo`),button('Open Teams',()=>switchTo('teams')))):null,s.missingPlayers?note(h('span',h('b','Add players'),button('Open Players',()=>switchTo('players')))):null,note(h('span',h('b','Check the graphics'),button('Open Graphics designer',()=>switchTo('designer')))),s.sheet?note(h('span',h('b','Google Sheet'),h('a.btn',{href:`/api/tournaments/${s.tournament.id}/matches.csv`,download:''},'Download CSV'),button('Turn on sync',async()=>{if(store.state.activeTournamentId!==s.tournament.id){sessionStorage.setItem('hll-wizard-sheet-action',JSON.stringify({id:s.tournament.id,sheet:s.sheet}));await switchTo();if(store.state.activeTournamentId!==s.tournament.id)sessionStorage.removeItem('hll-wizard-sheet-action');}else{try{await api.put('/api/match-sheet',{...s.sheet,enabled:true});toast('Google Sheet sync is on.');}catch(e){toastError(e);}}}))):null),h('footer.wz-foot',h('span.spacer'),button('Close',()=>location.hash='#/live'))));
}
export async function regenerate(id){
  try{const data=await api.get(`/api/tournaments/${id}/wizard`),input=data.settings.wizard.input;
    draft={...fresh(),...input,step:3,regenerateId:id,oldMatchCount:(data.settings.brackets??[]).flatMap(b=>b.rounds.flatMap(r=>r.matches)).length,teams:data.teams.map(t=>({...t,key:t.id})),seeds:input.seeds.map(k=>k===null?null:data.teams.find(t=>t.id===k)?.id??data.teams[input.teams.findIndex(t=>t.key===k)]?.id),schedule:input.schedule?{...input.schedule,broadcastDays:toBroadcastDays(input.schedule.weekdays)}:fresh().schedule,tbdDates:!input.schedule};
    draft.seeds=draft.seeds.map(k=>{if(k)return k;const t={key:key(),tbd:true};draft.teams.push(t);return t.key;});
    // Include teams added in Teams since the original setup.
    for(const t of data.teams)if(!draft.seeds.includes(t.id))draft.seeds.push(t.id);
    success=null;errors={};save();await closeDrawer();location.hash='#/new-tournament';if(host){paint();refresh();}
  }catch(e){toastError(e);}
}

async function resumeSheetAction() {
  let action;
  try { action = JSON.parse(sessionStorage.getItem('hll-wizard-sheet-action')); } catch { return; }
  if (!action || action.id !== store.state.activeTournamentId) return;
  sessionStorage.removeItem('hll-wizard-sheet-action');
  try { await api.put('/api/match-sheet', { ...action.sheet, enabled: true }); toast('Google Sheet sync is on.'); location.hash = '#/settings'; }
  catch (error) { toastError(error); }
}
