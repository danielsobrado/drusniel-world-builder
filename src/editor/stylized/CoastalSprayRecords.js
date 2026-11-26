/** Stable in-place compaction preserves surviving birth order and trajectory. */
export function compactLiveSpray(records, time, write, rebase = false) {
  let live = 0, mist = 0, written = 0;
  for (let index = 0; index < records.length; index++) {
    const record = records[index];
    if (!record || time < record.birth || time >= record.birth + record.life) continue;
    if (live !== index || rebase) {
      records[live] = record;
      write(live, record);
      written++;
    }
    if (record.mist) mist++;
    live++;
  }
  records.length = live;
  return { live, mist, written };
}
