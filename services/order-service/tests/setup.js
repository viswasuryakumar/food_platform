const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

/**
 * Spins up a real MongoDB in memory for the test run.
 *
 * Chosen over mocking Mongoose so the tests exercise actual queries, indexes
 * and schema validation. A mocked DB would happily accept documents the real
 * one rejects, which is exactly the class of bug these tests exist to catch.
 */
let mongod;

async function connectTestDb() {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
}

async function clearTestDb() {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((collection) => collection.deleteMany({})));
}

async function closeTestDb() {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
  if (mongod) await mongod.stop();
}

module.exports = { connectTestDb, clearTestDb, closeTestDb };
