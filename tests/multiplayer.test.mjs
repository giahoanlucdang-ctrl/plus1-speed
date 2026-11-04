import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { performance } from 'node:perf_hooks';
import { Delivery } from '../delivery.js';
import { Prediction } from '../prediction.js';
import { createSim, stepSim, advanceSim, captureSim, restoreSim, schema } from '../server.js';

// Execute the actual SQL in local SQLite; tests never write the live database.
class TestDB {
  constructor() { this.db = new DatabaseSync(':memory:'); this.db.exec(schema); this.queries = 0; }
  prepare(sql) {
    const db = this;
    return { sql, args: [], bind(...args) { this.args = args; return this; },
      execute() { db.queries++; const result=db.db.prepare(sql).run(...this.args); return {meta:{changes:result.changes}}; },
      async run() { return this.execute(); },
      async first() { db.queries++; return db.db.prepare(sql).get(...this.args) ?? null; },
      async all() { db.queries++; return {results:db.db.prepare(sql).all(...this.args)}; }
    };
  }
  async batch(queries) {
    this.db.exec('BEGIN');
    try { const out=queries.map(q=>q.execute()); this.db.exec('COMMIT'); return out; }
    catch(e) { this.db.exec('ROLLBACK'); throw e; }
  }
}
let moduleId=0;
async function fresh() { return import(`../server.js?test=${++moduleId}`); }
const input=(q,ux=0,uz=0,extra={})=>JSON.stringify({type:'input',q,ux,uz,...extra});
function connection(id,durable=false) {
  return {id,userId:durable?'user-'+id:null,username:id,identity:durable?'user':'signed_out',isOwner:false,
    sent:[],closed:null,send(m){this.sent.push(structuredClone(m));},close(code,reason){this.closed={code,reason};}};
}
function last(conn,type) { return conn.sent.findLast(m=>m.type===type); }
function transport() { return {sent:[],broadcast(m){this.sent.push(structuredClone(m));},censor:s=>s}; }
async function withClock(run) {
  const real=Date.now,clock={time:1_800_000_000_000};Date.now=()=>clock.time;
  try { await run(clock); } finally { Date.now=real; }
}

test('movement keeps flowing through a 600 ms delivery gap without waiting for ACKs',async()=>withClock(async clock=>{
  const mod=await fresh(),room=transport(),conn=connection('jitter'),env={DB:new TestDB()};
  await mod.room.onConnect(conn,room,env);
  const queue=[];const delivery=new Delivery(m=>queue.push({at:clock.time+((clock.time%2000<600)?600:0),m}),()=>clock.time);
  let maxGap=0,lastInput=clock.time;
  for(let i=0;i<100;i++){
    clock.time+=100;delivery.offerState({type:'input',ux:1,uz:0,jump:false,slow:false,r:0});
    for(const event of queue.filter(e=>e.at<=clock.time)){
      maxGap=Math.max(maxGap,clock.time-lastInput);lastInput=clock.time;
      await mod.room.onMessage(conn,JSON.stringify(event.m),room,env);queue.splice(queue.indexOf(event),1);
    }
    await mod.room.onTick(room,env);
  }
  assert.ok(maxGap<1500,`input gap ${maxGap}`);
  assert.ok(delivery.seq>=30,'movement continues without acknowledgments');
  assert.equal(last(conn,'self').state.n,0);
}));

test('late movement packets cannot overwrite newer input; browser reset counters are ignored',async()=>withClock(async clock=>{
  const mod=await fresh(),room=transport(),conn=connection('ordered'),env={DB:new TestDB()};
  await mod.room.onConnect(conn,room,env);
  await mod.room.onMessage(conn,input(2,1,0,{reset:99}),room,env);
  await mod.room.onMessage(conn,input(1,-1,0,{reset:100}),room,env);
  clock.time+=100;await mod.room.onTick(room,env);
  assert.ok(last(conn,'self').state.p[0]>0);
  assert.equal(last(conn,'self').q,2);
  assert.equal(last(conn,'self').state.n,0);
}));

test('a five-second stall has bounded simulation work and does not reset players',async()=>withClock(async clock=>{
  const mod=await fresh(),room=transport(),env={DB:new TestDB()},conns=Array.from({length:32},(_,i)=>connection('stall'+i));
  for(const conn of conns){await mod.room.onConnect(conn,room,env);await mod.room.onMessage(conn,input(1,1),room,env);}
  const queries=env.DB.queries;clock.time+=5000;await mod.room.onTick(room,env);
  for(const conn of conns){const state=last(conn,'self').state;assert.ok(state.time<=.200001);assert.equal(state.n,0);}
  assert.equal(env.DB.queries,queries,'normal ticks must not query the database');
}));

