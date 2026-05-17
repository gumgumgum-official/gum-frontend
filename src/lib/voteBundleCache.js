import { fetchMyVote, fetchVoteResults } from "./voteApi.js";

/** @typedef {import("./voteApi.js").VoteAggregate} VoteAggregate */
/** @typedef {1 | 2 | 3 | null} MyVote */
/** @typedef {{ votes: Record<1 | 2 | 3, number>, myVote: MyVote, totalVotes: number }} VoteBundle */

/** @type {VoteAggregate | null} */
let aggregateCache = null;
/** @type {Promise<VoteAggregate> | null} */
let aggregateInFlight = null;

/** @type {Map<string, MyVote>} */
const myVoteByClientId = new Map();
/** @type {Map<string, Promise<MyVote>>} */
const myVoteInFlight = new Map();

/**
 * @param {string} clientId
 * @returns {VoteBundle | null}
 */
export function getCachedVoteBundle(clientId) {
  if (!aggregateCache || !myVoteByClientId.has(clientId)) return null;
  return {
    votes: aggregateCache.votes,
    totalVotes: aggregateCache.totalVotes,
    myVote: myVoteByClientId.get(clientId) ?? null,
  };
}

export function invalidateVoteBundleCache() {
  aggregateCache = null;
  aggregateInFlight = null;
  myVoteByClientId.clear();
  myVoteInFlight.clear();
}

/**
 * @param {VoteAggregate} aggregate
 * @param {MyVote} myVote
 * @param {string} clientId
 */
export function setCachedVoteBundle(clientId, aggregate, myVote) {
  aggregateCache = aggregate;
  myVoteByClientId.set(clientId, myVote);
}

/**
 * @param {string} clientId
 * @param {VoteAggregate} aggregate
 * @param {MyVote} [myVote]
 */
export function setCachedVoteFromAggregate(clientId, aggregate, myVote) {
  aggregateCache = aggregate;
  if (myVote !== undefined) {
    myVoteByClientId.set(clientId, myVote);
  }
}

/**
 * @param {string} clientId
 * @param {{ force?: boolean }} [opts]
 * @returns {Promise<VoteAggregate>}
 */
async function loadAggregate({ force = false } = {}) {
  if (!force && aggregateCache) return aggregateCache;
  if (!force && aggregateInFlight) return aggregateInFlight;

  aggregateInFlight = fetchVoteResults()
    .then((aggregate) => {
      aggregateCache = aggregate;
      return aggregate;
    })
    .finally(() => {
      aggregateInFlight = null;
    });

  return aggregateInFlight;
}

/**
 * @param {string} clientId
 * @param {{ force?: boolean }} [opts]
 * @returns {Promise<MyVote>}
 */
async function loadMyVote(clientId, { force = false } = {}) {
  if (!force && myVoteByClientId.has(clientId)) {
    return myVoteByClientId.get(clientId) ?? null;
  }
  const pending = myVoteInFlight.get(clientId);
  if (!force && pending) return pending;

  const promise = fetchMyVote(clientId)
    .then((myVote) => {
      myVoteByClientId.set(clientId, myVote);
      return myVote;
    })
    .finally(() => {
      myVoteInFlight.delete(clientId);
    });

  myVoteInFlight.set(clientId, promise);
  return promise;
}

/** @type {Map<string, Promise<VoteBundle>>} */
const bundleInFlight = new Map();

/**
 * @param {string} clientId
 * @param {{ force?: boolean }} [opts]
 * @returns {Promise<VoteBundle>}
 */
export async function fetchVoteBundle(clientId, { force = false } = {}) {
  if (!force) {
    const cached = getCachedVoteBundle(clientId);
    if (cached && myVoteByClientId.has(clientId)) return cached;

    const pending = bundleInFlight.get(clientId);
    if (pending) return pending;
  }

  const promise = Promise.all([
    loadAggregate({ force }),
    loadMyVote(clientId, { force }),
  ]).then(([aggregate, myVote]) => ({
    votes: aggregate.votes,
    totalVotes: aggregate.totalVotes,
    myVote,
  }));

  if (!force) bundleInFlight.set(clientId, promise);
  try {
    return await promise;
  } finally {
    bundleInFlight.delete(clientId);
  }
}

/**
 * @param {string} [clientId]
 */
export function prefetchVoteBundle(clientId) {
  if (!clientId) return;
  const cached = getCachedVoteBundle(clientId);
  if (cached && myVoteByClientId.has(clientId)) return;
  void fetchVoteBundle(clientId).catch(() => {});
}
