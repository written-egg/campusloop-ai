const sqlStore = require("../lib/sqlStore");

async function main() {
  if (!sqlStore.isSqlEnabled()) {
    throw new Error("Set DB_USER and DB_PASSWORD before running this check.");
  }

  const [users, products] = await Promise.all([sqlStore.listUsers(), sqlStore.listProducts()]);
  console.log(
    JSON.stringify(
      {
        ok: true,
        storage: "sql-server",
        users: users.length,
        products: products.length,
        firstProduct: products[0]?.name || null
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
