module.exports = function (eleventyConfig) {
  // style.css, script.js, and generated assets are already final output,
  // no processing needed - just copy them next to the built HTML.
  eleventyConfig.addPassthroughCopy("src/style.css");
  eleventyConfig.addPassthroughCopy("src/script.js");
  eleventyConfig.addPassthroughCopy("src/assets");

  return {
    dir: {
      input: "src",
      includes: "_includes",
      data: "_data",
      output: "_site",
    },
  };
};
