# NvidiaWatch
 
**Live:** [independent-arg.github.io/NvidiaWatch](https://independent-arg.github.io/NvidiaWatch/)
 
I got tired of not knowing whether a new NVIDIA driver was going to break something before I installed it, so I built this: a simple tracker of known Game Ready / Studio driver issues, searchable by game, bug, or version, so you can check if the one you're about to install is safe.
 
No account, no backend, no analytics beyond what GitHub Pages does on its own. Just static HTML/CSS/JS reading from a JSON file.
 
## What it does
 
- Search across games, bugs and driver versions
- Filter by status — pending or fixed
- Sort by version or by how many bugs a driver racked up
- Two view modes (masonry / timeline) and a dark/light toggle
- Quick stats up top: how many drivers, how many issues, fix rate
## How it's built
 
Plain HTML, CSS and JS — no framework, no build step. Icons from Ionicons, fonts from Google Fonts. Runs entirely on GitHub Pages.
 
```
docs/
├── index.html
├── style.css
├── script.js
└── data.json   # the actual driver/bug data the site reads from
```
 
## Data
 
Comes from a mix of user reports and NVIDIA's own release notes. If you think something's wrong or missing, open an issue.

## License

MIT — see [LICENSE](LICENSE). You're free to reuse or fork this.

## Credit

Built by [independent-arg](https://github.com/independent-arg) for the community. Data is sourced from user reports and official NVIDIA release notes.
