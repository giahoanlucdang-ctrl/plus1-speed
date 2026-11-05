import { progress, markDirty } from './progress.js';
import { showReward } from './reward-toast.js';

// Permanent milestones stored in the save. Once unlocked they stay unlocked,
// even after a rebirth resets wins and speed.
export const ACHIEVEMENTS = [
  { id: 'win1', name: 'First Win', desc: 'Earn your first Win', test: () => progress.wins >= 1 },
  { id: 'win10', name: 'Warming Up', desc: 'Earn 10 Wins', test: () => progress.wins >= 10 },
  { id: 'win100', name: 'Century', desc: 'Earn 100 Wins', test: () => progress.wins >= 100 },
  { id: 'win1000', name: 'Win Machine', desc: 'Earn 1,000 Wins', test: () => progress.wins >= 1000 },
  { id: 'speed100', name: 'Quick Start', desc: 'Reach 100 Speed', test: () => progress.bestSpeed >= 100 },
  { id: 'speed10k', name: 'Fast Lane', desc: 'Reach 10,000 Speed', test: () => progress.bestSpeed >= 10000 },
  { id: 'speed1m', name: 'Sonic', desc: 'Reach 1,000,000 Speed', test: () => progress.bestSpeed >= 1e6 },
  { id: 'rebirth1', name: 'Reborn', desc: 'Complete your first Rebirth', test: () => progress.rebirths >= 1 },
  { id: 'rebirth5', name: 'Veteran', desc: 'Complete 5 Rebirths', test: () => progress.rebirths >= 5 },
  { id: 'rebirth10', name: 'Legend', desc: 'Complete 10 Rebirths', test: () => progress.rebirths >= 10 },
  { id: 'world2', name: 'Moon Walker', desc: 'Unlock World 02', test: () => progress.unlocked.includes(2) },
  { id: 'world5', name: 'Northern Lights', desc: 'Unlock World 05', test: () => progress.unlocked.includes(5) },
  { id: 'worldAll', name: 'Globetrotter', desc: 'Unlock all 5 worlds', test: () => progress.unlocked.length >= 5 },
  { id: 'friend1', name: 'Better Together', desc: 'Add your first friend', test: () => progress.friends.length >= 1 },
  { id: 'shop1', name: 'Investor', desc: 'Buy the Speed Generator', test: () => progress.shopSpeed >= 1 },
  { id: 'play1h', name: 'Marathon', desc: 'Play for 1 hour', test: () => progress.playTime >= 3600 },
  { id: 'daily7', name: 'Regular', desc: 'Reach a 7-day streak', test: () => progress.dailyStreak >= 7 },
  { id: 'distance1k', name: 'Explorer', desc: 'Walk 1 km in total', test: () => progress.distance >= 1000 },
  { id: 'jumps500', name: 'Springboard', desc: 'Jump 500 times', test: () => progress.jumps >= 500 },
  { id: 'deaths25', name: 'Persistence', desc: 'Get shattered 25 times', test: () => progress.deaths >= 25 },
];

const known = new Set(ACHIEVEMENTS.map((a) => a.id));
const unlockedIds = () => new Set(progress.achievements.filter((id) => known.has(id)));

export function checkAchievements() {
  const have = unlockedIds();
  const fresh = [];
  for (const achievement of ACHIEVEMENTS) {
    if (have.has(achievement.id) || !achievement.test()) continue;
    have.add(achievement.id);
    fresh.push(achievement.name);
  }
  if (!fresh.length) return false;
  progress.achievements = [...have];
  renderAchievements();
  markDirty();
  dispatchEvent(new CustomEvent('progress:server'));
  if (fresh.length === 1) showReward('Milestone unlocked', fresh[0]);
  else {
    const names = fresh.slice(0, 4).join(' · ');
    showReward(`${fresh.length} milestones unlocked`, fresh.length > 4 ? `${names} …` : names);
  }
  return true;
}

export function renderAchievements() {
  const list = document.getElementById('achievement-list');
  if (!list) return;
  const have = unlockedIds();
  list.replaceChildren(...ACHIEVEMENTS.map((achievement) => {
    const unlocked = have.has(achievement.id);
    const item = document.createElement('div');
    item.className = unlocked ? 'achievement-item unlocked' : 'achievement-item';
    const dot = document.createElement('span');
    dot.className = 'achievement-dot';
    dot.textContent = unlocked ? '✓' : '';
    const text = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = achievement.name;
    const desc = document.createElement('small');
    desc.textContent = achievement.desc;
    text.append(name, desc);
    item.append(dot, text);
    return item;
  }));
  const counter = document.getElementById('lb-ach');
  if (counter) counter.textContent = `${have.size}/${ACHIEVEMENTS.length}`;
}
