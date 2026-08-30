const fs = require("fs");
const path = require("path");

// Precomputes the 3 ranges the trends chart's chip buttons switch between
// (recent/worst/all). In the original script.js, getTrendSeries() rebuilt
// all three from allDrivers on every call; here the arrays already exist
// at build time, so the client only has to pick one and draw it — no
// re-sorting or re-filtering of the full driver list in the browser.
module.exports = () => {
  const dataPath = path.join(__dirname, "../../docs/data.json");
  const raw = fs.readFileSync(dataPath, "utf8");
  const drivers = JSON.parse(raw);

  const chronological = [...drivers]
    .sort((a, b) => compareVersions(a.version, b.version))
    .map((d) => {
      const total = d.bugs.length;
      const fixed = d.bugs.filter((b) => b.fixed_in !== null).length;
      return { version: d.version, total, fixed, pending: total - fixed };
    });

  const recent = chronological.slice(-20);
  const worst = [...chronological]
    .sort((a, b) => b.total - a.total)
    .slice(0, 15)
    .sort((a, b) => compareVersions(a.version, b.version));

  return { recent, worst, all: chronological };
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