test('disconnect and reconnect restore position, velocity and obstacle timers',async()=>withClock(async clock=>{
  const mod=await fresh(),room=transport(),env={DB:new TestDB()},a=connection('resume',true);
  await mod.room.onConnect(a,room,env);await mod.room.onMessage(a,input(1,1),room,env);
  for(let i=0;i<8;i++){clock.time+=100;await mod.room.onTick(room,env);}
  const before=last(a,'self').state;
  await mod.room.onClose(a,room,env);
  const b=connection('resume',true);b.id='new-connection';
  await mod.room.onConnect(b,room,env);
  assert.deepEqual(last(b,'welcome').state,before);
  assert.ok(before.p[0]>1);
}));

test('a room restart restores the periodic server checkpoint for every signed-in player',async()=>withClock(async clock=>{
  let mod=await fresh();const room=transport(),env={DB:new TestDB()},conns=[connection('alice',true),connection('bob',true)];
  for(const conn of conns){await mod.room.onConnect(conn,room,env);await mod.room.onMessage(conn,input(1,1),room,env);}
  for(let i=0;i<7;i++){clock.time+=100;await mod.room.onTick(room,env);}
  const before=conns.map(c=>last(c,'self').state);
  clock.time+=10000;
  for(const conn of conns)await mod.room.onMessage(conn,JSON.stringify({type:'save'}),room,env);
  mod=await fresh();
  for(let i=0;i<conns.length;i++){
    const next=connection(conns[i].username,true);next.id+='-restarted';await mod.room.onConnect(next,room,env);
    assert.deepEqual(last(next,'welcome').state,before[i]);
  }
}));

test('opening another tab keeps the checkpoint and old close cannot overwrite it',async()=>withClock(async clock=>{
  const mod=await fresh(),room=transport(),env={DB:new TestDB()},a=connection('tabs',true);
  await mod.room.onConnect(a,room,env);await mod.room.onMessage(a,input(1,1),room,env);
  clock.time+=200;await mod.room.onTick(room,env);const before=last(a,'self').state;
  const b=connection('tabs',true);b.id='tab2';await mod.room.onConnect(b,room,env);
  assert.equal(a.closed.code,4002);assert.deepEqual(last(b,'welcome').state,before);
  await mod.room.onClose(a,room,env);
  await mod.room.onMessage(b,input(1,-1),room,env);clock.time+=100;await mod.room.onTick(room,env);
  await mod.room.onClose(b,room,env);
  assert.equal(b.closed,null);
}));

test('admin generation changes invalidate old position checkpoints',async()=>withClock(async()=>{
  const mod=await fresh(),room=transport(),env={DB:new TestDB()},a=connection('generation',true);
  await mod.room.onConnect(a,room,env);await mod.room.onClose(a,room,env);
  env.DB.db.prepare('UPDATE secure_stats SET generation=generation+1 WHERE user_id=?').run(a.userId);
  const restarted=await fresh(),b=connection('generation',true);
  await restarted.room.onConnect(b,room,env);
  assert.deepEqual(last(b,'welcome').state.p,[0,0,0]);
}));

test('a death resets exactly that simulation, once, and preserves vector objects',()=>{
  const a=createSim(),b=createSim(),pos=a.pos,vel=a.vel;a.dead=.02;
  advanceSim(a,.1);advanceSim(b,.1);
  assert.equal(a.n,1);assert.equal(b.n,0);assert.equal(a.pos,pos);assert.equal(a.vel,vel);
  advanceSim(a,.1);assert.equal(a.n,1);
});

test('checkpoints restore vanishing plates and ball collision deterministically',()=>{
  const a=createSim();a.pos={x:11.5,y:0,z:-9};
  for(let i=0;i<240;i++)stepSim(a,1/120);
  assert.equal(a.course.vanish[0].phase,1);
  const b=createSim();assert.equal(restoreSim(b,JSON.parse(JSON.stringify(captureSim(a)))),true);
  for(let i=0;i<600;i++){stepSim(a,1/120);stepSim(b,1/120);}
  assert.deepEqual(captureSim(a),captureSim(b));
});

