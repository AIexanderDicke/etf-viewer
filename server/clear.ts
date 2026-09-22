import { config } from "./config.ts";
import { clearDatabase, createDb } from "./db.ts";

const cacheOnly = process.argv.includes("--cache");

const db = createDb(config.dbFile);
const cleared = clearDatabase(db, { cacheOnly });
db.close();

const summary = cacheOnly
  ? `${cleared.funds} cached fund(s)`
  : `${cleared.portfolios} portfolio(s), ${cleared.positions} position(s), ${cleared.funds} cached fund(s)`;
console.log(`[db] cleared ${config.dbFile}: ${summary}`);
