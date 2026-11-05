export interface ItemStack {
  id: string;
  count: number;
  /** Remaining durability for tools (undefined for other items). */
  durability?: number;
}

export class Inventory {
  slots: Array<ItemStack | null>;
  /** Index of the selected hotbar slot. */
  selected = 0;
  /** Equipped utility item (mask, lantern, scanner...). */
  gear: ItemStack | null = null;
  baseSize = 36;

  constructor(size = 36) {
    this.baseSize = size;
    this.slots = new Array<ItemStack | null>(size).fill(null);
  }

  get size(): number {
    return this.slots.length;
  }

  resize(size: number): void {
    while (this.slots.length < size) this.slots.push(null);
    if (this.slots.length > size) this.slots.length = size;
  }

  /** Add items; returns the amount that did not fit. */
  add(id: string, count = 1, durability?: number): number {
    let left = count;
    const stackLimit = 64;
    for (let i = 0; i < this.slots.length && left > 0; i++) {
      const slot = this.slots[i];
      if (slot && slot.id === id && slot.count < stackLimit) {
        const move = Math.min(stackLimit - slot.count, left);
        slot.count += move;
        left -= move;
      }
    }
    for (let i = 0; i < this.slots.length && left > 0; i++) {
      if (!this.slots[i]) {
        const move = Math.min(stackLimit, left);
        this.slots[i] = { id, count: move, durability };
        left -= move;
      }
    }
    return left;
  }

  remove(id: string, count = 1): boolean {
    if (this.count(id) < count) return false;
    let left = count;
    for (let i = 0; i < this.slots.length && left > 0; i++) {
      const slot = this.slots[i];
      if (slot && slot.id === id) {
        const take = Math.min(slot.count, left);
        slot.count -= take;
        left -= take;
        if (slot.count <= 0) this.slots[i] = null;
      }
    }
    return true;
  }

  count(id: string): number {
    let total = 0;
    for (const slot of this.slots) {
      if (slot && slot.id === id) total += slot.count;
    }
    if (this.gear && this.gear.id === id) total += this.gear.count;
    return total;
  }

  has(id: string, count = 1): boolean {
    return this.count(id) >= count;
  }

  consume(id: string, count = 1): boolean {
    return this.remove(id, count);
  }

  getSelected(): ItemStack | null {
    return this.slots[this.selected] ?? null;
  }

  select(index: number): void {
    this.selected = ((index % 9) + 9) % 9;
  }

  /** Scroll the hotbar selection. */
  scroll(delta: number): void {
    this.select(this.selected + delta);
  }

  /** Use one item from the selected slot (eat, equip...). */
  consumeSelected(amount = 1): void {
    const slot = this.getSelected();
    if (!slot) return;
    slot.count -= amount;
    if (slot.count <= 0) this.slots[this.selected] = null;
  }

  /** Apply wear to the selected tool; returns true if the tool broke. */
  damageSelected(amount = 1): boolean {
    const slot = this.getSelected();
    if (!slot || slot.durability === undefined) return false;
    slot.durability -= amount;
    if (slot.durability <= 0) {
      this.slots[this.selected] = null;
      return true;
    }
    return false;
  }

  /** Swap two slots (inventory UI). */
  swap(a: number, b: number): void {
    if (a === b) return;
    const tmp = this.slots[a];
    this.slots[a] = this.slots[b];
    this.slots[b] = tmp;
  }

  toJSON(): unknown {
    return { slots: this.slots, selected: this.selected, gear: this.gear, size: this.slots.length };
  }

  static fromJSON(data: {
    slots?: Array<ItemStack | null>;
    selected?: number;
    gear?: ItemStack | null;
    size?: number;
  }): Inventory {
    const inv = new Inventory(data.size ?? 36);
    if (data.slots) {
      for (let i = 0; i < Math.min(data.slots.length, inv.slots.length); i++) {
        inv.slots[i] = data.slots[i];
      }
    }
    inv.selected = data.selected ?? 0;
    inv.gear = data.gear ?? null;
    return inv;
  }
}
