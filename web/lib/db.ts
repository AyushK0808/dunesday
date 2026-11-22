import "server-only";
import "./env";
import { MongoClient, type Db } from "mongodb";
import type { Settings } from "./types";

const g = globalThis as unknown as { _mongo?: Promise<MongoClient> };

export function getClient(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  if (!g._mongo) {
    g._mongo = new MongoClient(uri, { appName: "dunesday-web", maxPoolSize: 5 }).connect();
    g._mongo.catch(() => (g._mongo = undefined));
  }
  return g._mongo;
}

export async function getDb(): Promise<Db> {
  return (await getClient()).db("dunesday");
}

export const DEFAULT_SETTINGS: Settings = {
  _id: "global",
  city: "hyderabad",
  language: "English",
  paused: false,
  failure_streak: 0,
  movies: [
    {
      key: "avengers-doomsday",
      name: "Avengers: Doomsday",
      url: "https://www.district.in/movies/avengers-doomsday-movie-tickets-MV176735",
      bms_url: "https://in.bookmyshow.com/movies/hyderabad/avengers-doomsday/buytickets/ET00439706",
      enabled: true,
      theme: "doom",
    },
    {
      key: "dune-part-three",
      name: "Dune: Part Three",
      url: "https://www.district.in/movies/dune-part-three-movie-tickets-MV207332",
      bms_url: "https://in.bookmyshow.com/movies/hyderabad/dune-part-three/buytickets/ET00491771",
      enabled: true,
      theme: "dune",
    },
  ],
};

export async function getSettings(): Promise<Settings> {
  const db = await getDb();
  const col = db.collection<Settings>("settings");
  const s = await col.findOne({ _id: "global" });
  if (s) return s;
  await col.updateOne({ _id: "global" }, { $setOnInsert: DEFAULT_SETTINGS }, { upsert: true });
  return DEFAULT_SETTINGS;
}
