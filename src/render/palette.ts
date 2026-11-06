import * as THREE from 'three';
import { Block } from '../world/blocks';

/** The colour of the dust a block leaves behind. */
export function dustColor(blockId: number): THREE.Color {
  const color = new THREE.Color(0xffffff);
  color.setHSL(0.1, 0.1, 0.55);
  switch (blockId) {
      case Block.STONE:
      case Block.COBBLESTONE:
      case Block.DEEPSLATE:
        color.setHex(0x7d7d7d);
        break;
      case Block.DIRT:
        color.setHex(0x8b5a2b);
        break;
      case Block.GRASS:
        color.setHex(0x4f9b3a);
        break;
      case Block.SAND:
      case Block.SULFUR_SAND:
        color.setHex(0xddd3a0);
        break;
      case Block.SULFUR_ORE:
      case Block.SULFUR_CRYSTAL:
      case Block.SULFUR_BLOCK:
        color.setHex(0xe8d24a);
        break;
      case Block.COAL_ORE:
        color.setHex(0x2b2b2b);
        break;
      case Block.IRON_ORE:
        color.setHex(0xd7a883);
        break;
      case Block.GOLD_ORE:
      case Block.GOLD_BLOCK:
        color.setHex(0xf0c33c);
        break;
      case Block.DIAMOND_ORE:
        color.setHex(0x4fe0dc);
        break;
      case Block.LOG:
      case Block.PLANK:
        color.setHex(0x8a6338);
        break;
      case Block.LEAVES:
        color.setHex(0x3f7a2c);
        break;
      case Block.LAVA:
        color.setHex(0xff8b2a);
        break;
      case Block.WATER:
        color.setHex(0x3f7fd8);
        break;
      case Block.ASH:
        color.setHex(0x5d5a57);
        break;
      case Block.MOSSY_STONE:
        color.setHex(0x5d7a46);
        break;
      default:
        color.setHex(0xa0a0a0);
    }
  return color;
}
