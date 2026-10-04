/** Transfer exact samples as arrays instead of cloning thousands of small objects. */
export function packSampleTable(samples) {
  const entries = [...samples];
  const coordinates = new Float64Array(entries.length * 2);
  const names = new Set();
  entries.forEach(([key, record], index) => {
    coordinates.set(key.split(':').map(Number), index * 2);
    for (const name of Object.keys(record)) names.add(name);
  });
  const columns = [...names].map(name => {
    const numeric = entries.every(([, record]) => !(name in record) || typeof record[name] === 'number');
    const values = numeric ? new Float64Array(entries.length) : new Uint32Array(entries.length);
    const present = new Uint8Array(entries.length);
    const dictionary = [], indices = new Map();
    entries.forEach(([, record], index) => {
      if (!(name in record)) return;
      present[index] = 1;
      const value = record[name];
      if (numeric) values[index] = value;
      else {
        if (!indices.has(value)) { indices.set(value, dictionary.length); dictionary.push(value); }
        values[index] = indices.get(value);
      }
    });
    return { name, numeric, values, present, dictionary };
  });
  return { coordinates, columns, size: entries.length };
}

export function sampleTableBuffers(table) {
  if (!table) return [];
  return [table.coordinates.buffer, ...table.columns.flatMap(column => [column.values.buffer, column.present.buffer])];
}

export function createSampleLookup(table) {
  if (!table || table instanceof Map) return table;
  const indices = new Map(), records = new Map();
  for (let index = 0; index < table.size; index++) {
    indices.set(`${table.coordinates[index * 2]}:${table.coordinates[index * 2 + 1]}`, index);
  }
  return {
    get(key) {
      const index = indices.get(key);
      if (index === undefined) return undefined;
      let record = records.get(index);
      if (!record) {
        record = {};
        for (const column of table.columns) if (column.present[index]) {
          record[column.name] = column.numeric ? column.values[index] : column.dictionary[column.values[index]];
        }
        Object.freeze(record);
        records.set(index, record);
      }
      return record;
    },
  };
}
