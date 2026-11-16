import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, encodeCsv, prepareSheet, createSheetSync, sheetConfig, matchFeed, feedCsv } from '../server/match-sheet.js';
import { resolveMatches } from '../server/bracket.js';

const header = ['match_id','date','time','team_a','team_b','score_a','score_b','status','best_of','stage','cast','source_a','source_b','id'];
function fixture() {
  const matches = [
    {id:'m1',bracketCode:'1',teamA:'a',teamB:'b',bestOf:3,status:'scheduled',scoreA:null,scoreB:null,date:'2026-11-06',time:'18:00',stage:'First'},
    {id:'m2',bracketCode:'2',teamA:'c',teamB:null,teamBSource:{matchId:'m1',outcome:'winner'},bestOf:3,status:'scheduled',scoreA:null,scoreB:null,date:null,time:null,stage:'Final'},
  ];
  return {settings:{leagueName:'Cup',timezone:'Europe/Athens',matchSheet:sheetConfig({url:'https://docs.google.com/spreadsheets/d/test-id/edit',enabled:true})},teams:[... 'abc'].map(id=>({id,tag:id.toUpperCase(),name:id.toUpperCase()})),players:[{id:'p'}],matches,live:{visible:true,rev:7}};
}
const csv = rows => encodeCsv([header,...rows]);
const rows = () => [
 ['1','2026-11-06','18:00','A','B','','','scheduled','3','First','yes','','','m1'],
 ['2','','','C','Winner 1','','','scheduled','3','Final','tbd','','W:1','m2'],
];
test('CSV handles real quoted fields, BOM, zero scores and rejects malformed input',()=>{
 assert.deepEqual(parseCsv('\uFEFFid,note\r\n1,"line 1\nline 2, ""quoted"""\r\n'),[['id','note'],['1','line 1\nline 2, "quoted"']]);
 for(const bad of ['a,"broken','a,"end"oops','ab"c,d']) assert.throws(()=>parseCsv(bad));
 assert.equal(parseCsv(encodeCsv([['=HYPERLINK("x")']]))[0][0][0],"'");
 const r=rows();r[0][5]='0';r[0][6]='1';r[0][7]='live';
 const out=prepareSheet(fixture(),csv(r));assert.equal(out.matches[0].scoreA,0);assert.equal(out.matches[1].scoreA,null);
});
test('full snapshot resolves a batch of completed rounds without clearing authoritative scores',()=>{
 const r=rows();r[0][5]='2';r[0][6]='0';r[0][7]='done';r[1][5]='0';r[1][6]='2';r[1][7]='done';
 const db=fixture(),before=structuredClone(db),out=prepareSheet(db,csv(r.reverse()));
 assert.deepEqual(db,before);assert.equal(out.matches[1].teamB,'a');assert.equal(out.matches[1].scoreB,2);
 assert.equal(resolveMatches({...db,...out})[1].winnerId,'a');
});
test('bad identities, dates, formats, teams and partial snapshots are rejected atomically',()=>{
 for(const mutate of [r=>r.pop(),r=>r[1][13]='m1',r=>r[0][1]='2026-02-31',r=>r[0][2]='25:00',r=>r[0][3]='UNKNOWN',r=>r[0][5]='',r=>r[1][12]='W:2',r=>r[0][6]='9']) {
   const db=fixture(),before=structuredClone(db),r=rows();r[0][5]='2';r[0][6]='0';r[0][7]='done';mutate(r);
   assert.throws(()=>prepareSheet(db,csv(r)));assert.deepEqual(db,before);
 }
});
test('upstream corrections cannot silently reassign played descendant results',()=>{
 const db=fixture(),r=rows();r[0][5]='2';r[0][6]='0';r[0][7]='done';r[1][5]='2';r[1][6]='0';r[1][7]='done';
 Object.assign(db,prepareSheet(db,csv(r)));
 r[0][5]='0';r[0][6]='2';assert.throws(()=>prepareSheet(db,csv(r)),/participants changed/);
 r[1][5]=r[1][6]='';r[1][7]='scheduled';const fixed=prepareSheet(db,csv(r));assert.equal(fixed.matches[1].teamB,'b');
});
test('polls retain last good state on failure and sync the configured inactive tournament',async()=>{
 const cup=fixture(),hll={settings:{},matches:[]};let active='hll',changes=[];let body=csv(rows()),fail=false;
 const store={getTournament:id=>id==='cup'?cup:hll,tournaments:()=>[{id:'cup'},{id:'hll'}],changed:id=>changes.push(id)};
 const sync=createSheetSync(store,{fetcher:async()=>fail?new Response('private',{status:401}):new Response(body)});
 await sync.poll();assert.deepEqual(changes,['cup']);assert.equal(active,'hll');assert.deepEqual(hll.matches,[]);assert.ok(cup.settings.matchSheet.lastSuccess);
 const good=structuredClone(cup.matches);fail=true;await assert.rejects(sync.run('cup'),/not readable/);assert.deepEqual(cup.matches,good);
 assert.match(cup.settings.matchSheet.lastError,/401/);
 fail=false;body='<!doctype html>';await assert.rejects(sync.run('cup'),/sign-in/);assert.deepEqual(cup.matches,good);
 const feed=matchFeed(cup,'cup');assert.equal(feed.matches.length,2);assert.equal(feed.matches[0].team_a.tag,'A');assert.equal(parseCsv(feedCsv(feed)).length,3);
});
test('switching sheet configuration during a pending fetch discards the stale response',async()=>{
 const cup=fixture();let release;const wait=new Promise(r=>release=r);let saves=0;
 const sync=createSheetSync({getTournament:()=>cup,changed:()=>saves++},{fetcher:async()=>{await wait;return new Response(csv(rows()));}});
 const pending=sync.run('cup');cup.settings.matchSheet.enabled=false;release();
 assert.deepEqual(await pending,{skipped:true});assert.equal(saves,0);
 assert.throws(()=>sheetConfig({url:'https://evil.example/sheet',enabled:true}));
});

test('a sheet row with a decisive score advances the bracket while its status stays scheduled',()=>{
 const db=fixture();
 const next=rows();
 next[0][5]='1'; next[0][6]='2';
 const prepared=prepareSheet(db,csv(next));
 assert.equal(prepared.matches[0].status,'done');
 assert.equal(prepared.matches[1].teamB,'b');
 assert.equal(prepared.matches[1].status,'scheduled');
});
