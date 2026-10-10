export type ScrollIntent = {
  distance: number;
  startedAt: number;
  lastAt: number;
};

export const emptyScrollIntent: ScrollIntent = {
  distance: 0,
  startedAt: 0,
  lastAt: 0,
};

// Distance and duration both matter: one large wheel event is not sustained reading.
export function advanceScrollIntent(
  previous: ScrollIntent,
  delta: number,
  now: number
): { intent: ScrollIntent; compact: boolean; expand: boolean } {
  if (delta === 0) {
    return { intent: previous, compact: false, expand: false };
  }
  const reset =
    now - previous.lastAt > 700 ||
    previous.startedAt === 0 ||
    Math.sign(previous.distance) !== Math.sign(delta);
  const intent = {
    distance: (reset ? 0 : previous.distance) + delta,
    startedAt: reset ? now : previous.startedAt,
    lastAt: now,
  };
  const expand = intent.distance <= -18;
  return {
    intent: expand ? emptyScrollIntent : intent,
    compact: intent.distance >= 180 && now - intent.startedAt >= 240,
    expand,
  };
}

export function advanceUserScrollIntent(
  previous: ScrollIntent,
  delta: number,
  now: number,
  userDirection: -1 | 0 | 1
): ReturnType<typeof advanceScrollIntent> {
  if (userDirection === 0 || Math.sign(delta) !== userDirection) {
    return { intent: previous, compact: false, expand: false };
  }
  return advanceScrollIntent(previous, delta, now);
}
