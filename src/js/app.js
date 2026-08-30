// No charting library, still dependency-free at runtime - the only thing
// that changed from the original is *when* data.json turns into this page.
// Eleventy reads it once at build time (src/_data/drivers.js, stats.js,
// trends.js) and this file picks up the already-parsed, already-sorted
// result from window.__NVIDIAWATCH_DATA__ / __NVIDIAWATCH_TRENDS__ instead
// of fetching and parsing it here.
//
// Everything below this point - search, sort, status filter, pagination,
// the trends chart, theme/view toggles, deep-linking - is unchanged from
// the original script.js. That's all real runtime interactivity a static
// build can't remove; it still has to run in the visitor's browser.
//
// `allDrivers` is set once, on load, and never mutated; every filter, sort,
// search, and pagination is a UI-only derivation into `filteredDrivers`.
// Search/filter/sort/page state is also mirrored into the URL query string
// (see updateURL/loadStateFromURL) so a link someone shares reopens to the
// same view instead of just the driver list from scratch.
document.addEventListener('DOMContentLoaded', () => {
    const driverContainer = document.getElementById('driver-container');
    const searchInput = document.getElementById('search-input');
    const searchClearBtn = document.getElementById('search-clear');
    const themeBtn = document.getElementById('theme-toggle');
    const viewModeBtn = document.getElementById('view-mode-toggle');
    const sortSelect = document.getElementById('sort-select');
    // Scoped to #status-filters so the trends-range chips (added below) don't
    // get swept into the status-filter logic just because they share `.chip`.
    const statusChips = document.querySelectorAll('#status-filters .chip');
    const htmlEl = document.documentElement;
    const paginationContainer = document.querySelector('.pagination-container');
    const trendsChartSvg = document.getElementById('trends-chart');
    const trendsTooltip = document.getElementById('trends-tooltip');
    const trendsRangeChips = document.querySelectorAll('#trends-range .chip');

    let allDrivers = [];
    let filteredDrivers = [];
    let currentPage = 1;
    const itemsPerPage = 9;
    
    let currentFilter = 'all'; 
    let currentSort = 'version-desc';
    let searchDebounceTimer = null;
    let trendsRange = 'all';
    let resizeDebounceTimer = null;

    // data.json versions are already 2-decimal strings (e.g. "581.80"), but
    // this normalizes anything entered without the trailing zero (e.g. "581.8")
    // so the UI never shows an inconsistent number of decimals. Falls back to
    // the raw string for anything non-numeric rather than showing "NaN".
    function formatVersion(version) {
        const verNum = parseFloat(version);
        return !isNaN(verNum) ? verNum.toFixed(2) : version;
    }

    // Bug descriptions come from data.json, which the maintainer edits by hand -
    // escaping before any innerHTML use keeps a stray "<" or "&" in a bug report
    // from breaking the layout (and is cheap insurance against future contributor edits).
    function escapeHTML(str) {
        return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    // Wraps every match of the current search query in <mark>. Text is escaped
    // first so the highlighting regex runs on safe HTML, and the query itself is
    // escaped separately (safeQuery) so regex metacharacters typed by the user
    // (e.g. searching "DLSS 4.0 (beta)") are treated as literal text, not regex syntax.
    function highlightText(text, query) {
        const escapedText = escapeHTML(text);
        if (!query) return escapedText;
        const safeQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(${safeQuery})`, 'gi');
        return escapedText.replace(regex, '<mark class="highlight">$1</mark>');
    }

    let toastTimeout = null;
    function showToast(message) {
        const toast = document.getElementById('toast');
        if (!toast) return;
        toast.textContent = message;
        toast.classList.remove('hidden');
        toast.classList.add('show');
        clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.classList.add('hidden'), 300);
        }, 2500);
    }

    // Driver versions sort by number, not by string: a plain string/localeCompare
    // sort would put "581.9" after "581.10" alphabetically, which is backwards.
    // Splitting on "." and comparing each segment as a number handles that correctly.
    function compareVersions(a, b) {
        const splitA = a.split('.').map(n => parseFloat(n) || 0);
        const splitB = b.split('.').map(n => parseFloat(n) || 0);
        const len = Math.max(splitA.length, splitB.length);
        for (let i = 0; i < len; i++) {
            const valA = splitA[i] || 0;
            const valB = splitB[i] || 0;
            if (valA !== valB) return valA - valB;
        }
        return 0;
    }

    // Mirrors search/page/filter/sort into the URL (only when they differ from
    // the default) so a copied link reopens to the same view. `replace` uses
    // history.replaceState instead of pushState for updates that shouldn't add
    // a new back-button entry, e.g. the initial load or a debounced search
    // keystroke - only "real" navigation actions (page change, filter click)
    // should be undoable with the browser back button.
    function updateURL(replace = false) {
        const params = new URLSearchParams();
        if (searchInput.value) params.set('q', searchInput.value);
        if (currentPage > 1) params.set('page', currentPage);
        if (currentFilter !== 'all') params.set('filter', currentFilter);
        if (currentSort !== 'version-desc') params.set('sort', currentSort);
        // Only attach "?" when there's actually a query string - the
        // original always appended '?' + params.toString(), which left a
        // bare trailing "?" (e.g. "/?#driver-526.47") whenever every filter
        // was at its default. That was a pre-existing bug, not something
        // this migration introduced.
        const query = params.toString();
        const newRelativePathQuery = window.location.pathname + (query ? "?" + query : "");
        const hash = window.location.hash;
        if (replace) {
            history.replaceState(null, '', newRelativePathQuery + hash);
        } else {
            history.pushState(null, '', newRelativePathQuery + hash);
        }
    }

    // The reverse of updateURL - runs once, right after data.json loads, so an
    // incoming shared link restores its search/page/filter/sort before the
    // first render instead of flashing the default view first.
    function loadStateFromURL() {
        const params = new URLSearchParams(window.location.search);
        if (params.has('q')) searchInput.value = params.get('q');
        if (params.has('page')) {
            const parsedPage = parseInt(params.get('page'), 10);
            currentPage = (Number.isFinite(parsedPage) && parsedPage > 0) ? parsedPage : 1;
        }
        if (params.has('filter')) {
            currentFilter = params.get('filter');
            updateChipUI();
        }
        if (params.has('sort')) {
            currentSort = params.get('sort');
            sortSelect.value = currentSort;
        }
    }

    function updateChipUI() {
        statusChips.forEach(chip => {
            const isActive = chip.dataset.filter === currentFilter;
            chip.classList.toggle('active', isActive);
            chip.setAttribute('aria-pressed', isActive);
        });
    }

    // The <html data-theme> attribute itself is already set by the inline
    // script in index.html <head> (before first paint, to avoid a dark->light
    // flash on reload). This block runs after DOMContentLoaded just to sync
    // the toggle button's aria-pressed state to match, since the button
    // doesn't exist yet when the inline script runs.
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
        htmlEl.setAttribute('data-theme', savedTheme);
        themeBtn.setAttribute('aria-pressed', savedTheme === 'light');
    }

    const savedView = localStorage.getItem('view') || 'masonry';
    htmlEl.setAttribute('data-view', savedView);
    viewModeBtn.setAttribute('aria-pressed', savedView === 'timeline');

    // driverContainer only exists on the home page. Guarded so this (and
    // everything below it in this file) can't throw on a page that doesn't
    // have it - an unguarded throw here used to run before themeBtn's own
    // click listener was even registered, which is why toggling theme did
    // nothing at all on /stats/.
    if (driverContainer) {
        if (savedView === 'masonry') {
            driverContainer.classList.replace('grid-layout', 'masonry-layout');
        } else {
            driverContainer.classList.replace('masonry-layout', 'grid-layout');
        }
    }

    themeBtn.addEventListener('click', () => {
        const currentTheme = htmlEl.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        htmlEl.setAttribute('data-theme', newTheme);
        themeBtn.setAttribute('aria-pressed', newTheme === 'light');
        localStorage.setItem('theme', newTheme);
    });

    viewModeBtn.addEventListener('click', () => {
        const currentView = htmlEl.getAttribute('data-view');
        const newView = currentView === 'timeline' ? 'masonry' : 'timeline';
        htmlEl.setAttribute('data-view', newView);
        viewModeBtn.setAttribute('aria-pressed', newView === 'timeline');
        localStorage.setItem('view', newView);
        if (driverContainer) {
            if (newView === 'masonry') {
                driverContainer.classList.replace('grid-layout', 'masonry-layout');
            } else {
                driverContainer.classList.replace('masonry-layout', 'grid-layout');
            }
        }
    });

    // Everything from here down (data load, rendering, search/sort/filter/
    // pagination wiring, the trends chart) is home-page-only. Guarded on
    // driverContainer, the one element every home-page control depends on
    // either directly or transitively, so /stats/ - which shares this same
    // file for the navbar's theme/view buttons - doesn't try to wire up
    // controls it doesn't have.
    if (driverContainer) {
        // The full dataset ships inline (see base.njk), already sorted
        // newest-first at build time by src/_data/drivers.js - no fetch, no
        // "Loading driver data..." state, no network-failure branch.
        allDrivers = window.__NVIDIAWATCH_DATA__ || [];
        const latest = allDrivers[0];
        if (latest) {
            document.title = `NvidiaWatch | Latest Driver ${formatVersion(latest.version)}`;
        }
        loadStateFromURL();
        applyFiltersAndSort(false);
        const initialHash = window.location.hash;
        if (initialHash.startsWith('#driver-')) {
            const targetVersion = initialHash.replace('#driver-', '');
            const driverIndex = filteredDrivers.findIndex(d => d.version === targetVersion);
            if (driverIndex !== -1) {
                currentPage = Math.floor(driverIndex / itemsPerPage) + 1;
            }
        }
        renderDrivers();
        renderPagination();
        renderTrendsChart();
        updateURL(true);
        scrollToDriverFromHash();
    }

    // Builds the per-driver bug-count series behind the trends chart, for one
    // of three ranges the user can pick via the chip buttons:
    //   - 'recent': the 20 newest versions, chart's default so it loads fast
    //     and stays readable without horizontal scrolling.
    //   - 'worst': the 15 versions with the most bugs regardless of when they
    //     shipped, then re-sorted back into version order so the x-axis still
    //     reads chronologically instead of jumbled by bug count.
    //   - 'all': every version ever tracked (can be wide - renderTrendsChart
    //     lets this range grow past the container width and scroll).
    // The 3 ranges are precomputed at build time (src/_data/trends.js)
    // instead of re-sorting/re-filtering the full driver list here on every
    // range switch, resize, and initial render.
    function getTrendSeries(range) {
        const trends = window.__NVIDIAWATCH_TRENDS__ || {};
        return trends[range] || trends.all || [];
    }

    function rangeLabel(range) {
        if (range === 'recent') return 'last 20 versions';
        if (range === 'worst') return 'most affected versions';
        return 'all tracked versions';
    }

    function resetTrendsTooltip(series, range) {
        trendsTooltip.textContent = `Showing ${rangeLabel(range)} (${series.length}) — hover or tap a bar for details.`;
    }

    // Used by the trends chart (clicking a bar) to jump straight to a driver
    // card. Clears any active search/filter first, since the target driver's
    // bugs could otherwise be hidden by whatever filter was active when the
    // chart was clicked.
    function goToDriver(version) {
        searchInput.value = '';
        searchClearBtn.classList.add('hidden');
        currentFilter = 'all';
        updateChipUI();
        applyFiltersAndSort(false);
        const idx = filteredDrivers.findIndex(d => d.version === version);
        if (idx !== -1) currentPage = Math.floor(idx / itemsPerPage) + 1;
        renderDrivers();
        renderPagination();
        updateURL();
        history.pushState(null, '', `#driver-${version}`);
        scrollToDriverFromHash();
    }

    // Builds the stacked bar chart by hand with raw SVG DOM nodes rather than
    // a charting library, to keep the site dependency-free (see the file-level
    // note at the top). Re-run on range switch, window resize, and initial load.
    function renderTrendsChart(range = trendsRange) {
        if (!trendsChartSvg || allDrivers.length === 0) return;
        trendsRange = range;
        const series = getTrendSeries(range);
        const ns = 'http://www.w3.org/2000/svg';
        trendsChartSvg.innerHTML = '';
        if (series.length === 0) return;

        // Bars get a fixed minimum width per range so they stay tappable/legible;
        // 'all' can have far more bars than fit the container, so once the natural
        // width exceeds the container the SVG grows past it and the wrapper scrolls
        // horizontally instead of squeezing every bar down to nothing.
        const containerWidth = trendsChartSvg.parentElement.clientWidth || 800;
        const minBarWidth = range === 'all' ? 6 : 22;
        const gap = range === 'all' ? 1.5 : 6;
        const naturalWidth = series.length * (minBarWidth + gap);
        const width = Math.max(containerWidth, naturalWidth);
        const height = 240;
        const padTop = 8;
        const padBottom = 4;
        const plotH = height - padTop - padBottom;
        const barW = Math.max(minBarWidth, (width - gap * (series.length - 1)) / series.length);
        const maxTotal = Math.max(...series.map(s => s.total), 1);

        trendsChartSvg.setAttribute('viewBox', `0 0 ${width} ${height}`);
        trendsChartSvg.setAttribute('preserveAspectRatio', 'none');
        trendsChartSvg.style.width = `${width}px`;
        trendsChartSvg.style.height = `${height}px`;

        const frag = document.createDocumentFragment();

        series.forEach((item, i) => {
            const x = i * (barW + gap);
            const baseY = padTop + plotH;
            const fixedH = (item.fixed / maxTotal) * plotH;
            const pendingH = (item.pending / maxTotal) * plotH;
            const versionDisplay = formatVersion(item.version);

            const g = document.createElementNS(ns, 'g');
            g.setAttribute('class', 'trend-bar-group');
            g.setAttribute('tabindex', '0');
            g.setAttribute('role', 'button');
            g.setAttribute('aria-label', `Driver ${versionDisplay}: ${item.total} bugs, ${item.fixed} fixed, ${item.pending} pending. Jump to this driver.`);

            // Wider invisible hit area so thin bars stay easy to hover/tap.
            const hit = document.createElementNS(ns, 'rect');
            hit.setAttribute('x', x - gap / 2);
            hit.setAttribute('y', padTop);
            hit.setAttribute('width', barW + gap);
            hit.setAttribute('height', plotH);
            hit.setAttribute('class', 'trend-bar-hit');
            g.appendChild(hit);

            if (item.fixed > 0) {
                const rFixed = document.createElementNS(ns, 'rect');
                rFixed.setAttribute('x', x);
                rFixed.setAttribute('y', baseY - fixedH);
                rFixed.setAttribute('width', barW);
                rFixed.setAttribute('height', fixedH);
                rFixed.setAttribute('class', 'trend-bar-fixed');
                g.appendChild(rFixed);
            }
            if (item.pending > 0) {
                const rPending = document.createElementNS(ns, 'rect');
                rPending.setAttribute('x', x);
                rPending.setAttribute('y', baseY - fixedH - pendingH);
                rPending.setAttribute('width', barW);
                rPending.setAttribute('height', pendingH);
                rPending.setAttribute('class', 'trend-bar-pending');
                g.appendChild(rPending);
            }

            const showDetail = () => {
                trendsTooltip.textContent = `Driver ${versionDisplay} — ${item.total} bug${item.total === 1 ? '' : 's'} (${item.fixed} fixed, ${item.pending} pending)`;
            };
            g.addEventListener('mouseenter', showDetail);
            g.addEventListener('focus', showDetail);
            g.addEventListener('click', () => goToDriver(item.version));
            g.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    goToDriver(item.version);
                }
            });

            frag.appendChild(g);
        });

        trendsChartSvg.appendChild(frag);
        resetTrendsTooltip(series, range);
    }

    // A driver card survives the filter+search pass if either its version
    // number matches the search text, or at least one of its bugs matches
    // *both* the active status filter (all/pending/fixed) and the search text.
    // Status filtering happens on the bug list first so that, e.g., searching
    // "DLSS" under the "Fixed" filter only counts a driver as a match when it
    // has a *fixed* DLSS bug - not just any DLSS bug regardless of status.
    function applyFiltersAndSort(shouldRender = true, replaceHistory = false) {
        const query = searchInput.value.toLowerCase().trim();
        filteredDrivers = allDrivers.filter(driver => {
            const versionText = `driver ${formatVersion(driver.version)}`.toLowerCase();
            const bugsMatchingStatus = driver.bugs.filter(bug => {
                if (currentFilter === 'pending') return bug.fixed_in === null;
                if (currentFilter === 'fixed') return bug.fixed_in !== null;
                return true;
            });
            if (bugsMatchingStatus.length === 0 && currentFilter !== 'all') {
                return versionText.includes(query);
            }
            const hasMatchingBug = bugsMatchingStatus.some(bug => {
                const desc = (bug.description || "").toLowerCase();
                const status = (bug.fixed_in || "Pending").toLowerCase();
                return desc.includes(query) || status.includes(query);
            });
            return versionText.includes(query) || hasMatchingBug;
        });

        filteredDrivers.sort((a, b) => {
            switch (currentSort) {
                case 'version-asc': return compareVersions(a.version, b.version);
                case 'version-desc': return compareVersions(b.version, a.version);
                case 'bugs-asc': return a.bugs.length - b.bugs.length;
                case 'bugs-desc': return b.bugs.length - a.bugs.length;
                default: return 0;
            }
        });

        const totalPages = Math.max(1, Math.ceil(filteredDrivers.length / itemsPerPage));
        if (currentPage > totalPages) currentPage = totalPages;
        if (currentPage < 1) currentPage = 1;

        if (shouldRender) {
            currentPage = 1;
            renderDrivers();
            renderPagination();
            updateURL(replaceHistory);
        }
    }

    // Renders one page of driver cards. `filteredDrivers` already reflects
    // search/status/sort (see applyFiltersAndSort); this only slices out the
    // current page and, per card, re-applies the status filter + search
    // highlighting to its bug list so a card that matched via its version
    // number still only lists the bugs relevant to the active filter.
    function renderDrivers() {
        driverContainer.innerHTML = '';
        const startIndex = (currentPage - 1) * itemsPerPage;
        const driversToRender = filteredDrivers.slice(startIndex, startIndex + itemsPerPage);

        if (driversToRender.length === 0) {
            driverContainer.innerHTML = `
                <div class="no-results" role="status">
                    <ion-icon name="search-outline"></ion-icon>
                    <p>No results found for your current filters.</p>
                    <button class="clear-search-btn" id="empty-clear-btn">Clear all filters</button>
                </div>
            `;
            document.getElementById('empty-clear-btn')?.addEventListener('click', clearAllFilters);
            return;
        }

        const fragment = document.createDocumentFragment();
        const query = searchInput.value.toLowerCase().trim();

        driversToRender.forEach(driver => {
            const versionDisplay = formatVersion(driver.version);
            const card = document.createElement('div');
            card.className = 'driver-card';
            card.id = `driver-${driver.version}`;
            
            const header = document.createElement('div');
            header.className = 'driver-header';

            const versionHighlighted = highlightText(`Driver ${versionDisplay}`, query);
            header.innerHTML = `
                <div class="driver-version">${versionHighlighted}</div>
                <button class="copy-link-btn" aria-label="Copy link to Driver ${versionDisplay}" title="Copy link to driver">
                    <ion-icon name="link-outline"></ion-icon>
                </button>
            `;
            
            const copyBtn = header.querySelector('.copy-link-btn');
            copyBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const url = new URL(window.location.href);
                url.hash = `driver-${driver.version}`;
                navigator.clipboard.writeText(url.toString())
                    .then(() => showToast(`Link to Driver ${versionDisplay} copied!`))
                    .catch(() => showToast('Failed to copy link.'));
            });

            header.style.cursor = 'pointer';
            header.setAttribute('role', 'button');
            header.setAttribute('tabindex', '0');
            header.addEventListener('click', (e) => {
                if (e.target.closest('.copy-link-btn')) return;
                const version = driver.version;
                history.pushState(null, '', `#driver-${version}`);
                document.getElementById(`driver-${version}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            });
            header.addEventListener('keydown', (e) => {
                if (e.target.closest('.copy-link-btn')) return;
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    header.click();
                }
            });
            card.appendChild(header);

            const bugList = document.createElement('ul');
            bugList.className = 'bug-list';

            const bugsToShow = driver.bugs.filter(bug => {
                const matchesStatus = (currentFilter === 'all') || 
                                     (currentFilter === 'pending' && bug.fixed_in === null) || 
                                     (currentFilter === 'fixed' && bug.fixed_in !== null);
                const matchesSearch = !query || 
                                     (bug.description || "").toLowerCase().includes(query) || 
                                     (bug.fixed_in || "Pending").toLowerCase().includes(query);
                return matchesStatus && matchesSearch;
            });

            bugsToShow.forEach(bug => {
                const li = document.createElement('li');
                li.className = 'bug-item';
                const isFixed = bug.fixed_in !== null;
                const descHighlighted = highlightText(bug.description, query);
                const statusHighlighted = highlightText(bug.fixed_in || 'Pending', query);

                li.innerHTML = `
                    <div class="bug-desc">${descHighlighted}</div>
                    <div class="bug-footer">
                        <span class="status-badge ${isFixed ? 'status-fixed' : 'status-pending'}">
                            ${statusHighlighted}
                        </span>
                    </div>
                `;
                bugList.appendChild(li);
            });

            if (bugsToShow.length === 0) {
                const emptyLi = document.createElement('li');
                emptyLi.className = 'bug-item';
                emptyLi.innerHTML = `<div class="bug-desc" style="color: var(--text-secondary); font-style: italic;">No bugs match the current filter.</div>`;
                bugList.appendChild(emptyLi);
            }

            card.appendChild(bugList);
            fragment.appendChild(card);
        });
        driverContainer.appendChild(fragment);
    }

    function highlightDriverCard(el) {
        if (!el) return;
        // Force a reflow before re-adding so the animation restarts even if
        // the same card was already highlighted a moment ago (e.g. clicking
        // the same bar twice in a row).
        el.classList.remove('highlight-pulse');
        void el.offsetWidth;
        el.classList.add('highlight-pulse');
        clearTimeout(el._highlightTimeout);
        el._highlightTimeout = setTimeout(() => el.classList.remove('highlight-pulse'), 2600);
    }

    function scrollToDriverFromHash() {
        const hash = window.location.hash;
        if (hash.startsWith('#driver-')) {
            setTimeout(() => {
                const el = document.getElementById(hash.slice(1));
                if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    highlightDriverCard(el);
                }
            }, 150);
        }
    }

    function renderPagination() {
        paginationContainer.innerHTML = '';
        const totalPages = Math.ceil(filteredDrivers.length / itemsPerPage);
        if (totalPages <= 1) return;

        const createBtn = (content, page, label, active = false, disabled = false) => {
            const btn = document.createElement('button');
            btn.className = `page-btn ${active ? 'active' : ''}`;
            btn.innerHTML = content;
            btn.setAttribute('aria-label', label);
            btn.disabled = disabled;
            if (!disabled) btn.addEventListener('click', () => changePage(page));
            return btn;
        };

        paginationContainer.appendChild(createBtn('<ion-icon name="chevron-back-outline"></ion-icon>', currentPage - 1, 'Previous page', false, currentPage === 1));

        let pages = [];
        if (totalPages <= 7) {
            pages = Array.from({length: totalPages}, (_, i) => i + 1);
        } else {
            if (currentPage <= 4) pages = [1, 2, 3, 4, 5, '...', totalPages];
            else if (currentPage >= totalPages - 3) pages = [1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
            else pages = [1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages];
        }

        pages.forEach(p => {
            if (p === '...') {
                const dot = document.createElement('span');
                dot.textContent = '...';
                dot.className = 'page-btn';
                dot.style.border = 'none';
                dot.style.backgroundColor = 'transparent';
                paginationContainer.appendChild(dot);
            } else {
                paginationContainer.appendChild(createBtn(p, p, `Go to page ${p}`, p === currentPage));
            }
        });

        paginationContainer.appendChild(createBtn('<ion-icon name="chevron-forward-outline"></ion-icon>', currentPage + 1, 'Next page', false, currentPage === totalPages));
    }

    function changePage(newPage) {
        currentPage = newPage;
        document.querySelector('main')?.scrollIntoView({ behavior: 'smooth' });
        renderDrivers();
        renderPagination();
        updateURL();
    }

    function clearAllFilters() {
        searchInput.value = '';
        currentFilter = 'all';
        currentSort = 'version-desc';
        sortSelect.value = 'version-desc';
        updateChipUI();
        applyFiltersAndSort();
    }

    if (driverContainer) {
        // Debounced so re-filtering (and the URL update it triggers) runs
        // once after the user pauses typing, not on every keystroke.
        // `replaceHistory: true` keeps rapid typing from spamming the
        // browser history with one entry per keystroke.
        searchInput.addEventListener('input', () => {
            searchClearBtn.classList.toggle('hidden', !searchInput.value);
            clearTimeout(searchDebounceTimer);
            searchDebounceTimer = setTimeout(() => {
                applyFiltersAndSort(true, true);
            }, 300);
        });

        searchClearBtn.addEventListener('click', () => {
            searchInput.value = '';
            searchClearBtn.classList.add('hidden');
            applyFiltersAndSort();
            searchInput.focus();
        });

        sortSelect.addEventListener('change', (e) => {
            currentSort = e.target.value;
            applyFiltersAndSort();
        });

        statusChips.forEach(chip => {
            chip.addEventListener('click', () => {
                currentFilter = chip.dataset.filter;
                updateChipUI();
                applyFiltersAndSort();
            });
        });

        trendsRangeChips.forEach(chip => {
            chip.addEventListener('click', () => {
                trendsRangeChips.forEach(c => {
                    const isActive = c === chip;
                    c.classList.toggle('active', isActive);
                    c.setAttribute('aria-pressed', isActive);
                });
                renderTrendsChart(chip.dataset.range);
            });
        });

        // The chart's width is computed from the container's pixel width
        // (see renderTrendsChart), so it needs a full re-render on resize,
        // not just a CSS reflow. Debounced so dragging a window edge
        // doesn't rebuild the SVG on every intermediate frame.
        window.addEventListener('resize', () => {
            clearTimeout(resizeDebounceTimer);
            resizeDebounceTimer = setTimeout(() => renderTrendsChart(), 200);
        });

        // Bound once (not per-render) to avoid piling up duplicate
        // listeners every time the chart re-draws (range switch, resize,
        // initial load).
        trendsChartSvg?.addEventListener('mouseleave', () => {
            resetTrendsTooltip(getTrendSeries(trendsRange), trendsRange);
        });

        window.addEventListener('hashchange', scrollToDriverFromHash);
    }

});