test('prediction replays recent movement and ignores delayed old snapshots',()=>{
  const server=createSim(),client=createSim(),prediction=new Prediction(client);
  prediction.welcome(captureSim(server));server.input={x:1,z:0,jump:false,slow:false};
  for(let i=1;i<=24;i++)prediction.step(1/120,server.input,i*1000/120);
  advanceSim(server,.1);
  const message={t:100,receivedAt:0,state:captureSim(server)};
  // RTT 200 - send 0 - server wait 100 = 100 ms; converge the age estimate.
  for(let i=0;i<10;i++)prediction.reconcile({...message,t:100+i,receivedAt:i},0,200);
  assert.ok(client.pos.x>server.pos.x);
  const before=captureSim(client);
  prediction.reconcile({...message,state:captureSim(createSim())},0,220);
  assert.deepEqual(captureSim(client),before);
});

test('200-player physics load stays bounded after a stall',()=>{
  const players=Array.from({length:200},(_,i)=>{
    const s=createSim();s.pos.x=i%2?11.5:-11.5;s.pos.z=i%3?-10:10;
    s.input={x:0,z:-1,jump:true,slow:false};return s;
  });
  const started=performance.now();
  for(let tick=0;tick<10;tick++)for(const sim of players)advanceSim(sim,tick===0?5:.1);
  const elapsed=performance.now()-started;
  console.log(`200 players × 10 ticks: ${elapsed.toFixed(1)} ms (local CPU only)`);
  assert.ok(players.every(s=>s.time<1.101));
  assert.ok(elapsed<5000,'detect severe simulation performance regressions');
});

test('actual room messages reconcile prediction under latency, input changes and a server stall',async()=>withClock(async clock=>{
  const mod=await fresh(),room=transport(),env={DB:new TestDB()},conn=connection('latency');
  await mod.room.onConnect(conn,room,env);
  const client=createSim(),prediction=new Prediction(client);prediction.welcome(last(conn,'welcome').state);
  const base=clock.time,events=[];let current=0,q=0,maxError=0;
  const delivery=new Delivery(m=>events.push({due:current+60,kind:'input',m}),()=>current);
  conn.send=m=>events.push({due:current+60,kind:'self',m:structuredClone(m)});
  for(let frame=1;frame<=1200;frame++){
    current=frame*1000/120;clock.time=base+current;
    const input={x:Math.floor(current/1500)%2?-1:1,z:0,jump:current%2000<150,slow:false};
    prediction.step(1/120,input,current);
    if(frame%12===0)delivery.offerState({type:'input',ux:input.x,uz:input.z,jump:input.jump,slow:false,r:0});
    for(const event of [...events].filter(e=>e.due<=current)){
      events.splice(events.indexOf(event),1);
      if(event.kind==='input')await mod.room.onMessage(conn,JSON.stringify(event.m),room,env);
      else if(event.m.type==='self'){
        prediction.reconcile(event.m,delivery.sent.get(event.m.q),current);q=event.m.q;
        const error=Math.hypot(client.pos.x-event.m.state.p[0],client.pos.z-event.m.state.p[2]);maxError=Math.max(error,maxError);
      }
    }
    // Drop 800 ms of ticks once, exactly as a stalled handler would.
    if(frame%12===0&&!(current>=4000&&current<4800))await mod.room.onTick(room,env);
  }
  assert.ok(q>20);assert.equal(client.n,0);assert.ok(maxError<2,`prediction error ${maxError}`);
  console.log(`120 ms RTT + 800 ms tick stall: max replay distance ${maxError.toFixed(3)} units; no respawns`);
}));

test('a jump tap shorter than a send interval survives in the input edge counter',async()=>withClock(async clock=>{
  const mod=await fresh(),room=transport(),env={DB:new TestDB()},conn=connection('short-jump');
  await mod.room.onConnect(conn,room,env);await mod.room.onMessage(conn,input(1),room,env);
  clock.time+=100;await mod.room.onTick(room,env);
  // Press and release have both happened before this packet was sampled.
  await mod.room.onMessage(conn,input(2,0,0,{jump:false,j:1}),room,env);
  clock.time+=100;await mod.room.onTick(room,env);
  assert.ok(last(conn,'self').state.p[1]>0);
  assert.equal(last(conn,'self').state.n,0);
}));

