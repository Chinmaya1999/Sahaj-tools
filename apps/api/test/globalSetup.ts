import { MongoMemoryServer } from "mongodb-memory-server";

let mongod: MongoMemoryServer;
export async function setup({ provide }: { provide: (k: string, v: string) => void }) {
  mongod = await MongoMemoryServer.create();
  provide("mongoUri", mongod.getUri("ek_test"));
}
export async function teardown() { await mongod?.stop(); }
declare module "vitest" { export interface ProvidedContext { mongoUri: string } }
