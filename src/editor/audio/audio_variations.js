/** Adapted from Gods' End audioUtils: exhaust variations before reshuffling. */
export class ShuffleBag {
  constructor(items, random = Math.random) {
    this.items = [...items]; this.random = random; this.order = []; this.last = null;
  }
  next() {
    if (!this.items.length) return null;
    if (!this.order.length) {
      this.order = [...this.items];
      for (let i = this.order.length - 1; i > 0; i--) {
        const j = Math.floor(this.random() * (i + 1));
        [this.order[i], this.order[j]] = [this.order[j], this.order[i]];
      }
      if (this.order.length > 1 && this.order.at(-1) === this.last) {
        [this.order[0], this.order[this.order.length - 1]] = [this.order.at(-1), this.order[0]];
      }
    }
    this.last = this.order.pop(); return this.last;
  }
}

/** Remove only bounded MP3 encoder padding; retain every non-silent sample. */
export function trimLoopPadding(buffer, context) {
  if (!buffer.getChannelData || !context.createBuffer) return buffer;
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
  const silent = frame => channels.every(data => Math.abs(data[frame]) < 1e-4);
  let start = 0, end = buffer.length;
  while (start < 4096 && start < end - 1 && silent(start)) start++;
  while (buffer.length - end < 4096 && end > start + 1 && silent(end - 1)) end--;
  if (start === 0 && end === buffer.length) return buffer;
  const trimmed = context.createBuffer(buffer.numberOfChannels, end - start, buffer.sampleRate);
  channels.forEach((data, i) => trimmed.getChannelData(i).set(data.subarray(start, end)));
  return trimmed;
}
