import { markAttributeSubrangeUpdated } from '../attributeUpload.js';

export class InstanceDirtySpan {
  constructor(attribute) {
    this.attribute = attribute;
    this.min = Infinity;
    this.max = -1;
  }

  mark(index) {
    this.min = Math.min(this.min, index);
    this.max = Math.max(this.max, index);
  }

  matrix(index, matrix) {
    const { array } = this.attribute;
    const offset = index * 16;
    for (let i = 0; i < 16; i++) {
      if (array[offset + i] === Math.fround(matrix.elements[i])) continue;
      matrix.toArray(array, offset);
      this.mark(index);
      return;
    }
  }

  scalar(index, value) {
    if (this.attribute.getX(index) === Math.fround(value)) return;
    this.attribute.setX(index, value);
    this.mark(index);
  }

  publish() {
    return markAttributeSubrangeUpdated(this.attribute, this.min, this.max);
  }
}

export function admitInstancePublication(budget, kinds, capacity, floatsPerInstance) {
  return !budget || budget.canPublish(kinds * capacity * floatsPerInstance * Float32Array.BYTES_PER_ELEMENT);
}
