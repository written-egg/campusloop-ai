require("dotenv").config({ quiet: true });

const fs = require("fs");
const path = require("path");
const sql = require("mssql");

function parseServer(rawServer) {
  const value = rawServer || ".\\SQLEXPRESS";
  const parts = value.split("\\");
  if (parts.length < 2) return { server: value };
  return {
    server: parts[0] === "." ? "localhost" : parts[0],
    instanceName: parts.slice(1).join("\\")
  };
}

function splitBatches(source) {
  return source
    .replace(/^\s*:[^\r\n]*$/gm, "")
    .split(/^\s*GO\s*;?\s*$/gim)
    .map((batch) => batch.trim())
    .filter(Boolean);
}

async function main() {
  const input = process.argv[2];
  if (!input) throw new Error("Provide a SQL file path.");
  if (!process.env.DB_USER || !process.env.DB_PASSWORD) {
    throw new Error("Set DB_USER and DB_PASSWORD in the local environment first.");
  }

  const filePath = path.resolve(input);
  const parsedServer = parseServer(process.env.DB_SERVER);
  const port = process.env.DB_PORT ? Number(process.env.DB_PORT) : undefined;
  const pool = await sql.connect({
    server: parsedServer.server,
    ...(port ? { port } : {}),
    database: process.env.DB_NAME || "CampusLoopDB",
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    options: {
      encrypt: process.env.DB_ENCRYPT === "true",
      trustServerCertificate: process.env.DB_TRUST_CERT !== "false",
      ...(parsedServer.instanceName && !port ? { instanceName: parsedServer.instanceName } : {})
    }
  });

  const batches = splitBatches(fs.readFileSync(filePath, "utf8"));
  for (const batch of batches) await pool.request().batch(batch);
  console.log(JSON.stringify({ ok: true, file: path.relative(process.cwd(), filePath), batches: batches.length }, null, 2));
  await pool.close();
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
