const fs = require("fs");

const html = fs.readFileSync("public/index.html", "utf8");
const app = fs.readFileSync("public/app.js", "utf8");
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
const dynamicIds = [...app.matchAll(/\bid=["']([A-Za-z][\w:-]*)["']/g)].map((match) => match[1]);
const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
const scriptRefs = [...app.matchAll(/\$\("([^"]+)"\)/g)].map((match) => match[1]);
const missingIds = [...new Set(scriptRefs.filter((id) => !ids.includes(id) && !dynamicIds.includes(id)))];

const result = {
  ok: duplicateIds.length === 0 && missingIds.length === 0,
  htmlIds: ids.length,
  scriptIdRefs: new Set(scriptRefs).size,
  duplicateIds,
  missingIds
};
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;
