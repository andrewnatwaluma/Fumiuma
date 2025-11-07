// realtime-results.js - Complete Real-time Results System for UMA - UPDATED WITH GRAPHS
const SUPABASE_URL = 'https://jypuappvttmkvrxowvmh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp5cHVhcHB2dHRta3ZyeG93dm1oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIxNjg3NTUsImV4cCI6MjA3Nzc0NDc1NX0.-zb9RObfSaCV8MOik1AFIW_ygq3Agh2QuWky9RXcXZA';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Global state for results
window.resultsApp = {
    currentResults: [],
    charts: {},
    autoRefreshInterval: null,
    isChartView: false,
    electionEndTime: null
};

// Initialize results page
document.addEventListener('DOMContentLoaded', function() {
    initializeResultsPage();
});

// Main initialization function
async function initializeResultsPage() {
    await checkElectionTimer();
    await loadResults();
    setupRealtimeUpdates();
    setupAutoRefresh();
    populatePositionFilter();
}

// Check election timer
async function checkElectionTimer() {
    try {
        const { data: settings, error } = await supabase
            .from('election_settings')
            .select('*')
            .single();

        if (!error && settings && settings.election_end_time) {
            window.resultsApp.electionEndTime = new Date(settings.election_end_time);
            initializeElectionTimer();
        }
    } catch (error) {
        console.error('Error checking election timer:', error);
    }
}

// Initialize election timer
function initializeElectionTimer() {
    const timerElement = document.getElementById('electionTimer');
    const countdownElement = document.getElementById('countdown');
    
    function updateTimer() {
        const now = new Date().getTime();
        const distance = window.resultsApp.electionEndTime - now;
        
        if (distance < 0) {
            timerElement.classList.add('closed');
            countdownElement.textContent = 'VOTING CLOSED - FINAL RESULTS';
            return;
        }
        
        const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);
        
        countdownElement.textContent = `${hours}h ${minutes}m ${seconds}s`;
        timerElement.style.display = 'block';
    }
    
    updateTimer();
    setInterval(updateTimer, 1000);
}

// Load and display results
async function loadResults() {
    showLoadingState();
    
    try {
        const [{ count: totalVoters }, { count: votedCount }, { data: results }] = await Promise.all([
            supabase.from('voters').select('*', { count: 'exact', head: true }),
            supabase.from('voters').select('*', { count: 'exact', head: true }).eq('has_voted', true).eq('is_invalid', false),
            supabase.from('vote_results').select('*').order('position_title')
        ]);

        updateSummaryStats(totalVoters || 0, votedCount || 0, results?.length || 0);

        if (!results || results.length === 0) {
            showNoResults();
            return;
        }

        window.resultsApp.currentResults = results;
        displayResults(results);
        updateLastUpdated();

        if (window.resultsApp.isChartView) {
            updateAllCharts(results);
        }

    } catch (error) {
        console.error('Error loading results:', error);
        showErrorState('Failed to load results. Please try again.');
    }
}

// Update summary statistics
function updateSummaryStats(totalVoters, votedCount, totalPositions) {
    const turnout = totalVoters > 0 ? Math.round((votedCount / totalVoters) * 100) : 0;
    
    document.getElementById('totalVoters').textContent = totalVoters;
    document.getElementById('votedCount').textContent = votedCount;
    document.getElementById('turnout').textContent = turnout + '%';
    document.getElementById('totalPositions').textContent = totalPositions;
}

