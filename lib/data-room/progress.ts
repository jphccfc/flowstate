export const dataRoomRequestStatuses = ["REQUESTED", "RECEIVED", "ACCEPTED", "FOLLOW_UP_REQUIRED", "NOT_APPLICABLE"] as const;
export type DataRoomRequestStatus = (typeof dataRoomRequestStatuses)[number];

type DataRoomRequestLike = { status: DataRoomRequestStatus };

/**
 * Fulfilment means the request has a usable response; review is intentionally
 * separate so an uploaded document cannot silently count as diligence complete.
 */
export function summarizeDataRoomRequests(requests: DataRoomRequestLike[]) {
  const applicable = requests.filter((request) => request.status !== "NOT_APPLICABLE");
  const received = applicable.filter((request) => request.status === "RECEIVED" || request.status === "ACCEPTED").length;
  const accepted = applicable.filter((request) => request.status === "ACCEPTED").length;
  const followUpRequired = applicable.filter((request) => request.status === "FOLLOW_UP_REQUIRED").length;
  return {
    total: requests.length,
    applicable: applicable.length,
    received,
    accepted,
    followUpRequired,
    fulfilmentPercent: applicable.length ? Math.round((received / applicable.length) * 100) : 0,
    reviewPercent: received ? Math.round((accepted / received) * 100) : 0,
  };
}
