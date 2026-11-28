const ROTATION_FRAMES = 4;

/** Reserve an existing shared turn for late ground consumers; never renew the frame allowance. */
export function reserveEnvironmentalGroundTurn(budget, pending) {
  const turn = budget.slack.frameId % ROTATION_FRAMES;
  const selected = turn === 0 && pending.valley ? 'valley' : turn === 2 && pending.ambient ? 'ambient' : null;
  let reservation = selected ? budget.reserve(budget.maximumMs) : null;
  const result = { valley: budget, ambient: budget, cancel() { reservation?.cancel(); reservation = null; } };
  if (reservation) result[selected] = {
    shouldYield: budget.shouldYield,
    canPublish: bytes => budget.canPublish(bytes),
    runner(work) {
      if (!reservation) return budget.run(work);
      const active = reservation;
      reservation = null;
      return active.run(gate => work(gate));
    },
  };
  return result;
}
