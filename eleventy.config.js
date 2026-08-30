module.exports = function (eleventyConfig) {
  // Ship the existing CSS and JS as-is; Eleventy only touches what it templates.
  eleventyConfig.addPassthroughCopy({ "src/css": "css" });
  eleventyConfig.addPassthroughCopy({ "src/js": "js" });
  // favicon.ico wasn't in the zip you shared - if you have one, drop it in
  // src/ and uncomment the line below.
  // eleventyConfig.addPassthroughCopy({ "src/favicon.ico": "favicon.ico" });

  // Matches script.js's formatVersion(), so server-rendered and
  // client-rendered driver cards read identically.
  eleventyConfig.addFilter("formatVersion", (version) => {
    const num = parseFloat(version);
    return !isNaN(num) ? num.toFixed(2) : version;
  });

  // Used to embed the driver/trends data as inline JSON in base.njk.
  eleventyConfig.addFilter("dump", (value) => JSON.stringify(value));

  return {
    dir: {
      input: "src",
      // Output straight into docs/, since that's what GitHub Pages already
      // serves. docs/data.json is never part of the input tree, so a build
      // never touches or deletes it.
      output: "docs",
      includes: "_includes",
      data: "_data",
    },
    templateFormats: ["njk", "md"],
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: "njk",
  };
};
