export type StatKey =
  | 'blocksMined'
  | 'blocksPlaced'
  | 'depthReached'
  | 'robotBlocks'
  | 'robotCargo'
  | 'robotCharges'
  | 'smelted'
  | 'creditsEarned'
  | 'sulfurDusted'
  | 'crystalsFound'
  | 'hostilesDefeated';

export interface QuestDef {
  id: string;
  name: string;
  desc: string;
  goal: number;
  stat: StatKey;
  reward: number;
}

export const QUESTS: QuestDef[] = [
  {
    id: 'first_shift',
    name: 'First Shift',
    desc: 'Break 15 blocks of any kind.',
    goal: 15,
    stat: 'blocksMined',
    reward: 60,
  },
  {
    id: 'sulfur_contract',
    name: 'Sulfur Contract',
    desc: 'Collect 30 sulfur dust.',
    goal: 30,
    stat: 'sulfurDusted',
    reward: 140,
  },
  {
    id: 'deep_delve',
    name: 'Deep Delve',
    desc: 'Reach 40 blocks below the surface.',
    goal: 40,
    stat: 'depthReached',
    reward: 180,
  },
  {
    id: 'crystal_hunt',
    name: 'Crystal Hunt',
    desc: 'Extract 3 sulfur crystals.',
    goal: 3,
    stat: 'crystalsFound',
    reward: 260,
  },
  {
    id: 'robot_helper',
    name: 'Iron Partner',
    desc: 'Let BOLT-7 mine 25 blocks for you.',
    goal: 25,
    stat: 'robotBlocks',
    reward: 160,
  },
  {
    id: 'logistics',
    name: 'Logistics',
    desc: 'Collect 20 blocks from BOLT-7’s cargo.',
    goal: 20,
    stat: 'robotCargo',
    reward: 150,
  },
  {
    id: 'smelter',
    name: 'Red Hot',
    desc: 'Smelt 5 ingots.',
    goal: 5,
    stat: 'smelted',
    reward: 170,
  },
  {
    id: 'builder',
    name: 'Claim Stakes',
    desc: 'Place 25 blocks in the world.',
    goal: 25,
    stat: 'blocksPlaced',
    reward: 120,
  },
  {
    id: 'caretaker',
    name: 'Caretaker',
    desc: 'Recharge BOLT-7 five times.',
    goal: 5,
    stat: 'robotCharges',
    reward: 130,
  },
  {
    id: 'rich',
    name: 'Payday',
    desc: 'Earn 600 credits in total.',
    goal: 600,
    stat: 'creditsEarned',
    reward: 220,
  },
  {
    id: 'exterminator',
    name: 'Exterminator',
    desc: 'Defeat 8 cave dwellers.',
    goal: 8,
    stat: 'hostilesDefeated',
    reward: 190,
  },
  {
    id: 'the_deep',
    name: 'The Deep Dark',
    desc: 'Reach 70 blocks below the surface.',
    goal: 70,
    stat: 'depthReached',
    reward: 420,
  },
];

export class Stats {
  blocksMined = 0;
  blocksPlaced = 0;
  depthReached = 0;
  robotBlocks = 0;
  robotCargo = 0;
  robotCharges = 0;
  smelted = 0;
  creditsEarned = 0;
  sulfurDusted = 0;
  crystalsFound = 0;
  hostilesDefeated = 0;
  /** Item id -> count mined. */
  mined: Record<string, number> = {};
  deaths = 0;

  get(stat: StatKey): number {
    return this[stat];
  }

  add(stat: StatKey, amount = 1): void {
    this[stat] += amount;
  }

  recordMined(itemId: string): void {
    this.mined[itemId] = (this.mined[itemId] ?? 0) + 1;
  }

  toJSON(): Record<string, unknown> {
    return {
      blocksMined: this.blocksMined,
      blocksPlaced: this.blocksPlaced,
      depthReached: this.depthReached,
      robotBlocks: this.robotBlocks,
      robotCargo: this.robotCargo,
      robotCharges: this.robotCharges,
      smelted: this.smelted,
      creditsEarned: this.creditsEarned,
      sulfurDusted: this.sulfurDusted,
      crystalsFound: this.crystalsFound,
      hostilesDefeated: this.hostilesDefeated,
      mined: this.mined,
      deaths: this.deaths,
    };
  }

  static fromJSON(data: Record<string, unknown>): Stats {
    const s = new Stats();
    for (const key of Object.keys(s) as Array<keyof Stats>) {
      if (key === 'mined') continue;
      const value = data[key];
      if (typeof value === 'number') (s[key] as number) = value;
    }
    if (data.mined && typeof data.mined === 'object') {
      s.mined = { ...(data.mined as Record<string, number>) };
    }
    return s;
  }
}
