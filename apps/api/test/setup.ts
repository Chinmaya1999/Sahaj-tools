import { afterAll, beforeAll, inject } from "vitest";
import mongoose from "mongoose";
import { connectDb, disconnectDb } from "../src/db.js";

beforeAll(async () => {
  await connectDb(inject("mongoUri"));
  await mongoose.connection.dropDatabase();
  await connectDb(inject("mongoUri")); // rebuild indexes after drop
  for (const m of Object.values(mongoose.models)) await m.syncIndexes();
});
afterAll(async () => { await disconnectDb(); });
