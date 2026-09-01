const drivers = require("./drivers.json");

// Summary numbers shown in the .stats bar - computed once at build time
// instead of client-side, so they're already in the served HTML.
module.exports = function () {
  let totalBugs = 0;
  let fixedBugs = 0;
  for (const driver of drivers) {
    totalBugs += driver.bugs.length;
    fixedBugs += driver.bugs.filter((b) => b.fixed_in !== null).length;
  }
  const fixRate = totalBugs > 0 ? Math.round((fixedBugs / totalBugs) * 100) : 0;
  return {
    totalDrivers: drivers.length,
    totalBugs,
    fixRate: `${fixRate}%`,
  };
};
