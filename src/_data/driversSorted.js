const drivers = require("./drivers.json");

// Driver versions sort by number, not by string: a plain string sort would
// put "581.9" after "581.10" alphabetically, which is backwards.
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

// Newest driver first, matching the site's default sort order. bugsTotal/
// bugsFixed are precomputed here so the template can stamp them onto each
// card as data-* attributes - script.js reads those instead of re-deriving
// counts, keeping the interactive layer independent of any JSON fetch.
module.exports = function () {
  return [...drivers]
    .sort((a, b) => compareVersions(b.version, a.version))
    .map((driver) => ({
      ...driver,
      bugsTotal: driver.bugs.length,
      bugsFixed: driver.bugs.filter((b) => b.fixed_in !== null).length,
    }));
};
