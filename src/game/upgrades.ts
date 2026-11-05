export interface UpgradeDef {
  id: string;
  name: string;
  desc: string;
  cost: number;
  /** Items that must be in the inventory (consumed) before purchase. */
  requires?: Array<{ item: string; count: number }>;
}

export const UPGRADES: UpgradeDef[] = [
  {
    id: 'reinforced_pick',
    name: 'Reinforced Grip',
    desc: 'Tool handles tuned for speed. Mining is 25% faster.',
    cost: 220,
  },
  {
    id: 'battery_pack',
    name: 'Battery Pack',
    desc: 'BOLT-7 carries 60% more charge between swaps.',
    cost: 200,
  },
  {
    id: 'drill_overhaul',
    name: 'Drill Overhaul',
    desc: 'BOLT-7 mines 50% faster.',
    cost: 240,
  },
  {
    id: 'cargo_expansion',
    name: 'Cargo Expansion',
    desc: 'BOLT-7 carries 16 blocks instead of 8.',
    cost: 180,
  },
  {
    id: 'gas_filter',
    name: 'Sulfur Filter',
    desc: 'Toxic gas does half the damage. Requires a Gas Mask.',
    cost: 200,
    requires: [{ item: 'gas_mask', count: 1 }],
  },
  {
    id: 'scanner_mk2',
    name: 'Scanner Mk II',
    desc: 'BOLT-7 pings ore veins from 34 blocks away.',
    cost: 300,
  },
  {
    id: 'thruster_pack',
    name: 'Thruster Assist',
    desc: 'Jump twice in mid air. Requires a Thruster Pack.',
    cost: 420,
    requires: [{ item: 'thruster', count: 1 }],
  },
  {
    id: 'lantern_module',
    name: 'Lantern Module',
    desc: 'Carry light in the utility slot. Requires a Lantern.',
    cost: 150,
    requires: [{ item: 'lantern', count: 1 }],
  },
  {
    id: 'beacon_link',
    name: 'Beacon Link',
    desc: 'Recall BOLT-7 instantly with R. Requires a Beacon.',
    cost: 260,
    requires: [{ item: 'beacon', count: 1 }],
  },
  {
    id: 'backpack',
    name: 'Field Backpack',
    desc: '27 extra inventory slots. Requires a Miner Backpack.',
    cost: 240,
    requires: [{ item: 'backpack', count: 1 }],
  },
  {
    id: 'auto_smelt',
    name: 'Auto-Smelter',
    desc: 'Raw ore is refined the moment it is mined.',
    cost: 520,
  },
  {
    id: 'deep_suit',
    name: 'Deep Suit',
    desc: 'Reinforced lining: +5 max health, 50% less fall damage.',
    cost: 320,
  },
  {
    id: 'beacon_tether',
    name: 'Ore Tether',
    desc: 'The scanner also marks sulfur crystal veins.',
    cost: 340,
  },
];

export function upgradeById(id: string): UpgradeDef | undefined {
  return UPGRADES.find((u) => u.id === id);
}