test('input silence still stops movement instead of leaving a ghost walking forever',async()=>withClock(async clock=>{
  const mod=await fresh(),room=transport(),env={DB:new TestDB()},conn=connection('silent');
  await mod.room.onConnect(conn,room,env);await mod.room.onMessage(conn,input(1,1),room,env);
  clock.time+=100;await mod.room.onTick(room,env);
  clock.time+=2000;await mod.room.onTick(room,env);
  for(let i=0;i<5;i++){clock.time+=100;await mod.room.onTick(room,env);}
  assert.equal(last(conn,'self').state.vel[0],0);
  assert.equal(last(conn,'self').state.n,0);
}));

test('an input change does not rewrite movement earlier in the server tick',async()=>withClock(async clock=>{
  const mod=await fresh(),room=transport(),env={DB:new TestDB()},conn=connection('edges');
  await mod.room.onConnect(conn,room,env);
  await mod.room.onMessage(conn,input(1),room,env);
  clock.time+=80;
  await mod.room.onMessage(conn,input(2,1),room,env);
  clock.time+=20;await mod.room.onTick(room,env);
  const expected=createSim();
  advanceSim(expected,.08);expected.input={x:1,z:0,jump:false,slow:false};advanceSim(expected,.02);
  assert.ok(Math.abs(last(conn,'self').state.p[0]-expected.pos.x)<1e-9,
    'starting at 80 ms must simulate only 20 ms of movement');
  clock.time+=30;
  await mod.room.onMessage(conn,input(3),room,env);
  advanceSim(expected,.03);expected.input={x:0,z:0,jump:false,slow:false};advanceSim(expected,.07);
  clock.time+=70;await mod.room.onTick(room,env);
  assert.ok(Math.abs(last(conn,'self').state.p[0]-expected.pos.x)<1e-9,
    'stopping must preserve the movement before release');
}));

test('delivery sends start and stop edges immediately, even between heartbeats',()=>{
  let now=0;const sent=[],delivery=new Delivery(m=>sent.push({at:now,m}),()=>now);
  const state={type:'input',ux:0,uz:0,jump:false,j:0,slow:false,r:0};
  delivery.offerState(state);
  now=17;delivery.offerState({...state,ux:1});
  now=34;delivery.offerState(state);
  assert.deepEqual(sent.map(s=>s.at),[0,17,34]);
  for(now=35;now<250;now++)delivery.offerState({...state,r:now/100});
  assert.ok(sent.length<=5,'turning must not produce a packet on every render frame');
});

test('continuous steering is rate limited while a release always sends immediately',()=>{
  let now=0;const sent=[],delivery=new Delivery(m=>sent.push({at:now,m}),()=>now);
  const state={type:'input',ux:1,uz:1,jump:false,j:0,slow:false,r:0};
  delivery.offerState(state);
  for(now=1;now<=200;now++)delivery.offerState({...state,ux:1-now/1000});
  assert.equal(sent.length,5,'continuous steering sends at most 20 updates per second');
  now=201;delivery.offerState({...state,ux:0,uz:0});
  assert.equal(sent.at(-1).at,201);
  now=202;delivery.offerState({...state,ux:0,uz:0,j:1});
  assert.equal(sent.at(-1).at,202,'jump presses bypass the steering rate limit');
});

test('reconciliation keeps a start/stop trajectory aligned across a full round trip',()=>{
  const client=createSim(),server=createSim(),prediction=new Prediction(client);
  // Use a normal walking speed so a permissive low-speed test cannot hide jitter.
  client.stats.speed=server.stats.speed=100;
  prediction.welcome(captureSim(server));
  const dt=1/120,latency=6,frames=[];
  let maxCorrection=0;
  for(let f=1;f<=120;f++){
    const moving=f>=25&&f<65;
    const controls={x:moving?1:0,z:0,jump:false,slow:false};
    frames.push(controls);
    prediction.step(dt,controls,f*1000/120);
    server.input={...(frames[f-latency-1]??{x:0,z:0})};
    stepSim(server,dt);
    if(f%12===0){
      // Snapshot is received six frames later. The latest input was accepted
      // at this tick, so the measured RTT is exactly 100 ms.
      const message={t:f*1000/120,receivedAt:f*1000/120,state:captureSim(server)};
      frames[f-1].message=message;
    }
    const message=frames[f-latency-1]?.message;
    if(message){
      const before=client.pos.x;
      prediction.reconcile(message,message.t-50,f*1000/120);
      maxCorrection=Math.max(maxCorrection,Math.abs(client.pos.x-before));
    }
  }
  assert.ok(maxCorrection<.003,`start/stop correction ${maxCorrection.toFixed(6)} units`);
  console.log(`100 ms RTT start/stop: maximum correction ${maxCorrection.toFixed(9)} units`);
});

