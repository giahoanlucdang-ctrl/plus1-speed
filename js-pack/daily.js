import { progress, markDirty } from './progress.js';

const dayKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

// First launch of a new day grants a small Win bonus. Consecutive days build the streak;
// a missed day resets it. Capped at 5 Wins so the world economy stays intact.
export function claimDailyBonus(player) {
  const today = new Date();
  const key = dayKey(today);
  if (progress.dailyClaimedDay === key) return null;
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  progress.dailyStreak = progress.dailyClaimedDay === dayKey(yesterday)
    ? Math.min(365, progress.dailyStreak + 1)
    : 1;
  progress.dailyClaimedDay = key;
  const bonus = Math.min(progress.dailyStreak, 5);
  progress.wins += bonus;
  if (player) player.stats.wins = progress.wins;
  markDirty();
  dispatchEvent(new CustomEvent('progress:server'));
  return { streak: progress.dailyStreak, bonus };
}