// Display results in the container
function displayResults(results) {
    const container = document.getElementById('resultsContainer');
    
    if (!results || results.length === 0) {
        container.innerHTML = '<p class="message info">No results available yet.</p>';
        return;
    }

    const resultsByPosition = {};
    results.forEach(result => {
        if (!resultsByPosition[result.position_title]) {
            resultsByPosition[result.position_title] = [];
        }
        resultsByPosition[result.position_title].push(result);
    });

    let resultsHTML = '';

    for (const [positionTitle, candidates] of Object.entries(resultsByPosition)) {
        const totalVotes = candidates.reduce((sum, cand) => sum + cand.vote_count, 0);
        const leadingCandidate = candidates.reduce((leading, current) => 
            current.vote_count > leading.vote_count ? current : leading
        );

        resultsHTML += `
            <div class="position-results" data-position="${positionTitle}">
                <div class="position-header">
                    <h3>${positionTitle}</h3>
                    <span class="total-votes">${totalVotes} total votes</span>
                </div>
                <div class="position-leader">
                    <i class="fas fa-crown" style="color: gold;"></i>
                    <strong>Current Leader:</strong> ${leadingCandidate.candidate_name} 
                    (${Math.round((leadingCandidate.vote_count / totalVotes) * 100)}%)
                </div>
                <div class="candidates-list">
        `;

        candidates.sort((a, b) => b.vote_count - a.vote_count)
                 .forEach((candidate, index) => {
            const percentage = totalVotes > 0 ? Math.round((candidate.vote_count / totalVotes) * 100) : 0;
            const isLeading = index === 0;
            
            resultsHTML += `
                <div class="candidate-result ${isLeading ? 'leading' : ''}">
                    <div class="candidate-info">
                        <span class="candidate-rank">${index + 1}.</span>
                        <span class="candidate-name">${candidate.candidate_name}</span>
                        ${isLeading ? '<span class="leading-badge"><i class="fas fa-crown"></i> Leading</span>' : ''}
                    </div>
                    <div class="candidate-votes">
                        <span class="vote-count">${candidate.vote_count} votes</span>
                        <span class="vote-percentage">${percentage}%</span>
                        <div class="vote-bar">
                            <div class="vote-progress" style="width: ${percentage}%"></div>
                        </div>
                    </div>
                </div>
            `;
        });

        resultsHTML += `
                </div>
                <!-- Graph for this position -->
                <div class="position-graph">
                    <canvas id="chart-${positionTitle.replace(/[^a-zA-Z0-9]/g, '-')}" width="400" height="200"></canvas>
                </div>
            </div>
        `;
    }

    container.innerHTML = resultsHTML;
    document.getElementById('noResultsSection').classList.remove('active');
    
    // Create charts for all positions
    updateAllCharts(results);
}

// Update all charts for each position
function updateAllCharts(results) {
    const resultsByPosition = {};
    results.forEach(result => {
        if (!resultsByPosition[result.position_title]) {
            resultsByPosition[result.position_title] = [];
        }
        resultsByPosition[result.position_title].push(result);
    });

    for (const [positionTitle, candidates] of Object.entries(resultsByPosition)) {
        updateChartForPosition(positionTitle, candidates);
    }
}

// Update chart for a specific position
function updateChartForPosition(positionTitle, candidates) {
    const chartId = `chart-${positionTitle.replace(/[^a-zA-Z0-9]/g, '-')}`;
    const canvas = document.getElementById(chartId);
    
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    
    // Destroy existing chart if it exists
    if (window.resultsApp.charts[positionTitle]) {
        window.resultsApp.charts[positionTitle].destroy();
    }

    // Sort candidates by votes (descending)
    candidates.sort((a, b) => b.vote_count - a.vote_count);

    const candidateNames = candidates.map(c => c.candidate_name);
    const voteCounts = candidates.map(c => c.vote_count);
    const totalVotes = voteCounts.reduce((sum, count) => sum + count, 0);
    const percentages = voteCounts.map(count => 
        totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0
    );

    // Generate colors for the chart
    const backgroundColors = generateChartColors(candidates.length);

    window.resultsApp.charts[positionTitle] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: candidateNames,
            datasets: [{
                label: `Votes for ${positionTitle}`,
                data: voteCounts,
                backgroundColor: backgroundColors,
                borderColor: backgroundColors.map(color => color.replace('0.8', '1')),
                borderWidth: 2,
                borderRadius: 5,
                borderSkipped: false,
            }]
        },
        options: {
            responsive: true,
            plugins: {
                title: {
                    display: true,
                    text: `${positionTitle} - Vote Distribution`,
                    font: {
                        size: 16,
                        weight: 'bold'
                    }
                },
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.dataset.label || '';
                            const value = context.parsed.y;
                            const percentage = totalVotes > 0 ? Math.round((value / totalVotes) * 100) : 0;
                            return `${label}: ${value} votes (${percentage}%)`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Number of Votes'
                    },
                    ticks: {
                        stepSize: 1
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Candidates'
                    },
                    ticks: {
                        autoSkip: false,
                        maxRotation: 45,
                        minRotation: 45
                    }
                }
            },
            animation: {
                duration: 1000,
                easing: 'easeOutQuart'
            }
        }
    });

    // Also create a pie chart for percentages
    createPieChartForPosition(positionTitle, candidates, totalVotes);
}