for(const scenario of [
  {name:'zero latency',up:0,down:0,fps:120,speed:100,jitter:0},
  {name:'100 ms RTT',up:50,down:50,fps:60,speed:100,jitter:0},
  {name:'asymmetric 200 ms RTT',up:150,down:50,fps:30,speed:100,jitter:0},
  {name:'300 ms RTT at 144 FPS',up:150,down:150,fps:144,speed:100,jitter:0},
  {name:'packet jitter',up:75,down:75,fps:60,speed:100,jitter:25},
  {name:'high speed stat on capped baseplate',up:50,down:50,fps:60,speed:300,jitter:0},
]){
  test(`real room start/stop, reversal and settling: ${scenario.name}`,async()=>withClock(async clock=>{
    const mod=await fresh(),room=transport(),env={DB:new TestDB()},conn=connection('trajectory',true);
    env.DB.db.prepare('INSERT INTO secure_stats(user_id,username,speed) VALUES(?,?,?)').run(conn.userId,conn.username,scenario.speed);
    await mod.room.onConnect(conn,room,env);
    const client=createSim(),prediction=new Prediction(client);
    prediction.welcome(last(conn,'welcome').state);
    assert.equal(client.stats.speed,scenario.speed);
    const base=clock.time,events=[],dt=1000/120;
    let now=0,lastOffer=-Infinity,packet=0,maxCorrection=0,settled=null,maxSettledDrift=0,acks=0;
    const jitter=()=>scenario.jitter*Math.sin(++packet*2.1);
    const delivery=new Delivery(m=>events.push({due:now+scenario.up+jitter(),type:'input',m}),()=>now);
    conn.send=m=>{
      if(m.type==='self')events.push({due:now+scenario.down+jitter(),type:'self',m:structuredClone(m)});
    };
    for(let f=1;f<=480;f++){
      now=f*dt;clock.time=base+now;
      const x=(f>=49&&f<97?1:0)-(f>=157&&f<205?1:0);
      const z=f>=253&&f<289?1:0;
      prediction.step(1/120,{x,z,jump:false,slow:false},now);
      // Simulate render sampling separately from the 120 Hz local physics.
      if(now-lastOffer>=1000/scenario.fps-1e-6){
        lastOffer=now;
        delivery.offerState({type:'input',ux:x,uz:z,jump:false,j:0,slow:false,r:0});
      }
      // Process the actual room handlers and their authoritative snapshots.
      for(const event of [...events].sort((a,b)=>a.due-b.due)){
        if(event.due>now)continue;
        events.splice(events.indexOf(event),1);
        if(event.type==='input')await mod.room.onMessage(conn,JSON.stringify(event.m),room,env);
        else{
          const before={...client.pos};
          prediction.reconcile(event.m,delivery.sent.get(event.m.q),now);acks++;
          maxCorrection=Math.max(maxCorrection,Math.hypot(client.pos.x-before.x,client.pos.z-before.z));
        }
      }
      if(f%12===0)await mod.room.onTick(room,env);
      if(f===420)settled={...client.pos};
      if(settled)maxSettledDrift=Math.max(maxSettledDrift,Math.hypot(client.pos.x-settled.x,client.pos.z-settled.z));
      assert.ok(Object.values(client.pos).every(Number.isFinite));
      assert.equal(client.n,0,'ordinary movement must not trigger respawns');
    }
    assert.ok(acks>=30);
    const limit=scenario.jitter?.5:scenario.fps===30?.25:.09;
    assert.ok(maxCorrection<limit,`maximum correction ${maxCorrection.toFixed(6)} >= ${limit}`);
    assert.ok(maxSettledDrift<1e-7,`idle drift ${maxSettledDrift}`);
    // conn.send now routes into the event queue, so use a final direct snapshot.
    conn.send=m=>conn.sent.push(m);clock.time+=100;await mod.room.onTick(room,env);
    const final=last(conn,'self').state;
    assert.ok(Math.hypot(client.pos.x-final.p[0],client.pos.z-final.p[2])<1e-7,'resting position agrees with the server');
    console.log(`${scenario.name}: max correction ${maxCorrection.toFixed(6)}, settled drift ${maxSettledDrift.toFixed(9)}`);
  }));
}

