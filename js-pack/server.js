// Only this server writes authoritative stats. Legacy tables are retained for
// migration, but browser save blobs are never accepted as score updates.
export const schema = `
  CREATE TABLE IF NOT EXISTS progress (user_id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS leaderboard (user_id TEXT PRIMARY KEY, username TEXT NOT NULL, rebirths INTEGER NOT NULL, wins INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS secure_stats (
    user_id TEXT PRIMARY KEY, username TEXT, speed INTEGER NOT NULL DEFAULT 1,
    wins INTEGER NOT NULL DEFAULT 0, rebirths INTEGER NOT NULL DEFAULT 0,
    walk_time REAL NOT NULL DEFAULT 0, avatar TEXT NOT NULL DEFAULT 'noob',
    generation INTEGER NOT NULL DEFAULT 0, session TEXT NOT NULL DEFAULT '', saved_at INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS rebirth_watch (user_id TEXT PRIMARY KEY, rebirths INTEGER NOT NULL, cheater INTEGER NOT NULL DEFAULT 0);
  CREATE INDEX IF NOT EXISTS secure_rank ON secure_stats (rebirths DESC, wins DESC);
  CREATE TABLE IF NOT EXISTS player_checkpoints (
    user_id TEXT PRIMARY KEY, state TEXT NOT NULL, generation INTEGER NOT NULL, saved_at INTEGER NOT NULL
  );
  INSERT OR IGNORE INTO secure_stats (user_id, username, speed, wins, rebirths, avatar)
    SELECT p.user_id, l.username,
      MAX(1, MIN(1000000000000, CAST(COALESCE(json_extract(p.data, '$.speed'),1) AS INTEGER))),
      MAX(0, MIN(1000000000000, CAST(COALESCE(json_extract(p.data, '$.wins'),0) AS INTEGER))),
      MAX(0, MIN(1000000000000, CAST(COALESCE(json_extract(p.data, '$.rebirths'),0) AS INTEGER))),
      COALESCE(json_extract(p.data, '$.avatar'),'noob')
    FROM progress p LEFT JOIN leaderboard l ON l.user_id=p.user_id WHERE json_valid(p.data);
`;
const AVATAR_IDS = ['noob','robot','mario','clark','spongebob','baldi','pete'];
// Worlds are bought once with Wins and stay open across rebirths.
export const WORLD_COSTS = { 1: 0, 2: 10, 3: 30, 4: 50, 5: 100 };
const defaults = () => ({ speed:1, wins:0, rebirths:0, walkTime:0, shopSpeed:0, avatar:'noob', unlocked:[1] });
const publicStats = s => ({speed:s.speed,wins:s.wins,rebirths:s.rebirths,walkTime:s.walkTime,shopSpeed:s.shopSpeed??0,avatar:s.avatar,unlocked:Array.isArray(s.unlocked)?[...s.unlocked]:[1]});
const fromRow = r => r ? ({ speed:r.speed,wins:r.wins,rebirths:r.rebirths,walkTime:r.walk_time,avatar:AVATAR_IDS.includes(r.avatar)?r.avatar:'noob',unlocked:[1] }) : defaults();
const count = v => Number.isFinite(v) ? Math.max(0,Math.min(1e12,Math.floor(v))) : 0;
const finite = v => Number.isFinite(v) ? v : 0;
export const DOOR = { half: 2 };
export const WORLD2 = { x: 2000 };
export const WORLD3 = { x: 4000 };
export const WORLD4 = { x: 6000 };
export const WORLD5 = { x: 8000 };
export const WORLD3_TRACKS = [
  { type: 'run', label: 'Crystal Run', x: -11.5, dir: -1, width: 3.8, sections: [7, 8, 9, 10], gap: 2.5, goalLength: 7, wins: 3 },
  { type: 'plates', label: 'Prism Plates', x: 11.5, dir: -1, width: 3.5, count: 16, plateLength: 2.4, gap: 1.9, goalLength: 7, wins: 4 },
  { type: 'jumps', label: 'Shard Jumps', x: -11.5, dir: 1, width: 3.3, count: 10, plateLength: 4, gapStart: 2, gapStep: 0.28, goalLength: 5, wins: 5 },
  { type: 'stairs', label: 'Crystal Rise', x: 11.5, dir: 1, width: 3.7, count: 14, sectionLength: 4.2, rise: 0.52, goalLength: 7, wins: 4 },
];
export const WORLD4_TRACKS = [
  { type: 'run', label: 'Dune Sprint', x: -11.5, dir: -1, width: 3, sections: [5, 5, 6, 6, 7, 8], gap: 3.1, goalLength: 6, wins: 5 },
  { type: 'plates', label: 'Ember Plates', x: 11.5, dir: -1, width: 3, count: 20, plateLength: 1.65, gap: 2.2, goalLength: 6, wins: 6 },
  { type: 'jumps', label: 'Lava Leaps', x: -11.5, dir: 1, width: 2.8, count: 13, plateLength: 3.4, gapStart: 2.2, gapStep: 0.3, goalLength: 5, wins: 8 },
  { type: 'stairs', label: 'Ash Climb', x: 11.5, dir: 1, width: 3, count: 18, sectionLength: 3.3, rise: 0.62, goalLength: 6, wins: 7 },
];
export const WORLD5_TRACKS = [
  { type: 'run', label: 'Aurora Run', x: -11.5, dir: -1, width: 2.9, sections: [6, 6, 7, 8, 9], gap: 3.2, goalLength: 6, wins: 9 },
  { type: 'plates', label: 'Frost Plates', x: 11.5, dir: -1, width: 2.7, count: 22, plateLength: 1.5, gap: 2.3, goalLength: 6, wins: 10 },
  { type: 'jumps', label: 'Glacier Leaps', x: -11.5, dir: 1, width: 2.6, count: 14, plateLength: 3.2, gapStart: 2.3, gapStep: 0.32, goalLength: 5, wins: 12 },
  { type: 'stairs', label: 'Summit Climb', x: 11.5, dir: 1, width: 2.9, count: 20, sectionLength: 3.1, rise: 0.66, goalLength: 6, wins: 11 },
];
// Kept as an alias for any older map code that still expects the former set.
export const EXTRA_TRACKS = WORLD3_TRACKS;
// World 2 path 1: flat-topped hills, each longer than the last, swept by a red
// kill beam just above head height. Only the flat ground between hills is safe.
// Total length matches world 1's vanishing-plate path (plates 10, 20, ... 200 long).
export const HILLS = { x: WORLD2.x - 11.5, width: 5, count: 10, first: 20, length: 2100, gap: 14, run: 3, height: 1.5,
  beamY: 2.3, beamOn: 3, beamOff: 5 };
