import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { previewTournament } from '../server/formats/wizard.js';
import { generateTournament } from '../server/formats/index.js';
import { bracketTree, syncBracket, resolvedTournament } from '../server/bracket.js';
import { teamErrors, parsePaste } from '../public/control/js/wizard-model.js';

const folder = path.resolve('jobs/e2e/dataB'), output = path.resolve('jobs/e2e/outB');
const config = (format = 'single-elimination', n = 8) => ({ name: `Wizard ${format}`, short: 'WIZ', season: '', theme: 'aegean', teams: Array.from({length:n},(_,i)=>({key:`k${i}`,name:`Team ${i}`,tag:`T${i}`})), seeds:Array.from({length:n},(_,i)=>`k${i}`), format, options: {bestOf:3,thirdPlace:format==='single-elimination'}, schedule:{startDate:'2026-12-04',weekdays:[5,6,0],times:['20:00','18:00'],perDay:2} });

test('wizard preview uses sorted times, Sunday conversion and third place before the final', () => {
  const p=previewTournament(config());
  assert.deepEqual(p.counts,{matches:8,days:4,first:'2026-12-04',last:'2026-12-11'});
  assert.deepEqual([...new Set(p.matches.map(m=>m.date))],['2026-12-04','2026-12-05','2026-12-06','2026-12-11']);
  assert.equal(p.matches.find(m=>m.bracketCode==='3P').time,'18:00');
  assert.equal(p.matches.find(m=>m.bracketCode==='F').time,'20:00');
  const input=config();input.schedule.perDay=1;
  const single=previewTournament(input),third=single.matches.find(m=>m.bracketCode==='3P'),final=single.matches.find(m=>m.bracketCode==='F');
  assert.ok(`${third.date}T${third.time}` < `${final.date}T${final.time}`);
});

test('wizard duplicate tags identify both rows and paste skips existing names', () => {
  const rows=[{key:'a',name:'Alpha',tag:'VTX'},{key:'b',name:'Beta',tag:'vtx'}];
  assert.equal(Object.values(teamErrors(rows)).filter(s=>s.includes('Tag VTX')).length,2);
  assert.equal(parsePaste('Alpha\nBeta\nGamma\nDelta\nEpsilon\nZeta',rows.slice(0,1)).rows.length,5);
});

test('wizard optional reset champion falls back only when the upper finalist wins GF', () => {
  for(const lowerWins of [false,true]) {
    const teams=['a','b','c','d'],r=generateTournament({format:'double-elimination',teams,options:{grandFinalReset:true}});
    const db={teams:teams.map(id=>({id})),matches:r.matches,settings:{brackets:r.brackets}};
    for(const m of db.matches){if(m.bracketCode==='GF2')break;syncBracket(db);m.scoreA=m.bracketCode==='GF'&&lowerWins?0:2;m.scoreB=m.bracketCode==='GF'&&lowerWins?2:0;m.status='done';syncBracket(db);}
    const gf=resolvedTournament(db).matches.find(m=>m.bracketCode==='GF');
    assert.equal(bracketTree(db).champion?.id??null,lowerWins?null:gf.winnerId);
  }
});

