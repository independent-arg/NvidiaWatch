# NvidiaWatch
 
**Live:** [independent-arg.github.io/NvidiaWatch](https://independent-arg.github.io/NvidiaWatch/)
 
I built this simple tracker to log bugs found in NVIDIA drivers (Game Ready & Studio) and create a searchable database of known issues - whether they're fixed, pending, or simply forgotten. Yes, sometimes bugs just disappear in the next driver release with no explanation: was it actually fixed? Was it an external issue? Does it still exist? No one knows.

This database can help in several ways. For example, we can analyze which driver branches were hit hardest by bugs and which were the most stable. All data is sourced from official NVIDIA releases.

## Features

- Search across games, driver versions, and known issues
- Filter by status (pending or fixed)
- Sort by driver version or number of bugs
- Multiple view modes (masonry/timeline) and theme toggle
- Quick overview: total drivers tracked, issues logged, and fix rate

## How it's built

The site runs entirely on GitHub Pages - plain HTML, CSS, and JavaScript (no framework, no build step). Icons from Ionicons, fonts from Google Fonts. Data comes from `docs/data.json`, which you can update or contribute to.
 
```
docs/
├── index.html
├── style.css
├── script.js
└── data.json   # driver and issue data
```
 
## Contributing

Found a bug in a driver or know of an issue that's missing? Open an issue or submit a PR with the driver version, affected games/apps, and details.

## License

MIT - see [LICENSE](LICENSE). You're free to reuse or fork this.

## Credit

Built by [independent-arg](https://github.com/independent-arg) for the community. Data is sourced from official NVIDIA release notes.