// World 2 path 2: one long floor anchored at the goal plate. It stretches back
// to the base, waits, shrinks back into the goal plate, waits, and repeats.
export const MOVER = { x: WORLD2.x + 11.5, width: 5, length: 2400, move: 20, wait: 5, regrow: 2 }; // regrow: pause in the goal plate before stretching again
// Covered stretch as fractions of the path: [rear, front]
export function moverSpan({ phase, t }) {
  const k = Math.min(1, t / MOVER.move);
  return phase === 0 ? [1 - k, 1] : phase === 1 ? [0, 1] : phase === 2 ? [k, 1] : [1, 1];
}
function applyMover(course) {
  const [rear, front] = moverSpan(course.mover), b = course.moverBox;
  b.max.z = -7.5 - rear * MOVER.length;
  b.min.z = -7.5 - front * MOVER.length;
  b.off = front <= rear;
}
export function hillLayout() {
  const hills = [];
  const { count, first, gap } = HILLS;
  const step = (HILLS.length - (count + 1) * gap - count * first) / (count * (count - 1) / 2);
  let z = -7.5;
  for (let i = 0; i < count; i++) {
    z -= gap;
    const length = first + step * i;
    hills.push({ z0: z - length, z1: z });
    z -= length;
  }
  return { hills, end: z - HILLS.gap };
}
const SPAWNS = { 1: { x: 0, z: 0 }, 2: { x: WORLD2.x, z: 0 }, 3: { x: WORLD3.x, z: 0 }, 4: { x: WORLD4.x, z: 0 }, 5: { x: WORLD5.x, z: 0 } };
const gain = (s, amount) => Math.ceil(amount * (10 + s.rebirths) / 10);

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path === '/api/leaderboard' && request.method === 'GET') {
      const {results} = await env.DB.prepare('SELECT username,rebirths,wins FROM secure_stats WHERE username IS NOT NULL ORDER BY rebirths DESC,wins DESC LIMIT 5').all();
      return Response.json(results);
    }
    if (path !== '/api/progress') return new Response('Not found',{status:404});
    const id = request.headers.get('x-websim-user-id');
    if (!id || request.headers.get('x-websim-user-is-anonymous') === 'true') return Response.json({error:'Sign in to save progress'},{status:401});
    if (request.method === 'GET') {
      const row = await env.DB.prepare('SELECT * FROM secure_stats WHERE user_id=?').bind(id).first();
      return Response.json(fromRow(row));
    }
    // Old clients, edited fetches, and replayed localStorage blobs cannot write scores.
    return Response.json({error:'Stats are calculated by the game server. Reload to use the current game.'},{status:403});
  }
};

