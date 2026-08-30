const fs = require("fs");
const path = require("path");

// Reads docs/data.json (read-only — the build never writes to it).
//
// Real shape:
// [
//   {
//     "version": "526.47",
//     "bugs": [
//       { "description": "...", "fixed_in": "Fixed (526.47)" },
//       { "description": "...", "fixed_in": null }
//     ]
//   }
// ]
//
// fixed_in is null while a bug is pending, and holds the string
// "Fixed (X.XX)" once it's fixed. There's no channel field (Game Ready vs
// Studio isn't in the data — it's only mentioned in the page copy).
module.exports = () => {
  const dataPath = path.join(__dirname, "../../docs/data.json");
  const raw = fs.readFileSync(dataPath, "utf8");
  const drivers = JSON.parse(raw);

  // Sorted newest-first once, at build time, since that's the default view
  // and the client script re-sorts from this same numeric comparison when
  // the user picks a different sort order.
  return [...drivers].sort((a, b) => compareVersions(b.version, a.version));
};

function compareVersions(a, b) {
  const splitA = a.split(".").map((n) => parseFloat(n) || 0);
  const splitB = b.split(".").map((n) => parseFloat(n) || 0);
  const len = Math.max(splitA.length, splitB.length);
  for (let i = 0; i < len; i++) {
    const valA = splitA[i] || 0;
    const valB = splitB[i] || 0;
    if (valA !== valB) return valA - valB;
  }
  return 0;
}