test('a press and release inside one room tick still moves the player',async()=>withClock(async clock=>{
  const mod=await fresh(),room=transport(),env={DB:new TestDB()},conn=connection('short-move');
  await mod.room.onConnect(conn,room,env);
  const delivery=new Delivery(m=>{pending.push(m);},()=>clock.time),pending=[];
  async function offer(ux){
    delivery.offerState({type:'input',ux,uz:0,jump:false,slow:false,r:0});
    for(const m of pending.splice(0))await mod.room.onMessage(conn,JSON.stringify(m),room,env);
  }
  await offer(0);
  clock.time+=25;await offer(1);
  clock.time+=25;await offer(0);
  clock.time+=50;await mod.room.onTick(room,env);
  const state=last(conn,'self').state;
  assert.ok(state.p[0]>0,'the server must retain a tap shorter than 100 ms');
  assert.equal(state.vel[0],0,'the player brakes after release');
  assert.equal(last(conn,'self').q,3);
}));

test('resuming after an input timeout does not move through the silent interval',async()=>withClock(async clock=>{
  const mod=await fresh(),room=transport(),env={DB:new TestDB()},conn=connection('timeout-edge');
  await mod.room.onConnect(conn,room,env);await mod.room.onMessage(conn,input(1,1),room,env);
  clock.time+=100;await mod.room.onTick(room,env);
  const expected=createSim();
  restoreSim(expected,last(conn,'self').state);
  expected.input={x:0,z:0,jump:false,slow:false};advanceSim(expected,.2);
  clock.time+=2000;await mod.room.onMessage(conn,input(2,1),room,env);
  await mod.room.onTick(room,env);
  const resumed=last(conn,'self').state;
  assert.ok(Math.abs(resumed.p[0]-expected.pos.x)<1e-9,'only existing momentum may continue during timeout braking');
  assert.equal(resumed.vel[0],0,'resuming has not yet had any simulation time to accelerate');
  clock.time+=100;await mod.room.onTick(room,env);
  assert.ok(last(conn,'self').state.p[0]>resumed.p[0]);
}));

test('server input normalization gives diagonal movement the same speed as straight movement',async()=>withClock(async clock=>{
  const mod=await fresh(),room=transport(),env={DB:new TestDB()},straight=connection('straight'),diagonal=connection('diagonal');
  for(const conn of [straight,diagonal])await mod.room.onConnect(conn,room,env);
  await mod.room.onMessage(straight,input(1,1,0),room,env);
  await mod.room.onMessage(diagonal,input(1,500,500),room,env);
  clock.time+=100;await mod.room.onTick(room,env);
  const a=last(straight,'self').state,b=last(diagonal,'self').state;
  assert.ok(Math.abs(Math.hypot(a.vel[0],a.vel[2])-Math.hypot(b.vel[0],b.vel[2]))<1e-9);
  assert.ok(Math.abs(Math.hypot(a.p[0],a.p[2])-Math.hypot(b.p[0],b.p[2]))<1e-9);
}));

test('stopping and restarting against a wall never penetrates or alternates position',()=>{
  for(const speed of [100,1000,100000]){
    const sim=createSim();sim.stats.speed=speed;
    sim.course.zones=[];
    // A custom broad wall in the actual simulation's collision index isolates
    // collision accuracy from the course's obstacles and rewards.
    const wall={min:{x:2,y:-1,z:-5},max:{x:3,y:20,z:5}};
    sim.course.boxes.push(wall);
    for(let cell=-1;cell<=0;cell++){
      if(!sim.course.index.z.has(cell))sim.course.index.z.set(cell,[]);
      sim.course.index.z.get(cell).push(wall);
    }
    let reached=false;
    for(let frame=0;frame<240;frame++){
      sim.input={x:frame%60<40?1:0,z:0,jump:false,slow:false};
      stepSim(sim,1/120);
      assert.ok(sim.pos.x<=1.5+1e-9,`wall penetration at speed ${speed}`);
      if(sim.pos.x===1.5)reached=true;
      if(reached)assert.equal(sim.pos.x,1.5,'wall contact stays at its exact face after input edges');
    }
    assert.equal(reached,true);
  }
});