// The same course dimensions as track.js, without a renderer or dependencies.
// Each player has their own plate timers, matching the original course behavior.
export function makeCourse() {
  const boxes=[], ramps=[], goals=[];
  const box=(x0,x1,z0,z1,y=0,extra={})=>{
    const b={min:{x:x0,y:y-1,z:Math.min(z0,z1)},max:{x:x1,y,z:Math.max(z0,z1)},...extra}; boxes.push(b);return b;
  };
  const wall=(x0,x1,z0,z1,top=0)=>{const b=box(x0,x1,z0,z1,top+12);b.min.y=-10;};
  // Every world's 30x15 baseplate caps movement at walk speed 100
  const baseplate=(cx,z0=-7.5,z1=7.5,x0=cx-15,x1=cx+15)=>box(x0,x1,z0,z1,0,{walkSpeed:100});
  baseplate(0,-7.5,7.5,-30,15);
  const finish=(x,z,dir,length,wins,y=0,width=5)=>{
    box(x-width/2,x+width/2,z,z+dir*length,y,{walkSpeed:100});
    goals.push({x,z:z+dir*length/2,y,wins});return z+dir*length;
  };
  const walls=(x,width,end,top=0)=>{
    const a=Math.min(Math.sign(end)*7.5,end),b=Math.max(Math.sign(end)*7.5,end);
    wall(x-width/2-1,x-width/2,a,b,top);wall(x+width/2,x+width/2+1,a,b,top);
    wall(x-width/2-1,x+width/2+1,end<0?end-1:end,end<0?end:end+1,top);
  };
  let z=-7.5;
  for(let i=0;i<8;i++){
    if(i){box(-14,-9,z,z-4);z-=4;}
    const n=6+2*i;box(-14,-9,z,z-n,0,{belt:6*(i+1)*25/100});z-=n;
  }
  walls(-11.5,5,finish(-11.5,z,-1,10,1));
  z=-7.5;
  for(let i=0;i<20;i++){const n=10*(i+1);box(9,14,z,z-n,0,{vanish:true,phase:0,timer:0});z-=n;}
  walls(11.5,5,finish(11.5,z,-1,10,2));
  z=7.5;
  for(let i=0;i<20;i++){z+=3+3*i;box(-14,-9,z,z+5);z+=5;}
  walls(-11.5,5,finish(-11.5,z,1,5,2));
  const angle=20*Math.PI/180,sin=Math.sin(angle),cos=Math.cos(angle);
  let distance=10;const refuges=[];
  for(let i=0;i<10;i++){refuges.push(distance);distance+=11+3*i;}
  const length=refuges[9]+20,rise=length*sin;
  const slab=(x,width,d0,d1)=>ramps.push({minX:x-width/2,maxX:x+width/2,z0:7.5+d0*cos,z1:7.5+d1*cos,slope:sin/cos,thickness:1/cos});
  slab(11.5,8,0,length);
  refuges.forEach((d,i)=>slab(11.5+(i%2?-1:1)*6.5,5,d-2.5,d+2.5));
  walls(11.5,18,finish(11.5,7.5+length*cos,1,10,1,rise,8),rise);
  // The far short wall has a doorway to world 2, solid until you have enough wins.
  const chainDoors=[];
  const gate=(x0,x1,world)=>{const d=box(x0,x1,-DOOR.half,DOOR.half,12);d.min.y=-10;d.world=world;chainDoors.push(d);return d;};
  wall(-31,-30,-8.5,8.5);wall(15,16,-8.5,-DOOR.half);wall(15,16,DOOR.half,8.5);
  const door=box(15,16,-DOOR.half,DOOR.half,12);door.min.y=-10;
  // World 2 mirrors the world 1 base, with an always-open doorway back on its near (-x) side.
  const x0=WORLD2.x-15,x1=WORLD2.x+15;
  baseplate(WORLD2.x);
  // Worlds 3 and 4 use the same spawn-base footprint and four-lane layout as World 1.
  for (const [world, tracks] of [[WORLD3, WORLD3_TRACKS], [WORLD4, WORLD4_TRACKS], [WORLD5, WORLD5_TRACKS]]) {
    baseplate(world.x, -7.5, 7.5, world.x - 30, world.x + 15);
    for (const track of tracks) {
      let length = 0;
      if (track.type === 'run') length = track.sections.reduce((sum, section) => sum + section, 0) + track.gap * (track.sections.length - 1);
      else if (track.type === 'plates') length = track.count * track.plateLength + (track.count - 1) * track.gap;
      else if (track.type === 'jumps') length = track.count * track.plateLength + track.count * track.gapStart + track.gapStep * track.count * (track.count - 1) / 2;
      else length = track.count * track.sectionLength;
      const start = track.dir < 0 ? -7.5 : 7.5;
      const y = track.type === 'stairs' ? track.count * track.rise : 0;
      goals.push({ x: world.x + track.x, z: start + track.dir * (length + track.goalLength / 2), y, wins: track.wins });
    }
  }
  wall(x0-1,x0,-8.5,-DOOR.half);wall(x0-1,x0,DOOR.half,8.5);
  wall(x1,x1+1,-8.5,-DOOR.half);wall(x1,x1+1,DOOR.half,8.5);
  gate(x1,x1+1,2);
  // Worlds 3, 4 and 5 chain on from world 2: their forward door is gated like world 1's.
  gate(WORLD3.x+15,WORLD3.x+16,3);
  gate(WORLD4.x+15,WORLD4.x+16,5);
  wall(WORLD5.x+15,WORLD5.x+16,-8.5,8.5);
  wall(x0,HILLS.x-HILLS.width/2,-8.5,-7.5);wall(HILLS.x+HILLS.width/2,MOVER.x-MOVER.width/2,-8.5,-7.5);wall(MOVER.x+MOVER.width/2,x1,-8.5,-7.5);wall(x0,x1,7.5,8.5);
  const hx0=HILLS.x-HILLS.width/2,hx1=HILLS.x+HILLS.width/2,layout=hillLayout();
  box(hx0,hx1,-7.5,layout.end);
  for(const h of layout.hills)ramps.push({minX:hx0,maxX:hx1,z0:h.z0,z1:h.z1,hill:HILLS.height,slope:HILLS.height/HILLS.run,thickness:HILLS.height+1});
  walls(HILLS.x,HILLS.width,finish(HILLS.x,layout.end,-1,10,2));
  const mx0=MOVER.x-MOVER.width/2,mx1=MOVER.x+MOVER.width/2;
  const moverBox=box(mx0,mx1,-7.5,-7.5-MOVER.length);
  walls(MOVER.x,MOVER.width,finish(MOVER.x,-7.5-MOVER.length,-1,10,4));
  const beamZone={minX:hx0,maxX:hx1,minZ:layout.end,maxZ:-7.5};
  for(const side of [-1,1]) {
    const gaps=side<0?[[-14,-9],[9,14]]:[[-14,-9],[2.5,20.5]];
    let x=-15;
    for(const [a,b] of gaps){if(a>x)wall(x,Math.min(a,15),side<0?-8.5:7.5,side<0?-7.5:8.5);x=Math.max(x,b);}
    if(x<15)wall(x,15,side<0?-8.5:7.5,side<0?-7.5:8.5);
  }
  // Query the stationary horizontal axis, so even a very long swept move
  // examines just nearby course geometry, with no speed-dependent cell loop.
  const index={x:new Map(),z:new Map()};
  for(const axis of ['x','z']){
    const size=axis==='x'?4:16;
    for(const b of boxes)for(let cell=Math.floor((b.min[axis]-.5)/size);cell<=Math.floor((b.max[axis]+.5)/size);cell++){
      if(!index[axis].has(cell))index[axis].set(cell,[]);
      index[axis].get(cell).push(b);
    }
  }
  // Indexed above at full length; from here on it only covers part of that
  const course={boxes,ramps,goals,index,door,chainDoors,beamZone,beam:{on:false,t:HILLS.beamOff},moverBox,mover:{phase:0,t:0},vanish:boxes.filter(b=>b.vanish),zones:boxes.filter(b=>b.walkSpeed),ball:{wait:1.5,d:0,speed:0,scale:0,active:false,length,sin,cos}};
  applyMover(course);
  return course;
}
// Add a static client-side prop collider to the same spatial index used by movement.
export function addCourseCollider(course, min, max) {
  const box = { min: { ...min }, max: { ...max } };
  course.boxes.push(box);
  for (const axis of ['x', 'z']) {
    const size = axis === 'x' ? 4 : 16;
    for (let cell = Math.floor((box.min[axis] - 0.5) / size); cell <= Math.floor((box.max[axis] + 0.5) / size); cell++) {
      if (!course.index[axis].has(cell)) course.index[axis].set(cell, []);
      course.index[axis].get(cell).push(box);
    }
  }
  return box;
}
export function createSim(stats=defaults()) {
  return {pos:{x:0,y:0,z:0},vel:{x:0,y:0,z:0},grounded:false,floor:null,ramp:null,coyote:0,
    dead:0,n:0,world:1,jumpBuffer:0,stats,course:makeCourse(),input:{x:0,z:0,jump:false,slow:false},time:0};
}
export function resetSim(s) {
  const spawn=SPAWNS[s.world]??SPAWNS[1];
  Object.assign(s.pos,{x:spawn.x,y:0,z:spawn.z});Object.assign(s.vel,{x:0,y:0,z:0});s.grounded=false;s.floor=null;s.ramp=null;s.coyote=0;s.jumpBuffer=0;s.dead=0;s.n++;
}
export function teleportToWorld(s, world) {
  if (![1, 2, 3, 4, 5].includes(world) || world === s.world) return false;
  s.world = world;
  resetSim(s);
  return true;
}
// Plain data only: used both for reconciliation and server-written checkpoints.
export function captureSim(s) {
  const vector=v=>[v.x,v.y,v.z];
  return {v:1,p:vector(s.pos),vel:vector(s.vel),g:s.grounded,f:s.course.boxes.indexOf(s.floor),
    ramp:s.course.ramps.indexOf(s.ramp),c:s.coyote,jb:s.jumpBuffer,d:s.dead,n:s.n,w:s.world,time:s.time,
    stats:publicStats(s.stats),ball:{...s.course.ball},beam:{...s.course.beam},mover:{...s.course.mover},
    plates:s.course.vanish.map(b=>[b.phase,b.timer])};
}
export function restoreSim(s,state) {
  if(state?.v!==1 || ![...state.p??[],...state.vel??[]].every(Number.isFinite) ||
    state.p?.length!==3 || state.vel?.length!==3 || !Number.isFinite(state.time) ||
    !Array.isArray(state.plates) || state.plates.length!==s.course.vanish.length ||
    !state.ball || !Object.values(state.ball).every(v=>typeof v==='boolean'||Number.isFinite(v)))return false;
  [s.pos.x,s.pos.y,s.pos.z]=state.p;[s.vel.x,s.vel.y,s.vel.z]=state.vel;
  s.grounded=!!state.g;s.floor=s.course.boxes[state.f]??null;s.ramp=s.course.ramps[state.ramp]??null;
  s.coyote=finite(state.c);s.jumpBuffer=finite(state.jb);s.dead=finite(state.d);s.n=count(state.n);s.world=[1,2,3,4,5].includes(state.w)?state.w:1;s.time=state.time;
  s.stats={...state.stats};
  Object.assign(s.course.ball,state.ball);
  if(typeof state.beam?.on==='boolean'&&Number.isFinite(state.beam.t))Object.assign(s.course.beam,state.beam);
  if([0,1,2,3].includes(state.mover?.phase)&&Number.isFinite(state.mover.t)){Object.assign(s.course.mover,state.mover);applyMover(s.course);}
  state.plates.forEach(([phase,timer],i)=>Object.assign(s.course.vanish[i],{phase,timer,off:phase===2}));
  return true;
}
export function advanceSim(s,elapsed) {
  // A stalled room must not multiply next tick's workload by ten. Swept
  // collisions still handle fast movement with these bounded substeps.
  const dt=Math.max(0,Math.min(.2,elapsed)),steps=Math.ceil(dt*120);
  for(let i=0;i<steps;i++)stepSim(s,dt/steps);
}
function advancePlayer(p,now) {
  const dt=Math.max(0,Math.min(.2,(now-p.lastTick)/1000));
  p.lastTick=now;
  if(!p.ready)return;
  // An edge takes effect at receipt, never retroactively at the last tick.
  // Apply the same timeout rule when an input arrives between room ticks.
  const active=Math.max(0,Math.min(dt,(p.lastInput+1500-now)/1000+dt));
  advanceSim(p.sim,active);
  if(now>=p.lastInput+1500)p.sim.input={x:0,z:0,jump:false,slow:false};
  advanceSim(p.sim,dt-active);
}
// Runs ~120 times a second for every player, so it avoids allocating: garbage
// collection pauses here stall the whole room.
const LOW={x:.5,y:0,z:.5},HIGH={x:.5,y:2,z:.5},OTHER={x:['y','z'],y:['x','z'],z:['x','y']},hits=[];
function sweep(s,axis,delta,step=false) {
  if(!delta)return null;
  const p=s.pos,start=p[axis],end=start+delta,lo=Math.min(start,end)-LOW[axis],hi=Math.max(start,end)+HIGH[axis];
  const [o1,o2]=OTHER[axis],fixed=o1==='y'?o2:o1;
  const face=b=>delta>0?b.min[axis]-HIGH[axis]:b.max[axis]+LOW[axis];
  hits.length=0;
  const candidates=axis==='x'?s.course.index.z.get(Math.floor(p.z/16)):s.course.index.x.get(Math.floor(p.x/4));
  for(const b of candidates??[]){
    // The non-vertical other axis can't change during this sweep, so filter on it too.
    if(!b.off&&lo<b.max[axis]&&hi>b.min[axis]&&p[fixed]-LOW[fixed]<b.max[fixed]&&p[fixed]+HIGH[fixed]>b.min[fixed])hits.push(b);
  }
  if(hits.length>1)hits.sort((a,b)=>delta>0?face(a)-face(b):face(b)-face(a));
  for(const b of hits){
    if(!(p[o1]-LOW[o1]<b.max[o1]&&p[o1]+HIGH[o1]>b.min[o1]&&p[o2]-LOW[o2]<b.max[o2]&&p[o2]+HIGH[o2]>b.min[o2]))continue;
    if(step&&b.max.y-p.y<=.6){p.y=b.max.y;if(s.vel.y<0)s.vel.y=0;continue;}
    p[axis]=delta>0?Math.min(end,face(b)):Math.max(end,face(b));return b;
  }
  p[axis]=end;return null;
}
// Slabs rise from the base edge; hills ramp up, run flat, and ramp down again.
const rampHeight=(p,r)=>p.x+.5<=r.minX||p.x-.5>=r.maxX||p.z<r.z0||p.z>r.z1?null:
  r.hill?Math.min(r.hill,(p.z-r.z0)*r.slope,(r.z1-p.z)*r.slope):(p.z-7.5)*r.slope;
