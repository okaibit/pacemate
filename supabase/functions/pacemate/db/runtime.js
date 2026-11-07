export function connectionInfo(connection) {
  if (!connection) throw Object.assign(new Error("The database connection secret is missing."), { code: "DATABASE_NOT_CONFIGURED" });
  let url;
  try { url = new URL(connection); } catch { throw Object.assign(new Error("The database secret must be a Postgres connection URI."), { code: "DATABASE_URL_INVALID" }); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || !url.username || !url.password || /\[YOUR[-_]PASSWORD\]/i.test(decodeURIComponent(url.password))) {
    throw Object.assign(new Error("Check the database connection URI and replace its password placeholder."), { code: "DATABASE_URL_INVALID" });
  }
  const port = Number(url.port || 5432);
  const pooler = /\.pooler\.supabase\.(com|net)$/.test(url.hostname);
  return { connectionType: pooler ? (port === 6543 ? "transaction-pooler" : "session-pooler") : (/^db\..*\.supabase\.co$/.test(url.hostname) ? "direct" : "custom"), port };
}

export function createDatabaseRuntime({ connection, local = false, connect, makeDatabase, timeoutMs = 12000, log = console.info }) {
  let current;
  const open = () => {
    if (!current) {
      const info = connectionInfo(connection);
      log("pacemate database opening", info);
      const client = connect(connection, {
        prepare: false, fetch_types: false, max: 1, idle_timeout: 10,
        connect_timeout: 8, max_lifetime: 60, ssl: local ? false : "require",
      });
      current = { client, database: makeDatabase(client) };
    }
    return current;
  };
  const database = new Proxy({}, {
    get(_target, key) {
      const instance = open().database;
      const value = Reflect.get(instance, key, instance);
      return typeof value === "function" ? value.bind(instance) : value;
    },
  });
  async function withDeadline(operation) {
    const active = open();
    let timer;
    try {
      return await Promise.race([
        Promise.resolve().then(() => operation(active.client, active.database)),
        new Promise((_resolve, reject) => {
          timer = setTimeout(() => {
            if (current === active) current = undefined;
            const error = Object.assign(new Error("Database request timed out. Check the Supabase transaction pooler URI and database availability."), { code: "DATABASE_TIMEOUT" });
            log("pacemate database deadline exceeded", { timeoutMs });
            reject(error);
            // Stop queued work and permit the next request to create a fresh pool.
            Promise.resolve().then(() => active.client.end({ timeout: 0 })).catch(() => {});
          }, timeoutMs);
        }),
      ]);
    } finally { clearTimeout(timer); }
  }
  return { database, withDeadline, info: () => connectionInfo(connection) };
}

export function databaseFailure(error) {
  const code = typeof error?.code === "string" ? error.code : "DATABASE_UNAVAILABLE";
  const messages = {
    DATABASE_NOT_CONFIGURED: "The database connection secret is missing.",
    DATABASE_URL_INVALID: "Check the database connection URI and its password encoding.",
    DATABASE_TIMEOUT: "The database connection or query timed out. Check the transaction pooler URI and database availability.",
    CONNECT_TIMEOUT: "Could not connect to the database. Check the transaction pooler host and port.",
    "28P01": "Database authentication failed. Check the pooler username and database password.",
    "3D000": "The database name in the connection URI is incorrect.",
    "42P01": "An application table is missing. Check that the SQL migration ran in this project.",
    "42501": "The database connection role cannot access the application tables.",
  };
  // Never return a driver's raw message or connection URI: it may contain secrets.
  return { error: messages[code] || "The database is unavailable. Check the function logs and connection settings.", code };
}
