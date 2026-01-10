document.addEventListener('DOMContentLoaded', () => {
    const driverContainer = document.getElementById('driver-container');
    const searchInput = document.getElementById('search-input');
    const loadMoreBtn = document.getElementById('load-more-btn');

    let allDrivers = [];
    let displayedCount = 10;
    const LOAD_INCREMENT = 10;
    let isSearchActive = false;

    // Fetch data
    fetch('data.json')
        .then(response => response.json())
        .then(data => {
            // Sort drivers by version descending (if not already)
            allDrivers = data.sort((a, b) => parseFloat(b.version) - parseFloat(a.version));
            renderDrivers();
        })
        .catch(err => console.error('Error loading data:', err));

    // Render Logic
    function renderDrivers() {
        driverContainer.innerHTML = '';

        const driversToRender = isSearchActive ? allDrivers : allDrivers.slice(0, displayedCount);
        
        let visibleCards = 0;

        driversToRender.forEach(driver => {
            const card = document.createElement('div');
            card.className = 'driver-card';
            
            // Build Bug List
            const bugList = document.createElement('ul');
            bugList.className = 'bug-list';
            
            let hasVisibleBugs = false;
            const searchTerm = searchInput.value.toLowerCase();

            driver.bugs.forEach(bug => {
                const desc = bug.description || "";
                const statusText = bug.original_status_text || "";
                const combinedText = `${desc} ${statusText}`.toLowerCase();

                // Search Filter
                const isMatch = !isSearchActive || combinedText.includes(searchTerm);
                
                if (isMatch) {
                    hasVisibleBugs = true;
                    const li = document.createElement('li');
                    li.className = 'bug-item';
                    
                    const statusClass = bug.status === 'fixed' ? 'status-fixed' : 'status-pending';
                    
                    li.innerHTML = `
                        <div class="bug-desc">${desc}</div>
                        <div class="bug-status ${statusClass}">${statusText}</div>
                    `;
                    bugList.appendChild(li);
                }
            });

            // If card has bugs (matching search or just general), append it
            if (hasVisibleBugs) {
                visibleCards++;
                
                // Format version to ensure 2 decimal places (e.g. 581.8 -> 581.80)
                let versionDisplay = driver.version;
                const verNum = parseFloat(driver.version);
                if (!isNaN(verNum)) {
                    versionDisplay = verNum.toFixed(2);
                }
                
                const header = document.createElement('div');
                header.className = 'driver-header';
                header.innerHTML = `<div class="driver-version">Driver ${versionDisplay}</div>`;
                
                card.appendChild(header);
                card.appendChild(bugList);
                driverContainer.appendChild(card);
            }
        });

        // Update Button State
        if (isSearchActive) {
            loadMoreBtn.style.display = 'none';
        } else {
            loadMoreBtn.style.display = displayedCount >= allDrivers.length ? 'none' : 'inline-block';
        }

        if (visibleCards === 0 && isSearchActive) {
            driverContainer.innerHTML = '<p style="text-align:center; padding: 2rem; color: #888;">No results found.</p>';
        }
    }

    // Event Listeners
    loadMoreBtn.addEventListener('click', () => {
        displayedCount += LOAD_INCREMENT;
        renderDrivers();
    });

    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        if (query.length > 0) {
            isSearchActive = true;
        } else {
            isSearchActive = false;
        }
        renderDrivers();
    });
});