function rampBlocked(s,step) {
  for(const r of s.course.ramps){const h=rampHeight(s.pos,r);
    if(h===null||s.pos.y>=h||s.pos.y+2<=h-r.thickness)continue;
    if(h-s.pos.y>.6+Math.abs(step)*r.slope)return true;
    s.pos.y=h;if(s.vel.y<0)s.vel.y=0;
  }return false;
}
function obstacles(s,dt) {
  const beam=s.course.beam;
  beam.t-=dt;
  if(beam.t<=0){beam.on=!beam.on;beam.t=beam.on?HILLS.beamOn:HILLS.beamOff;}
  const m=s.course.mover;
  m.t+=dt;
  const span=m.phase===1?MOVER.wait:m.phase===3?MOVER.regrow:MOVER.move;
  if(m.t>=span){m.t-=span;m.phase=(m.phase+1)%4;}
  applyMover(s.course);
  for(const b of s.course.vanish){
    if(!b.phase)continue;
    b.timer-=dt;
    if(b.timer<=0){if(b.phase===1){b.phase=2;b.off=true;b.timer=3;}else{b.phase=0;b.off=false;}}
  }
  const b=s.course.ball;
  if(!b.active){b.wait-=dt;if(b.wait>0)return;b.active=true;b.d=b.length-4.5;b.speed=0;b.scale=0;}
  b.speed=Math.min(b.speed+15*dt,30);b.d-=b.speed*dt;
  b.scale=b.d>15?Math.min(1,b.scale+dt*3):b.scale-dt*6;
  if(b.scale<=0){b.active=false;b.wait=1.5;}
}
export function stepSim(s,dt) {
  s.time+=dt;obstacles(s,dt);
  if(s.dead>0){s.dead-=dt;if(s.dead<=0)resetSim(s);return;}
  const p=s.pos,v=s.vel,i=s.input,oldX=p.x,oldZ=p.z;
  const unlocked=Array.isArray(s.stats.unlocked)?s.stats.unlocked:[1,2,3,4,5];
  s.course.door.off=unlocked.includes(2);
  for(const d of s.course.chainDoors)d.off=unlocked.includes(d.world);
  const zone=s.course.zones.some(b=>p.x>=b.min.x&&p.x<=b.max.x&&p.z>=b.min.z&&p.z<=b.max.z&&p.y>=b.max.y-.1&&p.y<=b.max.y+2.5);
  const stat=zone?100:i.normalSpeed?1:i.maxSpeed?s.stats.speed:i.slow?Math.min(s.stats.speed,100):s.stats.speed;
  const scale=stat/100,max=6*scale;
  if(zone){const speed=Math.hypot(v.x,v.z);if(speed>6){v.x*=6/speed;v.z*=6/speed;}}
  const belt=s.grounded?s.floor?.belt??0:0;
  const wx=i.x*max,wz=i.z*max+belt;
  const dx=wx-v.x,dz=wz-v.z,len=Math.hypot(dx,dz);
  const accel=(s.grounded?50:25)*Math.max(1,scale)*dt;
  if(len){const k=Math.min(1,accel/len);v.x+=dx*k;v.z+=dz*k;}
  s.coyote = belt ? 0 : s.grounded ? 0.1 : s.coyote-dt;
  s.jumpBuffer=Math.max(0,s.jumpBuffer-dt);
  if(i.jump||i.pressed)s.jumpBuffer=.12;
  i.pressed=false;
  if(s.jumpBuffer>0&&s.coyote>0){v.y=11;s.coyote=0;s.jumpBuffer=0;}
  if(!i.jump&&v.y>0)v.y*=Math.pow(.45,dt*20);
  v.y=Math.max(v.y-30*dt,-40);
  if(sweep(s,'x',v.x*dt,true))v.x=0;
  if(rampBlocked(s,p.x-oldX)){p.x=oldX;v.x=0;}
  if(sweep(s,'z',v.z*dt,true))v.z=0;
  if(rampBlocked(s,p.z-oldZ)){p.z=oldZ;v.z=0;}
  const lastRamp=s.ramp;s.grounded=false;s.floor=null;s.ramp=null;
  const hit=sweep(s,'y',v.y*dt);
  if(hit){if(v.y<0){s.grounded=true;if(hit.vanish&&!hit.phase){hit.phase=1;hit.timer=3;}}v.y=0;}
  const hStep=Math.hypot(v.x,v.z)*dt;
  for(const r of s.course.ramps){
    const h=rampHeight(p,r);if(h===null)continue;
    const landing=p.y<=h&&p.y>h-r.thickness;
    const sticking=r===lastRamp&&p.y>h&&p.y-h<hStep*r.slope+.05;
    if(v.y<=0&&(landing||sticking)){p.y=h;v.y=0;s.grounded=true;s.ramp=r;}
    else if(v.y>0&&p.y<h-r.thickness&&p.y+2>h-r.thickness){p.y=h-r.thickness-2;v.y=0;}
  }
  if(s.grounded)s.floor=s.course.boxes.find(b=>!b.off&&p.x>=b.min.x&&p.x<=b.max.x&&p.z>=b.min.z&&p.z<=b.max.z&&b.max.y===p.y)??null;
  if(p.y<-8){resetSim(s);return;}
  const bz=s.course.beamZone;
  if(s.course.beam.on&&p.x+.5>bz.minX&&p.x-.5<bz.maxX&&p.z>bz.minZ&&p.z<bz.maxZ&&p.y+2>HILLS.beamY){s.dead=3;v.x=v.y=v.z=0;return;}
  const ball=s.course.ball;
  if(ball.active){
    const radius=3.5*ball.scale,c={x:11.5,y:ball.d*ball.sin+ball.cos*radius,z:7.5+ball.d*ball.cos-ball.sin*radius};
    const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
    if(Math.hypot(c.x-clamp(c.x,p.x-.5,p.x+.5),c.y-clamp(c.y,p.y,p.y+2),c.z-clamp(c.z,p.z-.5,p.z+.5))<radius*.95){s.dead=3;v.x=v.y=v.z=0;return;}
  }
  // Speed accrues with elapsed alive time, including while standing still.
  s.stats.walkTime+=dt;
    if(s.stats.walkTime>=1){s.stats.walkTime-=1;s.stats.speed=Math.min(1e12,s.stats.speed+gain(s.stats,1+s.stats.wins)+(s.stats.shopSpeed??0));}
  if(s.world===1&&s.course.door.off&&p.x>15.2&&p.x<17&&Math.abs(p.z)<DOOR.half){s.world=2;resetSim(s);return;}
  // The return doorway sits in the west wall of world 2. Trigger at the
  // inside edge so the player's collision radius cannot strand them there.
  if(s.world===2&&p.x<=WORLD2.x-14.5&&p.x>WORLD2.x-17&&Math.abs(p.z)<DOOR.half+0.5){s.world=1;resetSim(s);return;}
  // The chain runs 1 -> 2 -> 3 -> 4 -> 5 and back again.
  if(s.world===2&&p.x>=WORLD2.x+15.2&&p.x<WORLD2.x+17&&Math.abs(p.z)<DOOR.half){s.world=3;resetSim(s);return;}
  if(s.world===3&&p.x>=WORLD3.x+15.2&&p.x<WORLD3.x+17&&Math.abs(p.z)<DOOR.half){s.world=4;resetSim(s);return;}
  if(s.world===3&&p.x<=WORLD3.x-29.5&&p.x>WORLD3.x-32&&Math.abs(p.z)<DOOR.half+0.5){s.world=2;resetSim(s);return;}
  if(s.world===4&&p.x<=WORLD4.x-29.5&&p.x>WORLD4.x-32&&Math.abs(p.z)<DOOR.half+0.5){s.world=3;resetSim(s);return;}
  if(s.world===4&&p.x>=WORLD4.x+15.2&&p.x<WORLD4.x+17&&Math.abs(p.z)<DOOR.half){s.world=5;resetSim(s);return;}
  if(s.world===5&&p.x<=WORLD5.x-29.5&&p.x>WORLD5.x-32&&Math.abs(p.z)<DOOR.half+0.5){s.world=4;resetSim(s);return;}
  for(const g of s.course.goals){
    if(Math.hypot(p.x-g.x,p.z-g.z)<1.2&&Math.abs(p.y-g.y)<1){
      s.stats.wins=Math.min(1e12,s.stats.wins+gain(s.stats,g.wins));s.stats.speed=1;s.stats.walkTime=0;resetSim(s);break;
    }
  }
}
export function doRebirth(s) {
  if(s.stats.wins<10*(s.stats.rebirths+1))return false;
  s.stats.rebirths++;s.stats.wins=0;s.stats.speed=1;s.stats.walkTime=0;
  // Back to the world 1 spawn: its door stays shut until 10 wins again
  s.world=1;resetSim(s);
  return true;
}

