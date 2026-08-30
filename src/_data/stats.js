const fs = require("fs");
const path = require("path");

// Same source as drivers.js. This replaces script.js's updateStats(), which
// ran in the browser on every load — here it runs once, at build time.
module.exports = () => {
  const dataPath = path.join(__dirname, "../../docs/data.json");
  const raw = fs.readFileSync(dataPath, "utf8");
  const drivers = JSON.parse(raw);

  let totalBugs = 0;
  let fixedBugs = 0;
  const byDriver = [];

  for (const driver of drivers) {
    const fixed = driver.bugs.filter((bug) => bug.fixed_in !== null).length;
    const pending = driver.bugs.length - fixed;
    totalBugs += driver.bugs.length;
    fixedBugs += fixed;
    byDriver.push({ version: driver.version, fixed, pending });
  }

  // Newest first, same order as the home page.
  byDriver.sort((a, b) => compareVersions(b.version, a.version));

  const fixRate = totalBugs > 0 ? Math.round((fixedBugs / totalBugs) * 100) : 0;

  return {
    totalDrivers: drivers.length,
    totalBugs,
    fixedBugs,
    pendingBugs: totalBugs - fixedBugs,
    fixRate,
    byDriver,
  };
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
