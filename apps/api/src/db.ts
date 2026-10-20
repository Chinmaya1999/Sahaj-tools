import mongoose from "mongoose";
import { env } from "./env.js";
import { logger } from "./lib/logger.js";
import * as M from "./models/index.js";

export async function connectDb(uri = env.MONGODB_URI) {
  mongoose.set("strictQuery", true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  // Build unique indexes up front so constraints (duplicate email/SKU/number) are always enforced.
  await Promise.all(Object.values(M).map((m) => (m as mongoose.Model<any>).init?.()));
  logger.info({ db: mongoose.connection.name }, "mongo connected");
}
export const disconnectDb = () => mongoose.disconnect();
