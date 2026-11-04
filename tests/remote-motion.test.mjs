import test from 'node:test';
import assert from 'node:assert/strict';
import { SnapshotClock, RemoteMotion } from '../remote-motion.js';

const snap=(t,extra={})=>({t,x:t*.006,y:0,z:0,r:0,a:'walk',d:0,n:0,...extra});

test('uneven and bunched packet arrivals preserve constant movement speed',()=>{
  const clock=new SnapshotClock(),motion=new RemoteMotion(snap(0));
  const delays=[40,130,50,110,45,150,60,85];
  const queue=Array.from({length:60},(_,i)=>({state:snap(i*100),at:i*100+delays[i%delays.length]})).sort((a,b)=>a.at-b.at);
  let previous=null,maxSpeedError=0;
  for(let frame=0;frame<350;frame++){
    const now=frame*1000/60;
    while(queue.length&&queue[0].at<=now){const p=queue.shift();clock.observe(p.state.t,p.at);motion.push(p.state);}
    const p=motion.sample(clock.renderTime(now));
    if(now>600&&previous){maxSpeedError=Math.max(maxSpeedError,Math.abs((p.x-previous.x)*60-6));assert.ok(p.x>=previous.x);assert.ok(Math.abs(p.speed-6)<1e-8);}
    previous=p;
  }
  assert.ok(maxSpeedError<.04,`speed error ${maxSpeedError}`);
});

test('a delayed moving snapshot interpolates its full server interval without a fabricated pause',()=>{
  const motion=new RemoteMotion(snap(0));motion.push(snap(0));motion.push(snap(300));
  assert.equal(motion.sample(100).x,.6);
  assert.equal(motion.sample(200).x,1.2);
  assert.equal(motion.sample(250).x,1.5);
});

test('a brief buffer underrun extrapolates at most 100 ms',()=>{
  const motion=new RemoteMotion(snap(0));motion.push(snap(0));motion.push(snap(100));
  assert.ok(Math.abs(motion.sample(150).x-.9)<1e-9);
  assert.equal(motion.sample(200).x,1.2);
  assert.equal(motion.sample(5000).x,1.2);
});

test('idle players do not drift beyond their final position',()=>{
  const motion=new RemoteMotion(snap(0));motion.push(snap(0));motion.push(snap(100,{a:'idle'}));
  assert.equal(motion.sample(2000).x,.6);
  assert.equal(motion.sample(2000).speed,0);
});

test('respawns and deaths are discrete and stale packets cannot rewind a player',()=>{
  const motion=new RemoteMotion(snap(0));motion.push(snap(0));motion.push(snap(100));
  assert.equal(motion.push(snap(200,{x:0,n:1})),true);
  assert.equal(motion.sample(150).x,0);
  assert.equal(motion.push(snap(150,{x:50,n:0})),false);
  assert.equal(motion.sample(250).x,0);
  assert.equal(motion.push(snap(300,{x:0,n:1,d:1})),true);
  assert.equal(motion.sample(400).d,1);
});

test('rotation takes the short path around the angle boundary',()=>{
  const motion=new RemoteMotion(snap(0));motion.push(snap(0,{r:Math.PI-.1}));motion.push(snap(100,{r:-Math.PI+.1}));
  assert.ok(Math.abs(motion.sample(50).r-Math.PI)<1e-8);
});

test('clock playback stays monotonic when packet latency spikes or the baseline changes',()=>{
  const clock=new SnapshotClock();let previous=-Infinity;
  for(let i=0;i<200;i++){
    const now=i*100+500;
    clock.observe(i*100,i*100+(i<80?40:200)+(i%7)*15);
    const t=clock.renderTime(now);assert.ok(t>previous);previous=t;
  }
  clock.reset();assert.equal(clock.offset,null);
});