test('wizard HTTP validates atomically, copies independent rosters, regenerates and backs up deletion', async t => {
  fs.mkdirSync(folder,{recursive:true});
  const teams=Array.from({length:3},(_,i)=>({id:`source${i}`,name:`Source ${i}`,tag:`S${i}`,logo:`/media/teams/source${i}.svg`,colors:{primary:'#445566',secondary:'#778899'}}));
  const players=teams.flatMap(team=>Array.from({length:5},(_,i)=>({id:`${team.id}p${i}`,teamId:team.id,nick:`Player ${i}`,photo:`/media/players/${team.id}p${i}.svg`,role:['Top','Jungle','Mid','Bot','Support'][i],lineup:'starter'})));
  for(const [kind,entities,field] of [['teams',teams,'logo'],['players',players,'photo']]){
    fs.mkdirSync(path.join(folder,'assets',kind),{recursive:true});
    for(const e of entities)fs.writeFileSync(path.join(folder,'assets',kind,path.basename(e[field])),'<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="red"/></svg>');
  }
  fs.writeFileSync(path.join(folder,'db.json'),JSON.stringify({settings:{leagueName:'SUPERCUP 2026'},teams,players,matches:[],live:{visible:true,scene:'schedule',params:{},rev:10}}));
  const child=spawn(process.execPath,['server/index.js'],{cwd:process.cwd(),env:{...process.env,HLL_DATA_DIR:folder,HLL_OUTPUT_DIR:output,PORT:'4612'},windowsHide:true,stdio:['ignore','pipe','pipe']});
  let logs='';child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);
  t.after(async()=>{if(child.exitCode===null){child.kill();await once(child,'exit');}});
  for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:4612/api/state')).ok)break;}catch{}if(child.exitCode!==null)assert.fail(logs);await new Promise(r=>setTimeout(r,50));}
  const req=async(url,method='GET',body)=>{const r=await fetch(`http://127.0.0.1:4612${url}`,{method,headers:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return{status:r.status,data:await r.json()};};
  const initial=(await req('/api/state')).data;
  const before=fs.readFileSync(path.join(folder,'db.json'),'utf8');
  const bad=[{...config(),name:''},{...config(),short:'123456789'},{...config(),seeds:['k0','k0']},{...config(),options:{bestOf:2}},{...config(),sheet:{url:'https://invalid.test'}},{...config(),schedule:{...config().schedule,times:['25:00']}}];
  for(const body of bad){assert.equal((await req('/api/tournaments/wizard','POST',body)).status,400);assert.equal(fs.readFileSync(path.join(folder,'db.json'),'utf8'),before);}
  assert.equal((await req('/api/formats/preview','POST',{format:'gsl',teams:['a','b','c','d','e','f']})).status,400);
  let first;
  for(const [format,n] of [['single-elimination',6],['double-elimination',8],['gsl',8],['round-robin',5]]){
    const input=config(format,n);input.sheet={url:'https://docs.google.com/spreadsheets/d/test123/edit',sheetName:'Matches'};
    if(format==='gsl')input.schedule=null;
    if(!first)input.teams.slice(0,3).forEach((team,i)=>team.copy={tournamentId:initial.activeTournamentId,teamId:teams[i].id,players:true});
    const preview=(await req('/api/formats/preview','POST',{...input,teams:input.seeds})).data;
    const created=await req('/api/tournaments/wizard','POST',input);assert.equal(created.status,200,JSON.stringify(created.data));
    const row=created.data;const data=(await req(`/api/tournaments/${row.tournament.id}/wizard`)).data;
    assert.equal(data.matches.length,preview.matches.length);
    const byCode=new Map(data.matches.map(m=>[m.bracketCode,m]));
    for(const m of preview.matches){const c=byCode.get(m.bracketCode);for(const k of ['date','time','bestOf','optional','stage'])assert.equal(c[k],m[k]);for(const side of ['A','B']){
      assert.equal(c[`team${side}`],m[`team${side}`]?row.teamIds[m[`team${side}`]]:null);
      const source=m[`team${side}Source`],actual=c[`team${side}Source`];
      assert.equal(actual?.outcome,source?.outcome);
      assert.equal(data.matches.find(x=>x.id===actual?.matchId)?.bracketCode,preview.matches.find(x=>x.id===source?.matchId)?.bracketCode);
    }}
    for(const bracket of preview.brackets){const saved=data.settings.brackets.find(b=>b.id===bracket.id);assert.deepEqual(saved.rounds.map(r=>r.matches.map(id=>data.matches.find(m=>m.id===id).bracketCode)),bracket.rounds.map(r=>r.matches.map(id=>preview.matches.find(m=>m.id===id).bracketCode)));}
    if(!first){first=row;assert.equal(data.players.length,15);assert.deepEqual(row.tournament.broadcastDays,[5,6,7]);
      assert.ok(data.teams.filter(t=>t.sourceTeamId).every(t=>t.logo.includes(t.id)));
      assert.ok(data.players.every(p=>p.photo.includes(p.id)&&fs.existsSync(path.join(folder,'assets/players',`${p.id}.svg`))));
    }
    if(input.schedule===null)assert.ok(data.matches.every(m=>m.date===null&&m.time===null));
    const saved=JSON.parse(fs.readFileSync(path.join(folder,'db.json'))).tournaments.find(t=>t.id===row.tournament.id).data;
    assert.equal(saved.settings.matchSheet.enabled,false);
    const state=(await req('/api/state')).data;assert.equal(state.activeTournamentId,initial.activeTournamentId);assert.equal(state.live.visible,true);
  }
  const id=first.tournament.id, data=(await req(`/api/tournaments/${id}/wizard`)).data;
  const body={...config('single-elimination',6),teams:data.teams.map(t=>({...t,key:t.id})),seeds:data.teams.map(t=>t.id),schedule:null};
  const replaced=await req(`/api/tournaments/${id}/wizard`,'PUT',body);assert.equal(replaced.status,200);
  const next=(await req(`/api/tournaments/${id}/wizard`)).data;assert.equal(next.players.length,15);assert.ok(next.matches.every(m=>!data.matches.some(old=>old.id===m.id)));
  const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect x="5" y="5" width="30" height="30" fill="red"/></svg>');
  for(const url of [`/api/tournaments/${id}/teams/${next.teams[0].id}/logo`,`/api/tournaments/${id}/brand/league-logo`]){
    const form=new FormData();form.append('file',new Blob([svg],{type:'image/svg+xml'}),'logo.svg');
    const upload=await fetch(`http://127.0.0.1:4612${url}`,{method:'POST',body:form});assert.equal(upload.status,200);
    assert.equal((await req('/api/state')).data.activeTournamentId,initial.activeTournamentId);
  }
  await req(`/api/tournaments/${id}/activate`,'POST');
  const team=next.teams[0];assert.equal((await req(`/api/teams/${team.id}`,'PUT',{name:'Independent copy'})).status,200);
  assert.equal((await req(`/api/tournaments/${initial.activeTournamentId}/wizard`)).data.teams[0].name,'Source 0');
  const manual=await req('/api/matches','POST',{stage:'Unrelated manual match',teamA:team.id,teamB:next.teams[1].id});assert.equal(manual.status,200);
  assert.equal((await req(`/api/tournaments/${id}/wizard`,'PUT',body)).status,200);
  const regenerated=(await req(`/api/tournaments/${id}/wizard`)).data;
  assert.ok(regenerated.matches.some(m=>m.id===manual.data.id));
  const match=regenerated.matches.find(m=>m.bracketCode);
  assert.equal((await req(`/api/matches/${match.id}`,'PUT',{scoreA:2,scoreB:0,status:'done'})).status,200);
  assert.equal((await req(`/api/tournaments/${id}/wizard`,'PUT',body)).status,409);
  assert.equal((await req('/api/tournaments')).data.tournaments.find(t=>t.id===id).canRegenerate,false);
  await req(`/api/tournaments/${initial.activeTournamentId}/activate`,'POST');
  assert.equal((await req(`/api/tournaments/${initial.activeTournamentId}`,'DELETE',{confirm:'SUPERCUP 2026'})).status,409);
  assert.equal((await req(`/api/tournaments/${id}`,'DELETE',{confirm:'wrong'})).status,400);
  assert.equal((await req(`/api/tournaments/${id}`,'DELETE',{confirm:first.tournament.name})).status,200);
  assert.ok(fs.readdirSync(path.join(folder,'backups')).some(f=>f.startsWith(id)));
});