const players=new Map(), conns=new Map(), users=new Map(), recentChats=new Map(), detached=new Map();
const visible=p=>({id:p.id,name:p.name,cheater:p.cheater,dev:p.dev,avatar:p.sim.stats.avatar,x:p.sim.pos.x,y:p.sim.pos.y,z:p.sim.pos.z,r:p.r,a:p.a,d:p.sim.dead>0?1:0,n:p.sim.n});
const statMessage=p=>({type:'stats',stats:publicStats(p.sim.stats)});
async function savePlayer(p,conn,env,force=false) {
  if(!p.durable)return;
  while(p.saving){if(!force)return;await p.saving;}
  if(!force&&Date.now()-p.savedAt<10000)return;
  p.savedAt=Math.max(Date.now(),p.savedAt+1);
  const s=publicStats(p.sim.stats),stamp=p.savedAt;
  p.saving=(async()=>{
    const [result]=await env.DB.batch([
      env.DB.prepare('UPDATE secure_stats SET speed=?,wins=?,rebirths=?,walk_time=?,avatar=?,saved_at=? WHERE user_id=? AND session=? AND generation=? AND saved_at<=?')
        .bind(s.speed,s.wins,s.rebirths,s.walkTime,s.avatar,stamp,conn.userId,p.session,p.generation,stamp),
      env.DB.prepare(`INSERT INTO player_checkpoints(user_id,state,generation,saved_at)
        SELECT user_id,?,generation,? FROM secure_stats WHERE user_id=? AND session=? AND generation=? AND saved_at=?
        ON CONFLICT(user_id) DO UPDATE SET state=excluded.state,generation=excluded.generation,saved_at=excluded.saved_at`)
        .bind(JSON.stringify(captureSim(p.sim)),stamp,conn.userId,p.session,p.generation,stamp)
    ]);
    if(!result.meta.changes){conn.close(4002,'Progress session changed. Reload the game.');return;}
    if(s.rebirths!==p.watched){p.watched=s.rebirths;
      await env.DB.prepare('INSERT INTO rebirth_watch(user_id,rebirths) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET rebirths=excluded.rebirths').bind(conn.userId,s.rebirths).run();}
  })();
  try {await p.saving;} finally {p.saving=null;}
}
// Rebirths only ever go up one at a time; a bigger jump means the stats were tampered with.
async function flagCheater(p,conn,room,env) {
  const st=p.sim.stats;st.speed=1;st.wins=0;st.rebirths=0;st.walkTime=0;p.lastRebirths=0;
  if(!p.cheater){p.cheater=true;room.broadcast({type:'cheater',id:p.id,value:true});}
  if(!p.durable)return;
  await env.DB.prepare('INSERT INTO rebirth_watch(user_id,rebirths,cheater) VALUES(?,0,1) ON CONFLICT(user_id) DO UPDATE SET rebirths=0,cheater=1').bind(conn.userId).run();
  p.watched=0;
  await savePlayer(p,conn,env,true);
}
// Dev chat commands: /cheater <username> and /uncheater <username>
async function devCommand(conn,room,env,text) {
  const [cmd,arg='']=text.split(/\s+/),value=cmd==='/cheater';
  const reply=text=>conn.send({type:'chat',id:null,name:'System',text});
  const name=arg.replace(/^@/,'').toLowerCase();
  if(!name)return reply(`Usage: ${cmd} <username>`);
  const row=await env.DB.prepare('SELECT user_id,username FROM secure_stats WHERE lower(username)=?').bind(name).first();
  if(!row)return reply(`No player named @${name}`);
  await env.DB.prepare('INSERT INTO rebirth_watch(user_id,rebirths,cheater) SELECT user_id,rebirths,? FROM secure_stats WHERE user_id=? ON CONFLICT(user_id) DO UPDATE SET cheater=excluded.cheater')
    .bind(value?1:0,row.user_id).run();
  for(const p of players.values()){
    if(p.userId!==row.user_id||p.cheater===value)continue;
    p.cheater=value;room.broadcast({type:'cheater',id:p.id,value});
  }
  reply(`${value?'Tagged':'Untagged'} @${row.username} ${value?'as':'from'} cheater`);
}
// Dev chat command: /kill <username>, or /kill !ALL for everyone in the room
function killCommand(conn,arg) {
  const reply=text=>conn.send({type:'chat',id:null,name:'System',text});
  if(!arg)return reply('Usage: /kill <username> or /kill !ALL');
  const all=arg==='!ALL',name=arg.replace(/^@/,'').toLowerCase();
  const targets=[...players.values()].filter(p=>p.ready&&(all||p.name.toLowerCase()===name));
  if(!targets.length)return reply(all?'No players to kill':`No player named @${name} is here`);
  let killed=0;
  for(const p of targets){
    if(p.sim.dead>0)continue;
    p.sim.dead=3;Object.assign(p.sim.vel,{x:0,y:0,z:0});killed++;
  }
  reply(all?`Killed ${killed} player${killed===1?'':'s'}`:`Killed @${targets[0].name}`);
}
export const room={
  tickMs:100,
  async onConnect(conn,room,env){
    const durable=conn.identity==='user';let row=null;const session=crypto.randomUUID();
    let previous=null;
    if(durable){
      // One active scoring session per account, including across multiple tabs.
      const oldId=users.get(conn.userId);
      previous=players.get(oldId)??detached.get(conn.userId)?.player??null;
      const previousConn=conns.get(oldId)??detached.get(conn.userId)?.conn;
      if(previous&&previousConn)await savePlayer(previous,previousConn,env,true);
      await env.DB.prepare('INSERT INTO secure_stats(user_id,username) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET username=excluded.username').bind(conn.userId,conn.username).run();
      row=await env.DB.prepare('UPDATE secure_stats SET session=? WHERE user_id=? RETURNING *').bind(session,conn.userId).first();
      if(oldId){
        const oldConn=conns.get(oldId);
        players.delete(oldId);conns.delete(oldId);
        oldConn?.close(4002,'Game opened in another tab.');
        room.broadcast({type:'left',id:oldId});
      }
      users.set(conn.userId,conn.id);
      detached.delete(conn.userId);
    }
    const watch=durable?await env.DB.prepare('SELECT rebirths,cheater FROM rebirth_watch WHERE user_id=?').bind(conn.userId).first():null;
    const stats=fromRow(row),sim=createSim(stats),now=Date.now();
    if(durable){
      const checkpoint=await env.DB.prepare('SELECT state,generation,saved_at FROM player_checkpoints WHERE user_id=?').bind(conn.userId).first();
      if(checkpoint&&checkpoint.generation===row.generation&&checkpoint.saved_at===row.saved_at){
        try{restoreSim(sim,JSON.parse(checkpoint.state));}catch{}
        // Stats always come from the fenced scoring row.
        sim.stats=stats;
      }
    }
    const jumped=watch&&stats.rebirths>watch.rebirths+1;
    const p={id:conn.id,name:conn.username??'Guest',sim,watched:watch?.rebirths??null,lastRebirths:stats.rebirths,
      userId:conn.userId,dev:!!conn.isOwner,cheater:!!watch?.cheater,r:0,a:'idle',q:0,j:0,ready:false,durable,session,generation:row?.generation??0,lastTick:now,lastInput:now,savedAt:0,saving:false,lastStats:''};
    players.set(conn.id,p);conns.set(conn.id,conn);
    if(jumped)await flagCheater(p,conn,room,env);
    else if(durable&&!watch)await savePlayer(p,conn,env,true);
    conn.send({type:'welcome',id:conn.id,players:[...players.values()].filter(p=>p.ready).map(visible),stats:publicStats(stats),state:captureSim(sim)});
  },
  async onMessage(conn,message,room,env){
    const p=players.get(conn.id);if(!p)return;
    let m;try{m=JSON.parse(message);}catch{return;}
    if(!m||typeof m!=='object')return;
    if(m.type==='input'){
      if(!Number.isSafeInteger(m.q)||m.q<=p.q)return;
      const now=Date.now();
      advancePlayer(p,now);
      // Coordinates, speed, gains, dt, wins, rebirths and animation claims are ignored.
      const x=finite(m.ux),z=finite(m.uz),len=Math.max(1,Math.hypot(x,z));
      p.sim.input={x:x/len,z:z/len,jump:!!m.jump,slow:!!m.slow};
      const j=count(m.j);
      if(j>p.j){p.sim.jumpBuffer=.12;p.j=j;}
      p.r=finite(m.r);p.q=count(m.q);p.lastInput=now;
      // Respawns are simulation outcomes, never a browser reset counter.
      if(!p.ready){p.ready=true;room.broadcast({type:'join',player:visible(p)},{except:[conn.id]});}
    }else if(m.type==='save'){
      await savePlayer(p,conn,env);
    }else if(m.type==='rebirth'){
      if(doRebirth(p.sim)){conn.send(statMessage(p));await savePlayer(p,conn,env,true);}
      else conn.send(statMessage(p));
    }else if(m.type==='avatar'){
      if(!AVATAR_IDS.includes(m.avatar)||p.sim.stats.avatar===m.avatar)return;
      p.sim.stats.avatar=m.avatar;room.broadcast({type:'avatar',id:p.id,avatar:m.avatar});
    }else if(m.type==='chat'){
      const cid=typeof m.cid==='string'?m.cid.slice(0,100):null,key=cid?String(conn.userId??conn.id)+':'+cid:null;
      if(key&&recentChats.has(key)){conn.send({type:'chatAck',cid});return;}
      if(conn.isOwner&&/^\/kill(\s|$)/i.test(String(m.text??'').trim())){
        if(cid)conn.send({type:'chatAck',cid});
        return killCommand(conn,String(m.text).trim().split(/\s+/)[1]??'');
      }
      if(conn.isOwner&&/^\/(un)?cheater(\s|$)/i.test(String(m.text??'').trim())){
        if(cid)conn.send({type:'chatAck',cid});
        return devCommand(conn,room,env,String(m.text).trim().toLowerCase());
      }
      const text=room.censor(String(m.text??'').slice(0,500)).trim().slice(0,120);
      if(text){if(key){recentChats.set(key,true);if(recentChats.size>1024)recentChats.delete(recentChats.keys().next().value);}
        room.broadcast({type:'chat',id:p.id,name:p.name,username:conn.username??null,text,cid});}
    }
  },
  async onTick(room,env){
    const now=Date.now(),snaps=[];
    for(const p of players.values()){
      advancePlayer(p,now);
      if(!p.ready)continue;
      const s=p.sim,v=s.vel,relZ=v.z-(s.grounded?s.floor?.belt??0:0),speed=Math.hypot(v.x,relZ);
      p.a=!s.grounded?(v.y>0?'jump':'fall'):speed<.01?'idle':speed>9?'run':'walk';
      const r2=v=>Math.round(v*100)/100;
      const snap=[p.id,r2(s.pos.x),r2(s.pos.y),r2(s.pos.z),r2(p.r),p.a,s.dead>0?1:0,s.n,p.q];
      const snapKey=JSON.stringify(snap);
      if(snapKey!==p.lastSnap){p.lastSnap=snapKey;snaps.push(snap);}
      conns.get(p.id)?.send({type:'self',t:now,receivedAt:p.lastInput,q:p.q,state:captureSim(s)});
      if(s.stats.rebirths-p.lastRebirths>1)await flagCheater(p,conns.get(p.id),room,env);
      p.lastRebirths=s.stats.rebirths;
      const key=JSON.stringify([s.stats.speed,s.stats.wins,s.stats.rebirths]);
      if(key!==p.lastStats){p.lastStats=key;conns.get(p.id)?.send(statMessage(p));}
    }
    if(snaps.length)room.broadcast({type:'snap',t:now,players:snaps});
    for(const [id,entry] of detached)if(now-entry.at>60000)detached.delete(id);
  },
  async onClose(conn,room,env){
    const p=players.get(conn.id);players.delete(conn.id);conns.delete(conn.id);
    const current=users.get(conn.userId)===conn.id;
    if(current){users.delete(conn.userId);if(p?.durable)detached.set(conn.userId,{player:p,conn,at:Date.now()});}
    room.broadcast({type:'left',id:conn.id});
    if(p&&(!p.durable||current))await savePlayer(p,conn,env,true);
  }
};
