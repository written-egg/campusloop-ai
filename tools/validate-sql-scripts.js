const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const files = ["database/schema.sql", "database/seed.sql"];

const errors = [];
const warnings = [];

for (const file of files) {
  const fullPath = path.join(root, file);
  const sql = fs.readFileSync(fullPath, "utf8");
  if (sql.includes("\uFEFF")) errors.push(`${file}: contains UTF-8 BOM`);
  if (!/GO\s*$/i.test(sql.trim())) warnings.push(`${file}: does not end with GO`);
  const sqlWithoutStrings = sql.replace(/N?'[^']*'/g, "''");
  if (/CREATE\s+DATABASE\s+CampusLoopDB\s*;/i.test(sqlWithoutStrings)) {
    errors.push(`${file}: CREATE DATABASE should be executed through dynamic SQL inside IF`);
  }
}

const schema = fs.readFileSync(path.join(root, "database/schema.sql"), "utf8");
const seed = fs.readFileSync(path.join(root, "database/seed.sql"), "utf8");

const expectedTables = [
  "Users",
  "Categories",
  "Products",
  "ProductImages",
  "Transactions",
  "Favorites",
  "Messages",
  "AIReports",
  "RiskLogs"
];

for (const table of expectedTables) {
  if (!new RegExp(`CREATE TABLE dbo\\.${table}\\b`, "i").test(schema)) {
    errors.push(`schema.sql: missing table dbo.${table}`);
  }
}

const requiredConstraints = [
  "FK_Products_Users",
  "FK_Products_Categories",
  "FK_ProductImages_Products",
  "FK_Transactions_Products",
  "FK_Favorites_Users",
  "FK_Messages_Sender",
  "FK_AIReports_Products",
  "FK_RiskLogs_Products"
];

for (const constraint of requiredConstraints) {
  if (!schema.includes(constraint)) {
    errors.push(`schema.sql: missing constraint ${constraint}`);
  }
}

if (!/CREATE VIEW dbo\.ActiveProductView/i.test(schema)) {
  errors.push("schema.sql: missing ActiveProductView");
}

const seedTail = seed.slice(seed.indexOf("DECLARE @"));
if (/GO\s+INSERT INTO dbo\.(Favorites|Messages|AIReports|RiskLogs)/i.test(seedTail)) {
  errors.push("seed.sql: GO found before inserts that depend on declared variables");
}

for (const externalId of ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8", "p1781530320936"]) {
  if (!seed.includes(`N'${externalId}'`)) {
    errors.push(`seed.sql: missing product seed ${externalId}`);
  }
}

if (errors.length) {
  console.error("SQL validation failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

if (warnings.length) {
  console.warn("SQL validation warnings:");
  for (const warning of warnings) console.warn(`- ${warning}`);
}

console.log("SQL scripts passed static validation.");
