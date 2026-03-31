import type { TimeSegment, Adjustment } from "./types";

export function calculateSegmentAmount(segment: TimeSegment): number {
  return segment.hours * segment.ratePerHour;
}

export function calculateWorkLogAmount(
  segments: TimeSegment[],
  adjustments: Adjustment[]
): number {
  const segmentTotal = segments.reduce(
    (sum, segment) => sum + calculateSegmentAmount(segment),
    0
  );

  const adjustmentTotal = adjustments.reduce(
    (sum, adjustment) => sum + adjustment.amount,
    0
  );

  return segmentTotal + adjustmentTotal;
}

export function filterNewSegments(
  segments: TimeSegment[],
  lastSettledAt: string | null
): TimeSegment[] {
  if (!lastSettledAt) {
    return segments;
  }

  return segments.filter(
    (segment) => new Date(segment.createdAt) > new Date(lastSettledAt)
  );
}