// Create pie chart for a position
function createPieChartForPosition(positionTitle, candidates, totalVotes) {
    const pieChartId = `pie-chart-${positionTitle.replace(/[^a-zA-Z0-9]/g, '-')}`;
    
    // Check if pie chart container exists, if not create it
    let pieContainer = document.getElementById(pieChartId);
    if (!pieContainer) {
        const positionElement = document.querySelector(`[data-position="${positionTitle}"]`);
        if (positionElement) {
            pieContainer = document.createElement('div');
            pieContainer.id = pieChartId;
            pieContainer.className = 'position-pie-chart';
            pieContainer.innerHTML = '<h4>Percentage Distribution</h4>';
            positionElement.appendChild(pieContainer);
            
            const canvas = document.createElement('canvas');
            canvas.width = 300;
            canvas.height = 300;
            pieContainer.appendChild(canvas);
        }
    }

    if (!pieContainer) return;

    const canvas = pieContainer.querySelector('canvas');
    const ctx = canvas.getContext('2d');

    // Destroy existing pie chart if it exists
    const pieChartKey = `pie-${positionTitle}`;
    if (window.resultsApp.charts[pieChartKey]) {
        window.resultsApp.charts[pieChartKey].destroy();
    }

    const candidateNames = candidates.map(c => c.candidate_name);
    const percentages = candidates.map(c => 
        totalVotes > 0 ? Math.round((c.vote_count / totalVotes) * 100) : 0
    );

    const backgroundColors = generateChartColors(candidates.length);

    window.resultsApp.charts[pieChartKey] = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: candidateNames,
            datasets: [{
                data: percentages,
                backgroundColor: backgroundColors,
                borderColor: 'white',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        boxWidth: 12,
                        font: {
                            size: 11
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.parsed;
                            return `${label}: ${value}%`;
                        }
                    }
                }
            },
            animation: {
                animateScale: true,
                animateRotate: true
            }
        }
    });
}

// Generate colors for charts
function generateChartColors(count) {
    const baseColors = [
        'rgba(76, 175, 80, 0.8)',   // Green
        'rgba(33, 150, 243, 0.8)',  // Blue
        'rgba(255, 152, 0, 0.8)',   // Orange
        'rgba(233, 30, 99, 0.8)',   // Pink
        'rgba(156, 39, 176, 0.8)',  // Purple
        'rgba(0, 188, 212, 0.8)',   // Cyan
        'rgba(255, 193, 7, 0.8)',   // Yellow
        'rgba(121, 85, 72, 0.8)',   // Brown
        'rgba(96, 125, 139, 0.8)',  // Blue Grey
        'rgba(139, 195, 74, 0.8)'   // Light Green
    ];

    const colors = [];
    for (let i = 0; i < count; i++) {
        colors.push(baseColors[i % baseColors.length]);
    }
    return colors;
}

// Toggle between table and chart view
function toggleView() {
    const toggleButton = document.getElementById('viewToggle');
    const resultsContainer = document.getElementById('resultsContainer');
    const chartContainer = document.getElementById('chartContainer');
    
    window.resultsApp.isChartView = !window.resultsApp.isChartView;
    
    if (window.resultsApp.isChartView) {
        resultsContainer.style.display = 'none';
        chartContainer.style.display = 'block';
        toggleButton.innerHTML = '<i class="fas fa-table"></i> Switch to Table View';
        updateAllCharts(window.resultsApp.currentResults);
    } else {
        resultsContainer.style.display = 'block';
        chartContainer.style.display = 'none';
        toggleButton.innerHTML = '<i class="fas fa-chart-bar"></i> Switch to Chart View';
    }
}

// Filter results by position
function filterResults() {
    const filterValue = document.getElementById('positionFilter').value;
    const allResults = document.querySelectorAll('.position-results');
    
    allResults.forEach(result => {
        if (filterValue === 'all' || result.dataset.position === filterValue) {
            result.style.display = 'block';
        } else {
            result.style.display = 'none';
        }
    });
}

// Populate position filter dropdown
function populatePositionFilter() {
    const filter = document.getElementById('positionFilter');
    const positions = [...new Set(window.resultsApp.currentResults.map(r => r.position_title))];
    
    filter.innerHTML = '<option value="all">All Positions</option>';
    
    positions.forEach(position => {
        const option = document.createElement('option');
        option.value = position;
        option.textContent = position;
        filter.appendChild(option);
    });
}

// Set up real-time updates
function setupRealtimeUpdates() {
    const subscription = supabase
        .channel('public-results')
        .on('postgres_changes', 
            { 
                event: 'INSERT', 
                schema: 'public', 
                table: 'votes' 
            }, 
            () => {
                console.log('New vote detected, refreshing results...');
                loadResults();
            }
        )
        .on('postgres_changes',
            {
                event: 'UPDATE',
                schema: 'public',
                table: 'voters'
            },
            () => {
                console.log('Voter status updated, refreshing results...');
                loadResults();
            }
        )
        .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                console.log('Listening for real-time vote updates...');
            }
        });
}

// Set up auto-refresh
function setupAutoRefresh() {
    const autoRefreshCheckbox = document.getElementById('autoRefresh');
    
    function startAutoRefresh() {
        window.resultsApp.autoRefreshInterval = setInterval(() => {
            if (autoRefreshCheckbox.checked) {
                loadResults();
            }
        }, 30000); // 30 seconds
    }
    
    function stopAutoRefresh() {
        if (window.resultsApp.autoRefreshInterval) {
            clearInterval(window.resultsApp.autoRefreshInterval);
        }
    }
    
    autoRefreshCheckbox.addEventListener('change', function() {
        if (this.checked) {
            startAutoRefresh();
        } else {
            stopAutoRefresh();
        }
    });
    
    // Start auto-refresh initially
    startAutoRefresh();
}

