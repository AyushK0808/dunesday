import "server-only";
import { getDb } from "./db";
import type { RunDoc, ShowDoc, UserDoc } from "./types";

export type MovieStats = {
  shows: number;
  cinemas: number;
  dates: string[];
  days: { date: string; n: number; left: number; total: number }[];
  seatsLeft: number;
  seatsTotal: number;
  newToday: number;
  formats: { tag: string; n: number }[];
};

export async function movieStats(movieKey: string): Promise<MovieStats> {
  const db = await getDb();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [agg] = await db
    .collection<ShowDoc>("shows")
    .aggregate<{
      shows: number;
      cinemas: string[];
      dates: string[];
      seatsLeft: number;
      seatsTotal: number;
      newToday: number;
    }>([
      { $match: { movie_key: movieKey, active: true } },
      {
        $group: {
          _id: null,
          shows: { $sum: 1 },
          cinemas: { $addToSet: "$theatre_id" },
          dates: { $addToSet: "$date" },
          seatsLeft: { $sum: "$available" },
          seatsTotal: { $sum: "$total" },
          newToday: { $sum: { $cond: [{ $gte: ["$first_seen_at", since] }, 1, 0] } },
        },
      },
    ])
    .toArray();
  const [formats, days] = await Promise.all([
    db
      .collection<ShowDoc>("shows")
      .aggregate<{ _id: string; n: number }>([
        { $match: { movie_key: movieKey, active: true } },
        { $unwind: "$tags" },
        { $group: { _id: "$tags", n: { $sum: 1 } } },
        { $sort: { n: -1 } },
      ])
      .toArray(),
    db
      .collection<ShowDoc>("shows")
      .aggregate<{ _id: string; n: number; left: number; total: number }>([
        { $match: { movie_key: movieKey, active: true } },
        { $group: { _id: "$date", n: { $sum: 1 }, left: { $sum: "$available" }, total: { $sum: "$total" } } },
        { $sort: { _id: 1 } },
      ])
      .toArray(),
  ]);
  return {
    shows: agg?.shows ?? 0,
    cinemas: agg?.cinemas.length ?? 0,
    dates: (agg?.dates ?? []).sort(),
    days: days.map((d) => ({ date: d._id, n: d.n, left: d.left, total: d.total })),
    seatsLeft: agg?.seatsLeft ?? 0,
    seatsTotal: agg?.seatsTotal ?? 0,
    newToday: agg?.newToday ?? 0,
    formats: formats.map((f) => ({ tag: f._id, n: f.n })),
  };
}

export type Batch = { at: Date; count: number; groups: { movie_key: string; date: string; count: number; shows: ShowDoc[] }[] };

/** Shows found in the same check share one first_seen_at timestamp; each check that found something is a batch. */
export async function recentBatches(batchLimit = 4, perGroup = 8): Promise<Batch[]> {
  const db = await getDb();
  const col = db.collection<ShowDoc>("shows");
  const stamps = await col
    .aggregate<{ _id: Date; count: number }>([{ $group: { _id: "$first_seen_at", count: { $sum: 1 } } }, { $sort: { _id: -1 } }, { $limit: batchLimit }])
    .toArray();
  return Promise.all(
    stamps.map(async ({ _id: at, count }) => {
      const groups = await col
        .aggregate<{ _id: { movie_key: string; date: string }; count: number; shows: ShowDoc[] }>([
          { $match: { first_seen_at: at } },
          { $sort: { date: 1, available: -1, time: 1 } },
          { $group: { _id: { movie_key: "$movie_key", date: "$date" }, count: { $sum: 1 }, shows: { $push: "$$ROOT" } } },
          { $sort: { "_id.date": 1, "_id.movie_key": 1 } },
          { $limit: 4 },
          { $project: { count: 1, shows: { $slice: ["$shows", perGroup] } } },
        ])
        .toArray();
      return {
        at,
        count,
        groups: groups.map((g) => ({ movie_key: g._id.movie_key, date: g._id.date, count: g.count, shows: g.shows.sort((a, b) => a.time.localeCompare(b.time)) })),
      };
    }),
  );
}

export async function latestRuns(limit = 144): Promise<RunDoc[]> {
  const db = await getDb();
  return db.collection<RunDoc>("runs").find({}).sort({ started_at: -1 }).limit(limit).toArray();
}

export type ShowFilter = { movie?: string; date?: string; formats?: string[]; cinema?: string; seats?: boolean; fresh?: boolean };

export async function findShows(f: ShowFilter): Promise<ShowDoc[]> {
  const db = await getDb();
  const q: Record<string, unknown> = { active: true };
  if (f.movie) q.movie_key = f.movie;
  if (f.date) q.date = f.date;
  if (f.cinema) q.theatre_id = f.cinema;
  if (f.formats?.length) q.tags = { $all: f.formats };
  if (f.seats) q.available = { $gt: 0 };
  if (f.fresh) q.first_seen_at = { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) };
  return db.collection<ShowDoc>("shows").find(q).sort({ theatre_name: 1, time: 1 }).limit(2000).toArray();
}

export async function showFacets(movie?: string) {
  const db = await getDb();
  const match: Record<string, unknown> = { active: true };
  if (movie) match.movie_key = movie;
  const col = db.collection<ShowDoc>("shows");
  const [dates, cinemas, tags] = await Promise.all([
    col.aggregate<{ _id: string; n: number }>([{ $match: match }, { $group: { _id: "$date", n: { $sum: 1 } } }, { $sort: { _id: 1 } }]).toArray(),
    col.aggregate<{ _id: string; name: string }>([{ $match: match }, { $group: { _id: "$theatre_id", name: { $first: "$theatre_name" } } }, { $sort: { name: 1 } }]).toArray(),
    col.distinct("tags", match),
  ]);
  return { dates: dates.map((d) => d._id), dateCounts: Object.fromEntries(dates.map((d) => [d._id, d.n])), cinemas, tags: tags as string[] };
}

export async function listUsers(): Promise<UserDoc[]> {
  const db = await getDb();
  return db.collection<UserDoc>("users").find({}).sort({ role: 1, email: 1 }).toArray();
}
