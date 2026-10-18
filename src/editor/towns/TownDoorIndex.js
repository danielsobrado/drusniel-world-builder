const CELL = 4;
/** Town-local coordinates keep queries independent of floating-origin shifts. */
export class TownDoorIndex {
  constructor(doors) {
    this.cells = new Map();
    doors.forEach((door, index) => {
      const key = `${Math.floor(door.centre[0] / CELL)}:${Math.floor(door.centre[2] / CELL)}`;
      if (!this.cells.has(key)) this.cells.set(key, []);
      this.cells.get(key).push(index);
    });
  }
  near(x, z, reach) {
    const indices = [];
    for (let cx = Math.floor((x - reach) / CELL); cx <= Math.floor((x + reach) / CELL); cx++) {
      for (let cz = Math.floor((z - reach) / CELL); cz <= Math.floor((z + reach) / CELL); cz++) {
        indices.push(...(this.cells.get(`${cx}:${cz}`) ?? []));
      }
    }
    return indices.sort((a, b) => a - b);
  }
}