// UI State Management
function showLoadingState() {
    document.getElementById('resultsContainer').innerHTML = `
        <div class="loading-results">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Loading latest results...</p>
        </div>
    `;
}

function showNoResults() {
    document.getElementById('resultsContainer').innerHTML = '';
    document.getElementById('noResultsSection').classList.add('active');
}

function showErrorState(message) {
    document.getElementById('resultsContainer').innerHTML = `
        <div class="message error">
            <i class="fas fa-exclamation-triangle"></i>
            ${message}
        </div>
    `;
}

function updateLastUpdated() {
    const now = new Date();
    document.getElementById('updateTime').textContent = now.toLocaleString();
}

// Refresh results manually
function refreshResults() {
    loadResults();
    showMessage('Results refreshed successfully!', 'success');
}

function showMessage(message, type) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type} temporary-message`;
    messageDiv.innerHTML = `<i class="fas fa-info-circle"></i> ${message}`;
    
    const container = document.querySelector('main');
    container.insertBefore(messageDiv, container.firstChild);
    
    setTimeout(() => {
        messageDiv.remove();
    }, 3000);
}

// Make functions globally available
window.toggleView = toggleView;
window.filterResults = filterResults;
window.refreshResults = refreshResults;

// Add custom CSS for enhanced results page
const additionalCSS = `
.temporary-message {
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 1000;
    max-width: 300px;
}

.loading-results {
    text-align: center;
    padding: 40px;
    color: #666;
}

.loading-results i {
    font-size: 2em;
    margin-bottom: 10px;
}

.position-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 15px;
    padding-bottom: 10px;
    border-bottom: 2px solid #eee;
}

.position-leader {
    background: #fff3cd;
    padding: 10px;
    border-radius: 5px;
    margin-bottom: 15px;
    border-left: 4px solid #ffc107;
}

.candidate-result {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 15px;
    margin: 10px 0;
    background: white;
    border-radius: 8px;
    border: 1px solid #e0e0e0;
    transition: all 0.3s;
}

.candidate-result.leading {
    border-color: #4CAF50;
    background: #f0fff0;
    box-shadow: 0 2px 8px rgba(76, 175, 80, 0.2);
}

.candidate-info {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 1;
}

.candidate-rank {
    font-weight: bold;
    color: #666;
    min-width: 30px;
}

.leading-badge {
    background: #4CAF50;
    color: white;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 0.8em;
}

.candidate-votes {
    text-align: right;
    min-width: 150px;
}

.vote-bar {
    width: 100px;
    height: 8px;
    background: #f0f0f0;
    border-radius: 4px;
    margin-top: 5px;
    overflow: hidden;
}

.vote-progress {
    height: 100%;
    background: #4CAF50;
    transition: width 0.5s ease;
}

.results-controls {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin: 20px 0;
    flex-wrap: wrap;
    gap: 15px;
}

.filter-group, .view-options {
    display: flex;
    align-items: center;
    gap: 10px;
}

.last-updated {
    text-align: center;
    margin: 20px 0;
    padding: 15px;
    background: #f8f9fa;
    border-radius: 8px;
}

.auto-refresh {
    margin-top: 10px;
}

.results-navigation {
    display: flex;
    justify-content: center;
    gap: 15px;
    margin-top: 30px;
}

.no-results {
    text-align: center;
    padding: 60px 20px;
    color: #666;
}

.no-results i {
    margin-bottom: 20px;
}

.position-graph {
    margin-top: 20px;
    padding: 20px;
    background: white;
    border-radius: 8px;
    border: 1px solid #e0e0e0;
}

.position-pie-chart {
    margin-top: 20px;
    padding: 20px;
    background: white;
    border-radius: 8px;
    border: 1px solid #e0e0e0;
    text-align: center;
}

.position-pie-chart h4 {
    margin-bottom: 15px;
    color: #333;
    font-size: 1.1em;
}

@media (max-width: 768px) {
    .candidate-result {
        flex-direction: column;
        align-items: flex-start;
        gap: 10px;
    }
    
    .candidate-votes {
        text-align: left;
        width: 100%;
    }
    
    .results-controls {
        flex-direction: column;
        align-items: stretch;
    }
    
    .filter-group, .view-options {
        justify-content: space-between;
    }
    
    .position-graph, .position-pie-chart {
        padding: 10px;
    }
    
    .position-pie-chart canvas {
        max-width: 100%;
        height: auto;
    }
}
`;

// Inject additional CSS
const style = document.createElement('style');
style.textContent = additionalCSS;
document.head.appendChild(style);
