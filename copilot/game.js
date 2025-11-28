// Game constants
const GRID_SIZE = 50;
const TERRITORY_SIZE = 25; // Each nation gets 25 cells (blob-shaped territories)

// Player control - always controls nation index 0 (US)
let playerNationIndex = 0;
let viewingNationIndex = 0; // Which nation's stats are currently being viewed

// Nation class
class Nation {
    constructor({ name, emoji, color, territory, money = 10, politicalCapital = 10, army = 0, maxProjects = 5 }) {
        this.name = name;
        this.emoji = emoji;
        this.color = color;
        this.territory = territory; // Array of {x, y}
        this.money = money;
        this.politicalCapital = politicalCapital;
        this.projects = []; // Active projects (max 5)
        this.army = army; // Army units
        this.wars = []; // Array of nation names at war
        this.maxProjects = maxProjects; // Max project slots
    }
}

// Project class
class Project {
    constructor({ id, name, moneyCost, pcCost, moneyGen, pcGen, description, tier }) {
        this.id = id;
        this.name = name;
        this.moneyCost = moneyCost; // Initial money cost
        this.pcCost = pcCost; // Initial political capital cost
        this.moneyGen = moneyGen; // Money generated per turn
        this.pcGen = pcGen; // Political capital generated per turn
        this.description = description;
        this.tier = tier; // 'early', 'mid', 'late'
    }
}

// Available project types (balanced for different game stages)
const PROJECT_TYPES = [
    // Early game projects (lower costs, modest returns)
    new Project({
        id: 1,
        name: 'Farm Collective',
        moneyCost: 5,
        pcCost: 2,
        moneyGen: 2,
        pcGen: 0,
        description: 'Basic farming produces steady income',
        tier: 'early'
    }),
    new Project({
        id: 2,
        name: 'Town Hall',
        moneyCost: 4,
        pcCost: 3,
        moneyGen: 0,
        pcGen: 1,
        description: 'Civic center generates political influence',
        tier: 'early'
    }),
    new Project({
        id: 3,
        name: 'Trade Post',
        moneyCost: 6,
        pcCost: 1,
        moneyGen: 2,
        pcGen: 1,
        description: 'Marketplace for commerce and diplomacy',
        tier: 'early'
    }),
    
    // Mid game projects (moderate costs, good returns)
    new Project({
        id: 4,
        name: 'Factory Complex',
        moneyCost: 15,
        pcCost: 5,
        moneyGen: 5,
        pcGen: 1,
        description: 'Industrial production boosts economy',
        tier: 'mid'
    }),
    new Project({
        id: 5,
        name: 'University',
        moneyCost: 12,
        pcCost: 8,
        moneyGen: 2,
        pcGen: 3,
        description: 'Higher education enhances political power',
        tier: 'mid'
    }),
    new Project({
        id: 6,
        name: 'Banking District',
        moneyCost: 20,
        pcCost: 4,
        moneyGen: 7,
        pcGen: 0,
        description: 'Financial hub generates wealth',
        tier: 'mid'
    }),
    new Project({
        id: 7,
        name: 'Parliament Building',
        moneyCost: 10,
        pcCost: 12,
        moneyGen: 1,
        pcGen: 4,
        description: 'Legislative power strengthens governance',
        tier: 'mid'
    }),
    
    // Late game projects (high costs, excellent returns)
    new Project({
        id: 8,
        name: 'Tech Megacorp',
        moneyCost: 35,
        pcCost: 15,
        moneyGen: 10,
        pcGen: 3,
        description: 'Cutting-edge technology dominates markets',
        tier: 'late'
    }),
    new Project({
        id: 9,
        name: 'Global Embassy',
        moneyCost: 25,
        pcCost: 25,
        moneyGen: 3,
        pcGen: 8,
        description: 'International presence expands influence',
        tier: 'late'
    }),
    new Project({
        id: 10,
        name: 'Wonder of the World',
        moneyCost: 50,
        pcCost: 30,
        moneyGen: 8,
        pcGen: 8,
        description: 'Magnificent monument brings prestige and wealth',
        tier: 'late'
    })
];

// Generate random non-overlapping territories for 8 nations
function generateRandomTerritories(numNations, territorySize, gridSize) {
    const territories = [];
    const occupied = Array.from({ length: gridSize }, () => Array(gridSize).fill(false));
    let attempts = 0;
    const maxAttempts = 2000;
    
    while (territories.length < numNations && attempts < maxAttempts) {
        attempts++;
        
        // Find a random starting point
        const startX = Math.floor(Math.random() * gridSize);
        const startY = Math.floor(Math.random() * gridSize);
        
        // Skip if already occupied
        if (occupied[startY][startX]) {
            continue;
        }
        
        // Generate a blob territory using flood-fill algorithm
        const territory = generateBlobTerritory(startX, startY, territorySize, gridSize, occupied);
        
        // If we successfully generated a territory of the right size
        if (territory.length === territorySize) {
            // Mark all cells as occupied
            for (const cell of territory) {
                occupied[cell.y][cell.x] = true;
            }
            territories.push(territory);
        }
    }
    
    // Fallback to hardcoded if not enough found
    if (territories.length < numNations) {
        // Clear occupied array and try with hardcoded starting positions
        for (let i = 0; i < gridSize; i++) {
            for (let j = 0; j < gridSize; j++) {
                occupied[i][j] = false;
            }
        }
        
        const fallbackStarts = [
            {x: 5, y: 5},
            {x: 40, y: 5},
            {x: 5, y: 22},
            {x: 40, y: 22},
            {x: 5, y: 40},
            {x: 40, y: 40},
            {x: 22, y: 15},
            {x: 22, y: 30}
        ];
        
        territories.length = 0; // Clear existing territories
        
        for (let i = 0; i < numNations && i < fallbackStarts.length; i++) {
            const start = fallbackStarts[i];
            const territory = generateBlobTerritory(start.x, start.y, territorySize, gridSize, occupied);
            if (territory.length > 0) {
                for (const cell of territory) {
                    occupied[cell.y][cell.x] = true;
                }
                territories.push(territory);
            }
        }
    }
    
    return territories;
}

// Generate a blob-shaped territory using a controlled random growth algorithm
function generateBlobTerritory(startX, startY, targetSize, gridSize, occupied) {
    const territory = [];
    const frontier = []; // Cells that can be expanded to
    
    // Add starting cell
    territory.push({ x: startX, y: startY });
    
    // Add neighbors to frontier
    const addNeighborsToFrontier = (x, y) => {
        const neighbors = [
            { x: x, y: y - 1 }, // North
            { x: x + 1, y: y }, // East
            { x: x, y: y + 1 }, // South
            { x: x - 1, y: y }  // West
        ];
        
        for (const neighbor of neighbors) {
            // Check if neighbor is valid and not occupied
            if (neighbor.x >= 0 && neighbor.x < gridSize &&
                neighbor.y >= 0 && neighbor.y < gridSize &&
                !occupied[neighbor.y][neighbor.x] &&
                !territory.some(cell => cell.x === neighbor.x && cell.y === neighbor.y) &&
                !frontier.some(cell => cell.x === neighbor.x && cell.y === neighbor.y)) {
                frontier.push(neighbor);
            }
        }
    };
    
    addNeighborsToFrontier(startX, startY);
    
    // Grow the territory to the target size
    while (territory.length < targetSize && frontier.length > 0) {
        // Pick a random cell from the frontier
        // Bias towards cells closer to existing territory for more compact shapes
        const index = Math.floor(Math.random() * Math.min(frontier.length, 4));
        const cell = frontier.splice(index, 1)[0];
        
        // Add it to territory
        territory.push(cell);
        
        // Add its neighbors to frontier
        addNeighborsToFrontier(cell.x, cell.y);
    }
    
    // Return empty if we couldn't reach target size
    if (territory.length < targetSize) {
        return [];
    }
    
    return territory;
}

const TERRITORIES = generateRandomTerritories(8, TERRITORY_SIZE, GRID_SIZE);

// Initialize 8 nations
const NATIONS = [
    new Nation({ name: 'United States', emoji: 'US', color: '#FF0000', territory: TERRITORIES[0] }), // Red (Primary)
    new Nation({ name: 'China', emoji: 'CN', color: '#0000FF', territory: TERRITORIES[1] }), // Blue (Primary)
    new Nation({ name: 'Russia', emoji: 'RU', color: '#00FF00', territory: TERRITORIES[2] }), // Green (Primary)
    new Nation({ name: 'United Kingdom', emoji: 'UK', color: '#FFFF00', territory: TERRITORIES[3] }), // Yellow (Secondary)
    new Nation({ name: 'France', emoji: 'FR', color: '#FF00FF', territory: TERRITORIES[4] }), // Magenta (Secondary)
    new Nation({ name: 'Germany', emoji: 'DE', color: '#00FFFF', territory: TERRITORIES[5] }), // Cyan (Secondary)
    new Nation({ name: 'Japan', emoji: 'JP', color: '#FFA500', territory: TERRITORIES[6] }), // Orange (Secondary)
    new Nation({ name: 'India', emoji: 'IN', color: '#800080', territory: TERRITORIES[7] }) // Purple (Secondary)
];

function generateTerritory(startX, startY, width, height) {
    const territory = [];
    for (let y = startY; y < startY + height; y++) {
        for (let x = startX; x < startX + width; x++) {
            territory.push({ x, y });
        }
    }
    return territory;
}

function initializeGrid(capturedCells = []) {
    const gridElement = document.getElementById('game-grid');
    gridElement.innerHTML = '';
    for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
            const cell = document.createElement('div');
            cell.className = 'grid-cell';
            cell.dataset.x = x;
            cell.dataset.y = y;
            const nationIndex = findNationForCell(x, y);
            if (nationIndex !== -1) {
                const nation = NATIONS[nationIndex];
                cell.style.backgroundColor = nation.color;
                cell.textContent = nation.emoji;
                cell.dataset.nation = nationIndex;
                
                // Add captured animation if this cell was just captured
                if (capturedCells.some(c => c.x === x && c.y === y)) {
                    cell.classList.add('captured');
                    // Remove the class after animation completes
                    setTimeout(() => {
                        cell.classList.remove('captured');
                    }, 800);
                }
            }
            cell.addEventListener('click', () => handleCellClick(x, y, nationIndex));
            gridElement.appendChild(cell);
        }
    }
}

function findNationForCell(x, y) {
    for (let i = 0; i < NATIONS.length; i++) {
        const nation = NATIONS[i];
        if (nation.territory.some(cell => cell.x === x && cell.y === y)) {
            return i;
        }
    }
    return -1;
}

// Check if a tile is adjacent to any tile in a nation's territory
function isTileAdjacentToNation(x, y, nation) {
    for (const tile of nation.territory) {
        const dx = Math.abs(tile.x - x);
        const dy = Math.abs(tile.y - y);
        // Check for adjacent cells (not diagonal)
        if ((dx === 1 && dy === 0) || (dx === 0 && dy === 1)) {
            return true;
        }
    }
    return false;
}

// Check if two nations share a border (have adjacent tiles)
function doNationsShareBorder(nation1, nation2) {
    for (const tile1 of nation1.territory) {
        for (const tile2 of nation2.territory) {
            const dx = Math.abs(tile1.x - tile2.x);
            const dy = Math.abs(tile1.y - tile2.y);
            // Check for adjacent cells (not diagonal)
            if ((dx === 1 && dy === 0) || (dx === 0 && dy === 1)) {
                return true;
            }
        }
    }
    return false;
}

// Get all unclaimed tiles adjacent to a nation's territory
function getAdjacentUnclaimedTiles(nation) {
    const unclaimedTiles = [];
    const checked = new Set();
    
    for (const tile of nation.territory) {
        const neighbors = [
            { x: tile.x, y: tile.y - 1 },
            { x: tile.x + 1, y: tile.y },
            { x: tile.x, y: tile.y + 1 },
            { x: tile.x - 1, y: tile.y }
        ];
        
        for (const neighbor of neighbors) {
            const key = `${neighbor.x},${neighbor.y}`;
            if (checked.has(key)) continue;
            checked.add(key);
            
            if (neighbor.x >= 0 && neighbor.x < GRID_SIZE &&
                neighbor.y >= 0 && neighbor.y < GRID_SIZE &&
                findNationForCell(neighbor.x, neighbor.y) === -1) {
                unclaimedTiles.push(neighbor);
            }
        }
    }
    
    return unclaimedTiles;
}

function handleCellClick(x, y, nationIndex) {
    if (nationIndex !== -1) {
        // Only view the nation, don't change control
        viewingNationIndex = nationIndex;
        selectedUnclaimedTile = null;
        setCurrentNation(nationIndex);
    } else {
        // Clicking unclaimed tile - store it and show "Unclaimed" info
        selectedUnclaimedTile = { x, y };
        viewingNationIndex = -1; // Special value for unclaimed
        setCurrentNation(-1);
    }
}

function populateNationSelect() {
    const select = document.getElementById('nation-select');
    select.innerHTML = '';
    NATIONS.forEach((nation, idx) => {
        const option = document.createElement('option');
        option.value = idx;
        option.textContent = `${nation.emoji} ${nation.name}`;
        select.appendChild(option);
    });
    select.selectedIndex = 0;
    viewingNationIndex = 0;
    setCurrentNation(0);
    select.style.display = 'block';
    select.addEventListener('change', (e) => {
        // Update viewing nation but not player control
        viewingNationIndex = parseInt(e.target.value);
        setCurrentNation(parseInt(e.target.value));
    });
}

function setCurrentNation(nationIndex) {
    if (nationIndex !== null && nationIndex >= 0) {
        const nation = NATIONS[nationIndex];
        const isPlayerNation = (nationIndex === playerNationIndex);
        
        // Update display with indicator if viewing another nation
        if (isPlayerNation) {
            document.getElementById('current-nation').textContent = `${nation.emoji} ${nation.name} [YOU]`;
        } else {
            document.getElementById('current-nation').textContent = `${nation.emoji} ${nation.name} [VIEWING]`;
        }
        
        document.getElementById('territory-size').textContent = `${nation.territory.length} cells`;
        document.getElementById('nation-money').textContent = `$${nation.money}`;
        document.getElementById('nation-pc').textContent = nation.politicalCapital;
        document.getElementById('army-count').textContent = nation.army;
        document.getElementById('projects-count').textContent = `${nation.projects.length}/${nation.maxProjects}`;
        document.getElementById('nation-select').value = nationIndex;
        
        // Enable/disable control buttons based on whether this is the player's nation
        const buyArmyBtn = document.getElementById('buy-army-btn');
        const declareWarBtn = document.getElementById('declare-war-btn');
        const tradeBtn = document.getElementById('trade-propose-btn');
        const claimTileBtn = document.getElementById('claim-tile-btn');
        
        if (buyArmyBtn) {
            buyArmyBtn.disabled = !isPlayerNation;
            buyArmyBtn.style.display = 'block';
        }
        if (declareWarBtn) {
            declareWarBtn.disabled = !isPlayerNation;
            declareWarBtn.style.display = 'block';
        }
        if (tradeBtn) tradeBtn.disabled = !isPlayerNation;
        if (claimTileBtn) claimTileBtn.style.display = 'none';
        
        // Populate war target dropdown - only show bordering nations
        const warTargetSelect = document.getElementById('war-target');
        if (warTargetSelect) {
            warTargetSelect.innerHTML = '';
            warTargetSelect.disabled = !isPlayerNation;
            
            let hasBorderingNations = false;
            NATIONS.forEach((n, idx) => {
                if (n.name !== nation.name && doNationsShareBorder(nation, n)) {
                    const option = document.createElement('option');
                    option.value = n.name;
                    option.textContent = `${n.emoji} ${n.name}`;
                    warTargetSelect.appendChild(option);
                    hasBorderingNations = true;
                }
            });
            
            // If no bordering nations, add a disabled placeholder
            if (!hasBorderingNations) {
                const option = document.createElement('option');
                option.value = '';
                option.textContent = 'No bordering nations';
                option.disabled = true;
                warTargetSelect.appendChild(option);
            }
            
            // Disable war button if no valid targets
            if (declareWarBtn) {
                declareWarBtn.disabled = !isPlayerNation || !hasBorderingNations;
            }
        }

        // Update projects display (disable building if not player nation)
        updateProjectsDisplay(nationIndex, isPlayerNation);

        // Update Diplomacy panel
        updateDiplomacyPanel(nation, isPlayerNation);
        renderTradeHistory();

        // Update income summary for selected nation
        let moneyIncome = 0;
        let pcIncome = 0;
        nation.projects.forEach(project => {
            moneyIncome += project.moneyGen;
            pcIncome += project.pcGen;
        });
        lastIncome.money = moneyIncome;
        lastIncome.pc = pcIncome;
        updateTurnDisplay();
    } else {
        // Unclaimed territory view
        document.getElementById('current-nation').textContent = 'Unclaimed';
        document.getElementById('territory-size').textContent = '0 cells';
        document.getElementById('nation-money').textContent = '-';
        document.getElementById('nation-pc').textContent = '-';
        document.getElementById('army-count').textContent = '-';
        document.getElementById('projects-count').textContent = '-';

        // Show claim button if this tile is adjacent to player's territory
        const claimTileBtn = document.getElementById('claim-tile-btn');
        if (claimTileBtn && selectedUnclaimedTile) {
            const playerNation = NATIONS[playerNationIndex];
            const isAdjacent = isTileAdjacentToNation(selectedUnclaimedTile.x, selectedUnclaimedTile.y, playerNation);
            claimTileBtn.style.display = isAdjacent ? 'block' : 'none';
        }

        // Disable all control buttons
        const buyArmyBtn = document.getElementById('buy-army-btn');
        const declareWarBtn = document.getElementById('declare-war-btn');
        const tradeBtn = document.getElementById('trade-propose-btn');
        if (buyArmyBtn) buyArmyBtn.style.display = 'none';
        if (declareWarBtn) declareWarBtn.style.display = 'none';
        if (tradeBtn) tradeBtn.disabled = true;

        // Clear projects display
        updateProjectsDisplay(null, false);
        lastIncome.money = 0;
        lastIncome.pc = 0;
        updateTurnDisplay();
    }
}

// Diplomacy panel logic
// Army purchasing logic
const ARMY_COST = 5; // Cost per army unit
const TILE_CLAIM_COST = 2; // Cost to claim an unclaimed tile
// Track wars to resolve next turn
let pendingWars = [];
// Track selected unclaimed tile for claiming
let selectedUnclaimedTile = null;
document.addEventListener('DOMContentLoaded', () => {
    const buyArmyBtn = document.getElementById('buy-army-btn');
    if (buyArmyBtn) {
        buyArmyBtn.addEventListener('click', () => {
            // Always use player nation index, not viewed nation
            const nation = NATIONS[playerNationIndex];
            if (!nation) return;
            if (nation.money >= ARMY_COST) {
                nation.money -= ARMY_COST;
                nation.army += 1;
                // Refresh display for currently viewed nation
                setCurrentNation(viewingNationIndex);
                renderWarStatus();
                showNotification('Army unit purchased!', 'success');
            } else {
                showNotification('Not enough money to buy army!', 'error');
            }
        });
    }
    
    // Claim Tile logic
    const claimTileBtn = document.getElementById('claim-tile-btn');
    if (claimTileBtn) {
        claimTileBtn.addEventListener('click', () => {
            const nation = NATIONS[playerNationIndex];
            if (!nation || !selectedUnclaimedTile) return;
            
            // Check requirements
            if (nation.money < TILE_CLAIM_COST) {
                showNotification('Not enough money to claim tile!', 'error');
                return;
            }
            if (nation.army < 1) {
                showNotification('Need at least 1 army unit to claim tiles!', 'error');
                return;
            }
            
            // Check adjacency
            if (!isTileAdjacentToNation(selectedUnclaimedTile.x, selectedUnclaimedTile.y, nation)) {
                showNotification('Tile must be adjacent to your territory!', 'error');
                return;
            }
            
            // Claim the tile
            nation.money -= TILE_CLAIM_COST;
            nation.territory.push({ x: selectedUnclaimedTile.x, y: selectedUnclaimedTile.y });
            
            // Clear selection and refresh grid
            const capturedCells = [{ x: selectedUnclaimedTile.x, y: selectedUnclaimedTile.y }];
            selectedUnclaimedTile = null;
            initializeGrid(capturedCells);
            
            // Refresh display - show player nation again
            viewingNationIndex = playerNationIndex;
            setCurrentNation(playerNationIndex);
            showNotification('Tile claimed!', 'success');
        });
    }
    
    // Declare War logic
    const declareWarBtn = document.getElementById('declare-war-btn');
    if (declareWarBtn) {
        declareWarBtn.addEventListener('click', () => {
            // Always use player nation index, not viewed nation
            const nation = NATIONS[playerNationIndex];
            const warTargetSelect = document.getElementById('war-target');
            const targetName = warTargetSelect ? warTargetSelect.value : null;
            
            if (!targetName || targetName === '') {
                showNotification('No valid nations to declare war on! Must border at least one nation.', 'error');
                return;
            }
            
            const targetNation = NATIONS.find(n => n.name === targetName);
            const WAR_PC_COST = 5;
            if (!nation || !targetNation) return;
            
            if (nation.politicalCapital < WAR_PC_COST) {
                showNotification('Not enough political capital to declare war!', 'error');
                return;
            }
            if (nation.wars.includes(targetNation.name)) {
                showNotification('Already at war with this nation!', 'error');
                return;
            }
            nation.politicalCapital -= WAR_PC_COST;
            nation.wars.push(targetNation.name);
            targetNation.wars.push(nation.name);
            pendingWars.push({
                attacker: nation.name,
                defender: targetNation.name,
                turn: currentTurn + 1 // resolve next turn
            });
            // Refresh display for currently viewed nation
            setCurrentNation(viewingNationIndex);
            renderWarStatus();
            showNotification(`War declared on ${targetNation.emoji} ${targetNation.name}!`, 'success');
        });
    }
    renderWarStatus();
});
// Render war status panel
function renderWarStatus() {
    const warStatusList = document.getElementById('war-status-list');
    if (!warStatusList) return;
    
    // Group wars by defender to show coalitions
    const warsByDefender = {};
    NATIONS.forEach(nation => {
        nation.wars.forEach(targetName => {
            // Add this nation as an attacker of the target
            if (!warsByDefender[targetName]) {
                warsByDefender[targetName] = [];
            }
            warsByDefender[targetName].push(nation);
        });
    });
    
    // Convert to array and remove duplicates where nation attacks itself
    const wars = [];
    Object.keys(warsByDefender).forEach(defenderName => {
        const defender = NATIONS.find(n => n.name === defenderName);
        if (!defender) return;
        
        const attackers = warsByDefender[defenderName].filter(a => a.name !== defenderName);
        if (attackers.length === 0) return;
        
        // Calculate total forces
        const totalAttackerArmy = attackers.reduce((sum, a) => sum + a.army, 0);
        const defenderArmy = defender.army;
        
        let winner = null;
        if (totalAttackerArmy > defenderArmy) {
            winner = attackers.length === 1 ? attackers[0].name : "Coalition";
        } else if (defenderArmy > totalAttackerArmy) {
            winner = defender.name;
        }
        
        wars.push({
            attackers: attackers,
            defender: defender,
            winner: winner,
            totalAttackerArmy: totalAttackerArmy,
            defenderArmy: defenderArmy
        });
    });
    
    if (wars.length === 0) {
        warStatusList.innerHTML = '<p class="no-war">No wars declared</p>';
        return;
    }
    
    warStatusList.innerHTML = '';
    wars.forEach(war => {
        const div = document.createElement('div');
        div.className = 'war-status-entry';
        
        let attackerDisplay;
        if (war.attackers.length === 1) {
            attackerDisplay = `${war.attackers[0].emoji} ${war.attackers[0].name} (${war.totalAttackerArmy}⚔️)`;
        } else {
            const attackerNames = war.attackers.map(a => `${a.emoji} ${a.name}`).join(', ');
            attackerDisplay = `Coalition [${attackerNames}] (${war.totalAttackerArmy}⚔️)`;
        }
        
        const defenderDisplay = `${war.defender.emoji} ${war.defender.name} (${war.defenderArmy}⚔️)`;
        
        div.innerHTML = `<span>${attackerDisplay} <b>vs</b> ${defenderDisplay}</span>` +
            (war.winner ? `<span class="war-winner">Winner: ${war.winner}</span>` : '');
        warStatusList.appendChild(div);
    });
}
function getOtherNations(currentNationName) {
    return NATIONS.filter(n => n.name !== currentNationName);
}

function updateDiplomacyPanel(currentNation, isPlayerNation = true) {
    // Nation list
    const nationListDiv = document.getElementById('diplomacy-nation-list');
    if (!nationListDiv) return;
    nationListDiv.innerHTML = '';
    getOtherNations(currentNation.name).forEach(nation => {
        const div = document.createElement('div');
        div.className = 'diplomacy-nation-row';
        div.innerHTML = `<span>${nation.emoji} ${nation.name}</span>`;
        nationListDiv.appendChild(div);
    });

    // Trade target select
    const tradeTargetSelect = document.getElementById('trade-target');
    if (!tradeTargetSelect) return;
    tradeTargetSelect.innerHTML = '';
    tradeTargetSelect.disabled = !isPlayerNation;
    getOtherNations(currentNation.name).forEach(nation => {
        const option = document.createElement('option');
        option.value = nation.name;
        option.textContent = `${nation.emoji} ${nation.name}`;
        tradeTargetSelect.appendChild(option);
    });
    
    // Disable trade input fields if not player nation
    const tradeInputs = ['offer-money', 'offer-pc', 'request-money', 'request-pc'];
    tradeInputs.forEach(inputId => {
        const input = document.getElementById(inputId);
        if (input) input.disabled = !isPlayerNation;
    });
}

// Trade history log
let tradeHistory = [];
function renderTradeHistory() {
    const tradeHistoryList = document.getElementById('trade-history-list');
    if (!tradeHistoryList) return;
    tradeHistoryList.innerHTML = '';
    tradeHistory.forEach(entry => {
        const li = document.createElement('li');
        li.className = 'trade-history-entry';
        li.innerHTML = entry; // Use innerHTML to render HTML content
        tradeHistoryList.appendChild(li);
    });
}

// Update the projects display for the current nation
function updateProjectsDisplay(nationIndex, isPlayerNation = true) {
    const availableProjectsList = document.getElementById('available-projects-list');
    const activeProjectsList = document.getElementById('active-projects-list');
    const projectsCount = document.getElementById('projects-count');
    const availableProjectsCount = document.getElementById('available-projects-count');
    
    if (nationIndex === null || nationIndex < 0) {
        availableProjectsList.innerHTML = '<p class="no-projects">Select a nation to view projects</p>';
        activeProjectsList.innerHTML = '<p class="no-projects">No active projects</p>';
        projectsCount.textContent = '0/5';
        if (availableProjectsCount) availableProjectsCount.textContent = '';
        return;
    }
    
    const nation = NATIONS[nationIndex];
    projectsCount.textContent = `${nation.projects.length}/${nation.maxProjects}`;
    if (availableProjectsCount) {
        availableProjectsCount.textContent = `(${nation.projects.length}/${nation.maxProjects})`;
    }
    
    // Display available projects
    availableProjectsList.innerHTML = '';
    PROJECT_TYPES.forEach(projectType => {
        const projectCard = createProjectCard(projectType, nation, nationIndex, isPlayerNation);
        availableProjectsList.appendChild(projectCard);
    });
    
    // Display active projects
    activeProjectsList.innerHTML = '';
    if (nation.projects.length === 0) {
        activeProjectsList.innerHTML = '<p class="no-projects">No active projects yet</p>';
    } else {
        nation.projects.forEach(project => {
            const activeCard = createActiveProjectCard(project, isPlayerNation);
            activeProjectsList.appendChild(activeCard);
        });
    }
}

// Create a project card for available projects
function createProjectCard(projectType, nation, nationIndex, isPlayerNation = true) {
    const card = document.createElement('div');
    card.className = 'project-card';
    
    // Check if nation can afford the project
    const canAfford = nation.money >= projectType.moneyCost && 
                      nation.politicalCapital >= projectType.pcCost;
    const hasSpace = nation.projects.length < nation.maxProjects;
    const canBuild = canAfford && hasSpace && isPlayerNation;
    
    if (!canBuild) {
        card.classList.add('disabled');
    }
    
    card.innerHTML = `
        <div class="project-header">
            <h4 class="project-name">${projectType.name}</h4>
            <span class="project-tier ${projectType.tier}">${projectType.tier.toUpperCase()}</span>
        </div>
        <p class="project-description">${projectType.description}</p>
        <div class="project-costs">
            <div class="cost-item ${nation.money >= projectType.moneyCost ? 'affordable' : 'expensive'}">
                <span class="cost-label">$ Cost:</span>
                <span class="cost-value">$${projectType.moneyCost}</span>
            </div>
            <div class="cost-item ${nation.politicalCapital >= projectType.pcCost ? 'affordable' : 'expensive'}">
                <span class="cost-label">PC Cost:</span>
                <span class="cost-value">${projectType.pcCost}</span>
            </div>
        </div>
        <div class="project-benefits">
            <div class="benefit-item">
                <span class="benefit-label">$ Generates:</span>
                <span class="benefit-value">+$${projectType.moneyGen}/turn</span>
            </div>
            <div class="benefit-item">
                <span class="benefit-label">PC Generates:</span>
                <span class="benefit-value">+${projectType.pcGen}/turn</span>
            </div>
        </div>
        <button class="build-btn" ${!canBuild ? 'disabled' : ''}>
            ${!isPlayerNation ? 'Not Your Nation' : !hasSpace ? 'Project Limit Reached' : !canAfford ? 'Cannot Afford' : 'Build Project'}
        </button>
    `;
    
    // Add click handler to build button
    const buildBtn = card.querySelector('.build-btn');
    buildBtn.addEventListener('click', () => {
        if (canBuild) {
            buildProject(nationIndex, projectType);
        }
    });
    
    return card;
}

// Create a card for active projects
function createActiveProjectCard(project, isPlayerNation = true) {
    const card = document.createElement('div');
    card.className = 'active-project-card';
    
    card.innerHTML = `
        <div class="active-project-header">
            <h4 class="active-project-name">${project.name}</h4>
            <span class="project-tier ${project.tier}">${project.tier.toUpperCase()}</span>
        </div>
        <div class="active-project-income">
            <div class="income-item">
                <span>$ Income:</span>
                <span class="income-value">+$${project.moneyGen}/turn</span>
            </div>
            <div class="income-item">
                <span>PC Income:</span>
                <span class="income-value">+${project.pcGen}/turn</span>
            </div>
        </div>
        <button class="destroy-project-btn" ${!isPlayerNation ? 'disabled' : ''}>
            ${isPlayerNation ? 'Destroy Project' : 'Not Your Nation'}
        </button>
    `;
    // Add destroy button logic (only if player nation)
    const destroyBtn = card.querySelector('.destroy-project-btn');
    if (isPlayerNation) {
        destroyBtn.addEventListener('click', () => {
            destroyProject(project);
        });
    }
    return card;
}
// Destroy project logic
function destroyProject(project) {
    // Always use player nation
    const nation = NATIONS[playerNationIndex];
    const idx = nation.projects.findIndex(p => p.id === project.id);
    if (idx !== -1) {
        nation.projects.splice(idx, 1);
        // Refresh currently viewed nation
        setCurrentNation(viewingNationIndex);
        showNotification(`Destroyed ${project.name}.`, 'info');
    }
}

// Build a project for a nation
function buildProject(nationIndex, projectType) {
    const nation = NATIONS[nationIndex];
    
    // Validate the build
    if (nation.projects.length >= nation.maxProjects) {
        showNotification(`Cannot build more than ${nation.maxProjects} projects!`, 'error');
        return;
    }
    
    if (nation.money < projectType.moneyCost) {
        showNotification('Not enough money!', 'error');
        return;
    }
    
    if (nation.politicalCapital < projectType.pcCost) {
        showNotification('Not enough political capital!', 'error');
        return;
    }
    
    // Deduct costs
    nation.money -= projectType.moneyCost;
    nation.politicalCapital -= projectType.pcCost;
    
    // Add project to nation's active projects
    nation.projects.push({...projectType}); // Create a copy of the project
    
    // Update display for currently viewed nation
    setCurrentNation(viewingNationIndex);
    
    // Show success message
    showNotification(`Built ${projectType.name}!`, 'success');
}

// Show notification message
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.classList.add('show');
    }, 10);
    
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 2000);
}

function createLegend() {
    const legendItems = document.getElementById('legend-items');
    legendItems.innerHTML = '';
    NATIONS.forEach((nation, index) => {
        const item = document.createElement('div');
        item.className = 'legend-item';
        const colorBox = document.createElement('div');
        colorBox.className = 'legend-color';
        colorBox.style.backgroundColor = nation.color;
        colorBox.textContent = nation.emoji;
        const name = document.createElement('div');
        name.className = 'legend-name';
        name.textContent = nation.name;
        item.appendChild(colorBox);
        item.appendChild(name);
        legendItems.appendChild(item);
    });
}

// Trade proposal function
// AI decision-making for trade proposals
function evaluateTradeProposal(proposer, target, offerMoney, offerPC, requestMoney, requestPC) {
    // Calculate the value of what's being offered vs requested
    // Money and PC are weighted equally (1:1 ratio)
    const offerValue = offerMoney + offerPC;
    const requestValue = requestMoney + requestPC;
    
    // Check if target nation can afford what's being requested
    if (target.money < requestMoney || target.politicalCapital < requestPC) {
        return false; // Can't afford the trade
    }
    
    // Calculate fairness ratio (how good the deal is for the target)
    // Higher ratio = better deal for target
    let fairnessRatio = 0;
    if (requestValue === 0) {
        // Pure gift - always accept if we can afford it (which is nothing)
        fairnessRatio = 10;
    } else {
        fairnessRatio = offerValue / requestValue;
    }
    
    // Base acceptance chance based on fairness
    let acceptChance = 0;
    if (fairnessRatio >= 1.5) {
        acceptChance = 0.95; // Very favorable - 95% acceptance
    } else if (fairnessRatio >= 1.2) {
        acceptChance = 0.80; // Favorable - 80% acceptance
    } else if (fairnessRatio >= 1.0) {
        acceptChance = 0.60; // Fair - 60% acceptance
    } else if (fairnessRatio >= 0.8) {
        acceptChance = 0.35; // Slightly unfavorable - 35% acceptance
    } else if (fairnessRatio >= 0.6) {
        acceptChance = 0.15; // Unfavorable - 15% acceptance
    } else {
        acceptChance = 0.05; // Very unfavorable - 5% acceptance
    }
    
    // Modify acceptance based on target's current resources (desperation factor)
    // If target is low on resources, they're more likely to accept
    const targetResourceScore = target.money + target.politicalCapital;
    if (targetResourceScore < 10) {
        acceptChance += 0.15; // Desperate for resources
    } else if (targetResourceScore < 20) {
        acceptChance += 0.10; // Low on resources
    } else if (targetResourceScore > 100) {
        acceptChance -= 0.10; // Rich nations are pickier
    }
    
    // Add some randomness for variety
    acceptChance += (Math.random() * 0.1 - 0.05); // ±5% random factor
    
    // Clamp acceptance chance between 0 and 1
    acceptChance = Math.max(0, Math.min(1, acceptChance));
    
    // Make the decision
    return Math.random() < acceptChance;
}

function proposeTrade() {
    // console.log('proposeTrade() called');
    // Always use player nation, not viewed nation
    const currentNation = NATIONS[playerNationIndex];
    const targetNationName = document.getElementById('trade-target').value;
    const offerMoney = parseInt(document.getElementById('offer-money').value) || 0;
    const offerPC = parseInt(document.getElementById('offer-pc').value) || 0;
    const requestMoney = parseInt(document.getElementById('request-money').value) || 0;
    const requestPC = parseInt(document.getElementById('request-pc').value) || 0;
    
    if (!targetNationName) {
        return;
    }
    
    // Check if at least one field has a non-zero value
    if (offerMoney === 0 && offerPC === 0 && requestMoney === 0 && requestPC === 0) {
        return;
    }
    
    // Check if proposing nation can afford what they're offering
    if (currentNation.money < offerMoney || currentNation.politicalCapital < offerPC) {
        const currentNationSpan = `<span class="trade-nation" style="color: ${currentNation.color}; font-weight: bold;">${currentNation.emoji} ${currentNation.name}</span>`;
        const entry = `${currentNationSpan} <span class="trade-rejected">cannot afford to offer this trade!</span>`;
        tradeHistory.unshift(entry);
        renderTradeHistory();
        return;
    }
    
    // Find the target nation
    const targetNation = NATIONS.find(n => n.name === targetNationName);
    
    // AI evaluates the trade proposal
    const accepted = evaluateTradeProposal(currentNation, targetNation, offerMoney, offerPC, requestMoney, requestPC);
    
    // Create trade log entry
    const currentNationSpan = `<span class="trade-nation" style="color: ${currentNation.color}; font-weight: bold;">${currentNation.emoji} ${currentNation.name}</span>`;
    const targetNationSpan = `<span class="trade-nation" style="color: ${targetNation.color}; font-weight: bold;">${targetNation.emoji} ${targetNation.name}</span>`;
    
    let offerText = '';
    if (offerMoney > 0 || offerPC > 0) {
        const parts = [];
        if (offerMoney > 0) parts.push(`<span class="trade-money">$${offerMoney}</span>`);
        if (offerPC > 0) parts.push(`<span class="trade-pc">${offerPC} PC</span>`);
        offerText = parts.join(', ');
    }
    
    let requestText = '';
    if (requestMoney > 0 || requestPC > 0) {
        const parts = [];
        if (requestMoney > 0) parts.push(`<span class="trade-money">$${requestMoney}</span>`);
        if (requestPC > 0) parts.push(`<span class="trade-pc">${requestPC} PC</span>`);
        requestText = parts.join(', ');
    }
    
    let entry = `${currentNationSpan} → ${targetNationSpan}`;
    if (offerText && requestText) {
        entry += `<br><span class="trade-detail">Offers: ${offerText} for ${requestText}</span>`;
    } else if (offerText) {
        entry += `<br><span class="trade-detail">Sends: ${offerText}</span>`;
    } else if (requestText) {
        entry += `<br><span class="trade-detail">Requests: ${requestText}</span>`;
    }
    
    // Add acceptance/rejection status and execute trade if accepted
    if (accepted) {
        entry += ` <span class="trade-accepted">✓ ACCEPTED</span>`;
        
        // Execute the trade - transfer resources
        currentNation.money -= offerMoney;
        currentNation.politicalCapital -= offerPC;
        currentNation.money += requestMoney;
        currentNation.politicalCapital += requestPC;
        
        targetNation.money += offerMoney;
        targetNation.politicalCapital += offerPC;
        targetNation.money -= requestMoney;
        targetNation.politicalCapital -= requestPC;
        
        // Update the UI to reflect new resource values for currently viewed nation
        setCurrentNation(viewingNationIndex);
    } else {
        entry += ` <span class="trade-rejected">✗ REJECTED</span>`;
    }
    
    tradeHistory.unshift(entry);
    renderTradeHistory();
    
    // Reset the form fields
    document.getElementById('offer-money').value = '';
    document.getElementById('offer-pc').value = '';
    document.getElementById('request-money').value = '';
    document.getElementById('request-pc').value = '';
}

window.addEventListener('DOMContentLoaded', () => {
    // console.log('Main DOMContentLoaded fired');
    initializeGrid();
    createLegend();
    populateNationSelect();

    // Turn system setup
    setupTurnSystem();
    
    // Initialize AI action log
    renderAIActionLog();
    
    // Initialize draw proposal UI
    updateDrawProposalUI();
    
    // Trade system setup
    // console.log('Setting up trade handlers');
    
    // On initial load, fill trade target select for the default nation
    const nationSelect = document.getElementById('nation-select');
    if (nationSelect) {
        const currentNation = NATIONS[parseInt(nationSelect.value)];
        updateDiplomacyPanel(currentNation);
    }
    
    const tradeBtn = document.getElementById('trade-propose-btn');
    // console.log('Trade button found:', tradeBtn !== null);
    
    if (tradeBtn) {
        tradeBtn.addEventListener('click', function(e) {
            // console.log('Trade button clicked');
            e.preventDefault();
            proposeTrade();
        });
    } else {
        console.error('Trade button not found!');
    }
    
    // Add Enter key support for trade input fields
    const tradeInputs = [
        document.getElementById('offer-money'),
        document.getElementById('offer-pc'),
        document.getElementById('request-money'),
        document.getElementById('request-pc')
    ];
    
    tradeInputs.forEach(input => {
        if (input) {
            input.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    // console.log('Enter key pressed in trade input');
                    e.preventDefault();
                    proposeTrade();
                }
            });
        }
    });
    // console.log('Trade input Enter key handlers added');
    
    // --- PART 8: Game Over and Draw Proposal Handlers ---
    
    // Propose Draw button
    const proposeDrawBtn = document.getElementById('propose-draw-btn');
    if (proposeDrawBtn) {
        proposeDrawBtn.addEventListener('click', () => {
            proposeDraw();
        });
    }
    
    // New Game button
    const newGameBtn = document.getElementById('new-game-btn');
    if (newGameBtn) {
        newGameBtn.addEventListener('click', () => {
            resetGame();
        });
    }
    
    // Save Game button
    const saveGameBtn = document.getElementById('save-game-btn');
    if (saveGameBtn) {
        saveGameBtn.addEventListener('click', () => {
            saveGame();
        });
    }
    
    // Load Game button
    const loadGameBtn = document.getElementById('load-game-btn');
    if (loadGameBtn) {
        loadGameBtn.addEventListener('click', () => {
            loadGame();
        });
    }
    
    // War Declaration OK button
    const warDeclarationOkBtn = document.getElementById('war-declaration-ok-btn');
    if (warDeclarationOkBtn) {
        warDeclarationOkBtn.addEventListener('click', () => {
            hideWarDeclarationModal();
        });
    }
});

// --- PART 4: Turn-based system and resource generation ---
let currentTurn = 1;
let lastIncome = { money: 0, pc: 0 };
let isProcessingTurn = false; // Track if turn is being processed

// Show/hide processing overlay
function showProcessing() {
    const overlay = document.getElementById('processing-overlay');
    if (overlay) {
        overlay.classList.add('active');
    }
    isProcessingTurn = true;
}

function hideProcessing() {
    const overlay = document.getElementById('processing-overlay');
    if (overlay) {
        overlay.classList.remove('active');
    }
    isProcessingTurn = false;
}

function setupTurnSystem() {
    const turnNumberElem = document.getElementById('turn-number');
    const endTurnBtn = document.getElementById('end-turn-btn');
    const aiPlayTurnBtn = document.getElementById('ai-play-turn-btn');
    
    endTurnBtn.addEventListener('click', () => {
        if (!isProcessingTurn) {
            endTurn();
        }
    });
    
    aiPlayTurnBtn.addEventListener('click', () => {
        if (!isProcessingTurn) {
            aiPlayTurnForPlayer();
        }
    });
    
    updateTurnDisplay();
}

// AI plays turn for the player's nation, then ends the turn
function aiPlayTurnForPlayer() {
    // Prevent AI action if game is over
    if (gameOver) {
        showNotification('Game is over! Start a new game.', 'error');
        return;
    }
    
    showProcessing();
    
    const playerNation = NATIONS[playerNationIndex];
    
    // Log that AI is playing for the player
    showNotification('AI is playing your turn...', 'info');
    
    // Execute AI turn for player's nation
    aiTakeTurn(playerNation);
    
    // Refresh the display to show updated resources
    setCurrentNation(viewingNationIndex);
    
    // Show a notification about what the AI did
    showNotification('AI completed your turn. Ending turn...', 'success');
    
    // Small delay to let player see what happened, then end turn
    setTimeout(() => {
        endTurn();
    }, 1000);
}

function endTurn() {
    // Prevent ending turn if game is over
    if (gameOver) {
        showNotification('Game is over! Start a new game.', 'error');
        hideProcessing();
        return;
    }
    
    // Show processing overlay if not already shown
    if (!isProcessingTurn) {
        showProcessing();
    }
    
    currentTurn++;
    
    // Execute AI turns BEFORE resource generation
    executeAITurns();
    
    // Resource generation for all nations
    NATIONS.forEach(nation => {
        let moneyIncome = 0;
        let pcIncome = 0;
        nation.projects.forEach(project => {
            moneyIncome += project.moneyGen;
            pcIncome += project.pcGen;
        });
        
        // Bonus resources for extra tiles above 25
        const extraTiles = nation.territory.length - TERRITORY_SIZE;
        if (extraTiles > 0) {
            for (let i = 0; i < extraTiles; i++) {
                // 50/50 chance of money or PC
                if (Math.random() < 0.5) {
                    moneyIncome += 1;
                } else {
                    pcIncome += 1;
                }
            }
        }
        
        nation.money += moneyIncome;
        nation.politicalCapital += pcIncome;
        // Update lastIncome for player nation only
        if (NATIONS.indexOf(nation) === playerNationIndex) {
            lastIncome.money = moneyIncome;
            lastIncome.pc = pcIncome;
        }
    });

    // Resolve pending wars scheduled for this turn
    let warsToResolve = pendingWars.filter(war => war.turn === currentTurn);
    
    // Group wars by defender to handle multiple attackers on same target
    const warsByDefender = {};
    warsToResolve.forEach(war => {
        if (!warsByDefender[war.defender]) {
            warsByDefender[war.defender] = [];
        }
        warsByDefender[war.defender].push(war.attacker);
    });
    
    // Process each defender and their attackers
    Object.keys(warsByDefender).forEach(defenderName => {
        const defender = NATIONS.find(n => n.name === defenderName);
        if (!defender) return;
        
        const attackerNames = warsByDefender[defenderName];
        const attackers = attackerNames.map(name => NATIONS.find(n => n.name === name)).filter(n => n);
        
        if (attackers.length === 0) return;
        
        // Sum up all attackers' military might
        const totalAttackerArmy = attackers.reduce((sum, attacker) => sum + attacker.army, 0);
        const defenderArmy = defender.army;
        
        // Determine combat outcome
        if (totalAttackerArmy > defenderArmy) {
            // Attackers win - defender is defeated
            const loser = defender;
            const loserMoney = loser.money;
            const loserPC = loser.politicalCapital;
            const loserTerritory = [...loser.territory];
            
            // Divide rewards among attackers
            const moneyPerAttacker = Math.floor(loserMoney * 0.5 / attackers.length);
            const pcPerAttacker = Math.floor(loserPC * 0.5 / attackers.length);
            
            // Shuffle territory for random distribution
            const shuffledTerritory = [...loserTerritory].sort(() => Math.random() - 0.5);
            const tilesPerAttacker = Math.floor(shuffledTerritory.length / attackers.length);
            
            attackers.forEach((attacker, idx) => {
                // Give rewards
                attacker.maxProjects = attacker.maxProjects + 1;
                attacker.money += moneyPerAttacker;
                attacker.politicalCapital += pcPerAttacker;
                
                // Distribute territory evenly
                const startIdx = idx * tilesPerAttacker;
                let endIdx = startIdx + tilesPerAttacker;
                // Last attacker gets any remaining tiles
                if (idx === attackers.length - 1) {
                    endIdx = shuffledTerritory.length;
                }
                const territoryClaimed = shuffledTerritory.slice(startIdx, endIdx);
                attacker.territory = attacker.territory.concat(territoryClaimed);
            });
            
            // Remove defeated nation
            const loserIdx = NATIONS.indexOf(loser);
            if (loserIdx !== -1) {
                // Check if player was defeated
                const playerWasDefeated = (loserIdx === playerNationIndex);
                
                // Adjust player and viewing indices if needed
                if (loserIdx < playerNationIndex) {
                    playerNationIndex--;
                }
                if (loserIdx < viewingNationIndex) {
                    viewingNationIndex--;
                } else if (loserIdx === viewingNationIndex) {
                    // If viewing the defeated nation, switch to player nation
                    viewingNationIndex = playerNationIndex;
                }
                NATIONS.splice(loserIdx, 1);
                
                // If player was defeated, show game over immediately
                if (playerWasDefeated) {
                    gameOver = true;
                    const firstAttacker = attackers[0];
                    showNotification(`You have been defeated by a coalition led by ${firstAttacker.emoji} ${firstAttacker.name}!`, 'error');
                    hideProcessing();
                    showGameOverScreen(firstAttacker, 'defeat');
                    return; // Exit early to prevent further turn processing
                }
            }
            
            // Remove war state from all attackers
            attackers.forEach(attacker => {
                attacker.wars = attacker.wars.filter(n => n !== loser.name);
            });
            
            // Remove loser from all wars
            NATIONS.forEach(n => {
                n.wars = n.wars.filter(nm => nm !== loser.name);
            });
            
            // Remove from grid and update displays with animation
            initializeGrid(loserTerritory);
            createLegend();
            populateNationSelect();
            renderWarStatus();
            
            // Notification
            if (attackers.length === 1) {
                showNotification(`${attackers[0].emoji} ${attackers[0].name} defeated ${loser.emoji} ${loser.name} in war! Gained ${moneyPerAttacker} money, ${pcPerAttacker} PC, and 1 project slot.`, 'success');
            } else {
                const attackerList = attackers.map(a => `${a.emoji} ${a.name}`).join(', ');
                showNotification(`Coalition (${attackerList}) defeated ${loser.emoji} ${loser.name}! Each gained ${moneyPerAttacker} money, ${pcPerAttacker} PC, and 1 project slot.`, 'success');
            }
            
            // Check for victory after combat
            checkVictory();
            
        } else if (defenderArmy > totalAttackerArmy) {
            // Defender wins - all attackers are defeated
            attackers.forEach(attacker => {
                const loser = attacker;
                const loserMoney = loser.money;
                const loserPC = loser.politicalCapital;
                const loserTerritory = [...loser.territory];
                
                // Defender gets all rewards from this attacker
                defender.maxProjects = defender.maxProjects + 1;
                defender.money += Math.floor(loserMoney * 0.5);
                defender.politicalCapital += Math.floor(loserPC * 0.5);
                defender.territory = defender.territory.concat(loserTerritory);
                
                // Remove defeated attacker
                const loserIdx = NATIONS.indexOf(loser);
                if (loserIdx !== -1) {
                    // Check if player was defeated
                    const playerWasDefeated = (loserIdx === playerNationIndex);
                    
                    // Adjust player and viewing indices if needed
                    if (loserIdx < playerNationIndex) {
                        playerNationIndex--;
                    }
                    if (loserIdx < viewingNationIndex) {
                        viewingNationIndex--;
                    } else if (loserIdx === viewingNationIndex) {
                        // If viewing the defeated nation, switch to player nation
                        viewingNationIndex = playerNationIndex;
                    }
                    NATIONS.splice(loserIdx, 1);
                    
                    // If player was defeated, show game over immediately
                    if (playerWasDefeated) {
                        gameOver = true;
                        showNotification(`You have been defeated by ${defender.emoji} ${defender.name}!`, 'error');
                        hideProcessing();
                        showGameOverScreen(defender, 'defeat');
                        return; // Exit early to prevent further turn processing
                    }
                }
                
                // Remove war state
                defender.wars = defender.wars.filter(n => n !== loser.name);
                
                // Remove loser from all wars
                NATIONS.forEach(n => {
                    n.wars = n.wars.filter(nm => nm !== loser.name);
                });
                
                // Remove from grid and update displays with animation
                initializeGrid(loserTerritory);
                createLegend();
                populateNationSelect();
                renderWarStatus();
                
                // Notification
                showNotification(`${defender.emoji} ${defender.name} defeated ${loser.emoji} ${loser.name} in war! Gained ${Math.floor(loserMoney * 0.5)} money, ${Math.floor(loserPC * 0.5)} PC, and 1 project slot.`, 'success');
                
                // Check for victory after combat
                checkVictory();
            });
        } else {
            // Tie: no winner, all participants lose 1 army if possible
            attackers.forEach(attacker => {
                if (attacker.army > 0) attacker.army--;
            });
            if (defender.army > 0) defender.army--;
        }
    });
    
    // Remove resolved wars from pending
    pendingWars = pendingWars.filter(war => war.turn > currentTurn);

    // Refresh grid to show any claimed tiles
    initializeGrid();
    
    updateTurnDisplay();
    // Refresh nation info panel for currently viewed nation
    setCurrentNation(viewingNationIndex);
    
    // Check for victory condition
    checkVictory();
    
    // Hide processing overlay after everything is done
    hideProcessing();
}

function updateTurnDisplay() {
    document.getElementById('turn-number').textContent = currentTurn;
    document.getElementById('income-money').textContent = lastIncome.money;
    document.getElementById('income-pc').textContent = lastIncome.pc;
}

// --- PART 7: AI Opponents ---

// AI action log
let aiActionLog = [];

// Add action to AI log
function logAIAction(nationEmoji, nationName, action, nationColor) {
    const entry = {
        turn: currentTurn,
        nation: nationName,
        emoji: nationEmoji,
        action: action,
        color: nationColor
    };
    aiActionLog.unshift(entry);
    // Keep only last 20 actions
    if (aiActionLog.length > 20) {
        aiActionLog.pop();
    }
    renderAIActionLog();
}

// Render AI action log to UI
function renderAIActionLog() {
    const logContainer = document.getElementById('ai-action-log');
    if (!logContainer) return;
    
    if (aiActionLog.length === 0) {
        logContainer.innerHTML = '<p class="no-ai-actions">No AI actions yet</p>';
        return;
    }
    
    logContainer.innerHTML = '';
    aiActionLog.forEach(entry => {
        const logEntry = document.createElement('div');
        logEntry.className = 'ai-log-entry';
        logEntry.innerHTML = `
            <span class="ai-log-turn">Turn ${entry.turn}:</span>
            <span class="ai-log-nation" style="color: ${entry.color}; font-weight: bold;">${entry.emoji} ${entry.nation}</span>
            <span class="ai-log-action">${entry.action}</span>
        `;
        logContainer.appendChild(logEntry);
    });
}

// AI decides which project to build
function aiDecideProject(nation) {
    // Get affordable projects
    const affordableProjects = PROJECT_TYPES.filter(project => 
        nation.money >= project.moneyCost && 
        nation.politicalCapital >= project.pcCost &&
        nation.projects.length < nation.maxProjects
    );
    
    if (affordableProjects.length === 0) {
        return null;
    }
    
    // Prioritize projects based on nation's current needs
    const moneyRatio = nation.money / (nation.politicalCapital + 1);
    
    // Sort projects by priority
    affordableProjects.sort((a, b) => {
        // If low on money, prioritize money-generating projects
        if (moneyRatio < 1) {
            return b.moneyGen - a.moneyGen;
        }
        // If low on PC, prioritize PC-generating projects
        else {
            return b.pcGen - a.pcGen;
        }
    });
    
    // 70% chance to pick the best project, 30% chance to pick a random affordable one
    if (Math.random() < 0.7) {
        return affordableProjects[0];
    } else {
        return affordableProjects[Math.floor(Math.random() * affordableProjects.length)];
    }
}

// AI decides whether to build an army
function aiDecideBuyArmy(nation) {
    // Check if at war
    const atWar = nation.wars.length > 0;
    
    // Get the strongest enemy army size
    let maxEnemyArmy = 0;
    if (atWar) {
        nation.wars.forEach(enemyName => {
            const enemy = NATIONS.find(n => n.name === enemyName);
            if (enemy && enemy.army > maxEnemyArmy) {
                maxEnemyArmy = enemy.army;
            }
        });
    }
    
    // Build army if:
    // 1. At war and weaker than enemy (high priority)
    // 2. Has excess money (opportunistic and aggressive)
    // 3. Random chance for defense buildup (scales with wealth)
    
    if (atWar && nation.army < maxEnemyArmy && nation.money >= ARMY_COST) {
        return Math.random() < 0.95; // 95% chance to build if losing
    }
    
    // More aggressive army building when wealthy
    if (nation.money > 60 && nation.money >= ARMY_COST) {
        return Math.random() < 0.85; // 85% chance if very rich
    }
    
    if (nation.money > 40 && nation.money >= ARMY_COST) {
        return Math.random() < 0.65; // 65% chance if rich
    }
    
    if (nation.money > 25 && nation.money >= ARMY_COST) {
        return Math.random() < 0.45; // 45% chance if comfortable
    }
    
    if (nation.money >= ARMY_COST) {
        return Math.random() < 0.2; // 20% base chance
    }
    
    return false;
}

// AI decides whether to propose a trade
function aiDecideTrade(nation) {
    // Get other nations
    const otherNations = NATIONS.filter(n => n.name !== nation.name);
    if (otherNations.length === 0) return null;
    
    // Only trade occasionally (20% chance per turn)
    if (Math.random() > 0.2) return null;
    
    // Pick a random target
    const target = otherNations[Math.floor(Math.random() * otherNations.length)];
    
    // Decide what to trade based on nation's needs
    let offerMoney = 0;
    let offerPC = 0;
    let requestMoney = 0;
    let requestPC = 0;
    
    // If low on money but has PC, offer PC for money
    if (nation.money < 15 && nation.politicalCapital > 10) {
        offerPC = Math.floor(Math.random() * 5) + 3; // 3-7 PC
        requestMoney = Math.floor(offerPC * 1.2); // Ask for slightly more money
    }
    // If low on PC but has money, offer money for PC
    else if (nation.politicalCapital < 15 && nation.money > 10) {
        offerMoney = Math.floor(Math.random() * 5) + 3; // 3-7 money
        requestPC = Math.floor(offerMoney * 1.2); // Ask for slightly more PC
    }
    // Sometimes offer gifts to build relations (small amounts)
    else if (Math.random() < 0.3 && nation.money > 20) {
        offerMoney = Math.floor(Math.random() * 3) + 1; // 1-3 money gift
        offerPC = Math.floor(Math.random() * 2); // 0-1 PC gift
    }
    else {
        return null; // No trade this time
    }
    
    // Validate the trade is possible
    if (nation.money < offerMoney || nation.politicalCapital < offerPC) {
        return null;
    }
    
    return {
        target: target,
        offerMoney: offerMoney,
        offerPC: offerPC,
        requestMoney: requestMoney,
        requestPC: requestPC
    };
}

// AI decides whether to declare war
function aiDecideWar(nation) {
    // Only consider war if strong enough
    if (nation.army < 3) return null;
    if (nation.politicalCapital < 5) return null; // Need PC to declare war
    
    // Scale war aggression with strength and wealth
    let warChance = 0.1; // Base 10% chance
    if (nation.army > 10 && nation.money > 40) {
        warChance = 0.25; // 25% if strong and rich
    } else if (nation.army > 6 || nation.money > 30) {
        warChance = 0.15; // 15% if moderately strong
    }
    
    if (Math.random() > warChance) return null;
    
    // Find weaker nations to attack that share a border
    const weakerNations = NATIONS.filter(n => 
        n.name !== nation.name && 
        !nation.wars.includes(n.name) && 
        n.army < nation.army &&
        doNationsShareBorder(nation, n)
    );
    
    if (weakerNations.length === 0) return null;
    
    // Pick the weakest
    weakerNations.sort((a, b) => a.army - b.army);
    return weakerNations[0];
}

// Execute AI turn for a nation
function aiTakeTurn(nation) {
    // 1. Try to build multiple projects if wealthy (high priority)
    let projectsBuilt = 0;
    const maxProjectsThisTurn = nation.money > 50 ? 3 : (nation.money > 30 ? 2 : 1);
    
    for (let i = 0; i < maxProjectsThisTurn; i++) {
        const projectToBuild = aiDecideProject(nation);
        if (projectToBuild) {
            nation.money -= projectToBuild.moneyCost;
            nation.politicalCapital -= projectToBuild.pcCost;
            nation.projects.push({...projectToBuild});
            projectsBuilt++;
            
            if (projectsBuilt === 1) {
                logAIAction(
                    nation.emoji, 
                    nation.name, 
                    `built ${projectToBuild.name} ($${projectToBuild.moneyCost}, ${projectToBuild.pcCost} PC)`,
                    nation.color
                );
            }
        } else {
            break; // Can't afford more projects
        }
    }
    
    // Log if multiple projects built
    if (projectsBuilt > 1) {
        logAIAction(
            nation.emoji, 
            nation.name, 
            `built ${projectsBuilt} projects in total`,
            nation.color
        );
    }
    
    // 2. Try to buy army units (scale with wealth)
    let armiesBought = 0;
    const maxArmyThisTurn = nation.money > 60 ? 10 : (nation.money > 40 ? 5 : 3);
    
    while (aiDecideBuyArmy(nation) && armiesBought < maxArmyThisTurn) {
        nation.money -= ARMY_COST;
        nation.army += 1;
        armiesBought++;
    }
    if (armiesBought > 0) {
        logAIAction(
            nation.emoji, 
            nation.name, 
            `purchased ${armiesBought} army unit${armiesBought > 1 ? 's' : ''} ($${ARMY_COST * armiesBought})`,
            nation.color
        );
    }
    
    // 2.5. Try to claim unclaimed tiles (more aggressive when wealthy)
    let tilesClaimed = 0;
    const claimChance = nation.money > 40 ? 0.8 : (nation.money > 25 ? 0.5 : 0.3);
    
    if (nation.army >= 1 && Math.random() < claimChance) {
        const adjacentTiles = getAdjacentUnclaimedTiles(nation);
        const maxClaimsBase = nation.money > 50 ? 8 : (nation.money > 30 ? 5 : 3);
        const maxClaims = Math.min(
            Math.floor(nation.money / TILE_CLAIM_COST),
            adjacentTiles.length,
            Math.floor(Math.random() * maxClaimsBase) + 1
        );
        
        for (let i = 0; i < maxClaims; i++) {
            if (nation.money >= TILE_CLAIM_COST && adjacentTiles.length > 0) {
                const randomIndex = Math.floor(Math.random() * adjacentTiles.length);
                const tile = adjacentTiles.splice(randomIndex, 1)[0];
                nation.money -= TILE_CLAIM_COST;
                nation.territory.push(tile);
                tilesClaimed++;
            }
        }
        
        if (tilesClaimed > 0) {
            logAIAction(
                nation.emoji, 
                nation.name, 
                `claimed ${tilesClaimed} unclaimed tile${tilesClaimed > 1 ? 's' : ''} ($${TILE_CLAIM_COST * tilesClaimed})`,
                nation.color
            );
        }
    }
    
    // 3. Try to propose a trade
    const trade = aiDecideTrade(nation);
    if (trade) {
        const accepted = evaluateTradeProposal(
            nation, 
            trade.target, 
            trade.offerMoney, 
            trade.offerPC, 
            trade.requestMoney, 
            trade.requestPC
        );
        
        // Create trade log entry
        const currentNationSpan = `<span class="trade-nation" style="color: ${nation.color}; font-weight: bold;">${nation.emoji} ${nation.name}</span>`;
        const targetNationSpan = `<span class="trade-nation" style="color: ${trade.target.color}; font-weight: bold;">${trade.target.emoji} ${trade.target.name}</span>`;
        
        let offerText = '';
        if (trade.offerMoney > 0 || trade.offerPC > 0) {
            const parts = [];
            if (trade.offerMoney > 0) parts.push(`<span class="trade-money">$${trade.offerMoney}</span>`);
            if (trade.offerPC > 0) parts.push(`<span class="trade-pc">${trade.offerPC} PC</span>`);
            offerText = parts.join(', ');
        }
        
        let requestText = '';
        if (trade.requestMoney > 0 || trade.requestPC > 0) {
            const parts = [];
            if (trade.requestMoney > 0) parts.push(`<span class="trade-money">$${trade.requestMoney}</span>`);
            if (trade.requestPC > 0) parts.push(`<span class="trade-pc">${trade.requestPC} PC</span>`);
            requestText = parts.join(', ');
        }
        
        let entry = `${currentNationSpan} → ${targetNationSpan}`;
        if (offerText && requestText) {
            entry += `<br><span class="trade-detail">Offers: ${offerText} for ${requestText}</span>`;
        } else if (offerText) {
            entry += `<br><span class="trade-detail">Sends: ${offerText}</span>`;
        } else if (requestText) {
            entry += `<br><span class="trade-detail">Requests: ${requestText}</span>`;
        }
        
        if (accepted) {
            entry += ` <span class="trade-accepted">✓ ACCEPTED</span>`;
            
            // Execute the trade
            nation.money -= trade.offerMoney;
            nation.politicalCapital -= trade.offerPC;
            nation.money += trade.requestMoney;
            nation.politicalCapital += trade.requestPC;
            
            trade.target.money += trade.offerMoney;
            trade.target.politicalCapital += trade.offerPC;
            trade.target.money -= trade.requestMoney;
            trade.target.politicalCapital -= trade.requestPC;
            
            logAIAction(
                nation.emoji, 
                nation.name, 
                `traded with ${trade.target.emoji} ${trade.target.name} - ACCEPTED`,
                nation.color
            );
        } else {
            entry += ` <span class="trade-rejected">✗ REJECTED</span>`;
            logAIAction(
                nation.emoji, 
                nation.name, 
                `trade with ${trade.target.emoji} ${trade.target.name} - REJECTED`,
                nation.color
            );
        }
        
        tradeHistory.unshift(entry);
        renderTradeHistory();
    }
    
    // 4. Try to declare war (rare, only if conditions are right)
    const warTarget = aiDecideWar(nation);
    if (warTarget) {
        const WAR_PC_COST = 5;
        nation.politicalCapital -= WAR_PC_COST;
        nation.wars.push(warTarget.name);
        warTarget.wars.push(nation.name);
        pendingWars.push({
            attacker: nation.name,
            defender: warTarget.name,
            turn: currentTurn + 1
        });
        logAIAction(
            nation.emoji, 
            nation.name, 
            `declared war on ${warTarget.emoji} ${warTarget.name}!`,
            nation.color
        );
        renderWarStatus();
        
        // Return war information if player is the target
        const playerNation = NATIONS[playerNationIndex];
        if (warTarget.name === playerNation.name) {
            return { warDeclaredOnPlayer: true, attacker: nation };
        }
    }
    
    return { warDeclaredOnPlayer: false };
}

// Execute AI turns for all AI-controlled nations
function executeAITurns() {
    // All nations except the player's nation (US at index 0) are AI-controlled
    const warsOnPlayer = [];
    
    NATIONS.forEach((nation, index) => {
        if (index !== playerNationIndex) {
            const result = aiTakeTurn(nation);
            if (result && result.warDeclaredOnPlayer) {
                warsOnPlayer.push(result.attacker);
            }
        }
    });
    
    // Show war declaration modal if any AI declared war on the player
    if (warsOnPlayer.length > 0) {
        // Show modal for the first war (or combine if multiple)
        if (warsOnPlayer.length === 1) {
            showWarDeclarationModal(warsOnPlayer[0]);
        } else {
            // Multiple wars declared - show combined message
            const modal = document.getElementById('war-declaration-modal');
            const message = document.getElementById('war-declaration-message');
            
            const attackersList = warsOnPlayer.map(n => `${n.emoji} ${n.name}`).join(', ');
            message.innerHTML = `
                <strong style="font-size: 1.2em;">Multiple nations have declared war on you!</strong>
                <br><br>
                ${attackersList}
                <br><br>
                Prepare your defenses and build your army!
                <br>
                Wars will be resolved next turn.
            `;
            
            modal.style.display = 'flex';
            showNotification(`⚔️ ${warsOnPlayer.length} nations declared war on you!`, 'error');
        }
    }
}

// --- PART 8: Win Conditions and Game End ---

// Game state tracking
let gameOver = false;
let drawProposal = null; // Stores draw proposal info

// Check for victory condition
function checkVictory() {
    // If game is already over, don't check again
    if (gameOver) return;
    
    // Check if only one nation remains
    if (NATIONS.length === 1) {
        const winner = NATIONS[0];
        gameOver = true;
        showGameOverScreen(winner, 'victory');
        return true;
    }
    
    return false;
}

// Show game over screen
function showGameOverScreen(winner, type) {
    const modal = document.getElementById('game-over-modal');
    const title = document.getElementById('game-over-title');
    const message = document.getElementById('game-over-message');
    const stats = document.getElementById('game-over-stats');
    
    if (type === 'victory' || type === 'conquest') {
        const isPlayer = NATIONS.indexOf(winner) === playerNationIndex;
        title.textContent = isPlayer ? 'VICTORY!' : 'DEFEAT';
        title.className = isPlayer ? 'victory-title' : 'defeat-title';
        
        if (isPlayer) {
            message.textContent = `Congratulations! ${winner.emoji} ${winner.name} has conquered the world!`;
        } else {
            message.textContent = `${winner.emoji} ${winner.name} has conquered the world. Better luck next time!`;
        }
        
        stats.innerHTML = `
            <div class="stat-line"><strong>Final Turn:</strong> ${currentTurn}</div>
            <div class="stat-line"><strong>Territory:</strong> ${winner.territory.length} cells</div>
            <div class="stat-line"><strong>Money:</strong> $${winner.money}</div>
            <div class="stat-line"><strong>Political Capital:</strong> ${winner.politicalCapital}</div>
            <div class="stat-line"><strong>Army:</strong> ${winner.army} units</div>
            <div class="stat-line"><strong>Projects:</strong> ${winner.projects.length}</div>
        `;
    } else if (type === 'defeat') {
        title.textContent = 'DEFEAT';
        title.className = 'defeat-title';
        message.textContent = `You have been eliminated! ${winner.emoji} ${winner.name} has defeated you in battle!`;
        
        stats.innerHTML = `
            <div class="stat-line"><strong>Defeated on Turn:</strong> ${currentTurn}</div>
            <div class="stat-line"><strong>Defeated by:</strong> ${winner.emoji} ${winner.name}</div>
            <div class="stat-line"><strong>Their Army:</strong> ${winner.army} units</div>
        `;
    } else if (type === 'draw') {
        title.textContent = '🤝 DRAW ACCEPTED';
        title.className = 'draw-title';
        message.textContent = 'All remaining nations have agreed to a peaceful draw!';
        
        let statsHTML = `<div class="stat-line"><strong>Final Turn:</strong> ${currentTurn}</div>`;
        statsHTML += `<div class="stat-line"><strong>Remaining Nations:</strong> ${NATIONS.length}</div><br>`;
        
        NATIONS.forEach(nation => {
            statsHTML += `
                <div class="nation-final-stats">
                    <strong>${nation.emoji} ${nation.name}</strong><br>
                    Territory: ${nation.territory.length} cells | 
                    Money: $${nation.money} | 
                    PC: ${nation.politicalCapital} | 
                    Army: ${nation.army}
                </div>
            `;
        });
        
        stats.innerHTML = statsHTML;
    }
    
    modal.style.display = 'flex';
}

// Hide game over screen
function hideGameOverScreen() {
    const modal = document.getElementById('game-over-modal');
    modal.style.display = 'none';
}

// Show war declaration modal when AI declares war on player
function showWarDeclarationModal(attackerNation) {
    const modal = document.getElementById('war-declaration-modal');
    const message = document.getElementById('war-declaration-message');
    
    message.innerHTML = `
        <strong style="font-size: 1.2em;">${attackerNation.emoji} ${attackerNation.name}</strong> 
        has declared war on you!
        <br><br>
        Prepare your defenses and build your army!
        <br>
        War will be resolved next turn.
    `;
    
    modal.style.display = 'flex';
    
    // Also show a notification
    showNotification(`⚔️ ${attackerNation.emoji} ${attackerNation.name} has declared war on you!`, 'error');
}

// Hide war declaration modal
function hideWarDeclarationModal() {
    const modal = document.getElementById('war-declaration-modal');
    modal.style.display = 'none';
}

// Propose a draw
function proposeDraw() {
    if (gameOver) {
        showNotification('Game is already over!', 'error');
        return;
    }
    
    if (NATIONS.length === 1) {
        showNotification('Cannot propose draw when only one nation remains!', 'error');
        return;
    }
    
    if (drawProposal) {
        showNotification('A draw has already been proposed!', 'error');
        return;
    }
    
    // Create draw proposal
    const playerNation = NATIONS[playerNationIndex];
    drawProposal = {
        proposer: playerNation.name,
        votes: [playerNation.name], // Proposer automatically agrees
        required: NATIONS.length
    };
    
    showNotification(`${playerNation.emoji} ${playerNation.name} has proposed a draw! Waiting for other nations...`, 'success');
    
    // AI nations vote on the draw
    aiVoteOnDraw();
    
    // Update draw UI
    updateDrawProposalUI();
}

// AI nations vote on draw proposal
function aiVoteOnDraw() {
    if (!drawProposal) return;
    
    NATIONS.forEach((nation, index) => {
        // Skip if already voted or is the player
        if (drawProposal.votes.includes(nation.name) || index === playerNationIndex) {
            return;
        }
        
        // AI decision: more likely to accept if:
        // 1. They have low resources
        // 2. They are at war
        // 3. They have small territory
        
        let acceptChance = 0.3; // Base 30% chance
        
        if (nation.money < 20) acceptChance += 0.2;
        if (nation.politicalCapital < 20) acceptChance += 0.2;
        if (nation.wars.length > 0) acceptChance += 0.2;
        if (nation.territory.length < 50) acceptChance += 0.1;
        
        if (Math.random() < acceptChance) {
            drawProposal.votes.push(nation.name);
            logAIAction(nation.emoji, nation.name, 'voted YES on draw proposal', nation.color);
        } else {
            logAIAction(nation.emoji, nation.name, 'voted NO on draw proposal', nation.color);
            // If any AI rejects, the proposal fails
            showNotification(`${nation.emoji} ${nation.name} rejected the draw proposal!`, 'error');
            drawProposal = null;
            updateDrawProposalUI();
            return;
        }
    });
    
    // Check if all nations agreed
    if (drawProposal && drawProposal.votes.length === drawProposal.required) {
        gameOver = true;
        showGameOverScreen(null, 'draw');
        drawProposal = null;
        updateDrawProposalUI();
    }
}

// Update draw proposal UI
function updateDrawProposalUI() {
    const container = document.getElementById('draw-proposal-status');
    if (!drawProposal) {
        container.innerHTML = '<p class="no-draw">No active draw proposal</p>';
        return;
    }
    
    container.innerHTML = `
        <div class="draw-proposal-active">
            <p><strong>Draw Proposal Active</strong></p>
            <p>Votes: ${drawProposal.votes.length}/${drawProposal.required}</p>
            <p class="draw-voters">Agreed: ${drawProposal.votes.join(', ')}</p>
        </div>
    `;
}

// Reset the game
function resetGame() {
    // Hide game over screen
    hideGameOverScreen();
    
    // Reset game state
    gameOver = false;
    drawProposal = null;
    currentTurn = 1;
    lastIncome = { money: 0, pc: 0 };
    pendingWars = [];
    tradeHistory = [];
    aiActionLog = [];
    
    // Clear war status display
    const warStatusList = document.getElementById('war-status-list');
    if (warStatusList) {
        warStatusList.innerHTML = '<p class="no-war">No wars declared</p>';
    }
    
    // Clear AI action log display
    const aiActionLogContainer = document.getElementById('ai-action-log');
    if (aiActionLogContainer) {
        aiActionLogContainer.innerHTML = '<p class="no-ai-actions">No AI actions yet</p>';
    }
    
    // Regenerate territories
    const newTerritories = generateRandomTerritories(8, TERRITORY_SIZE, GRID_SIZE);
    
    // Reset all nations
    const nationTemplates = [
        { name: 'United States', emoji: 'US', color: '#FF0000' },
        { name: 'China', emoji: 'CN', color: '#0000FF' },
        { name: 'Russia', emoji: 'RU', color: '#00FF00' },
        { name: 'United Kingdom', emoji: 'UK', color: '#FFFF00' },
        { name: 'France', emoji: 'FR', color: '#FF00FF' },
        { name: 'Germany', emoji: 'DE', color: '#00FFFF' },
        { name: 'Japan', emoji: 'JP', color: '#FFA500' },
        { name: 'India', emoji: 'IN', color: '#800080' }
    ];
    
    // Clear and rebuild NATIONS array
    NATIONS.length = 0;
    nationTemplates.forEach((template, index) => {
        NATIONS.push(new Nation({
            name: template.name,
            emoji: template.emoji,
            color: template.color,
            territory: newTerritories[index],
            money: 10,
            politicalCapital: 10,
            army: 0,
            maxProjects: 5
        }));
    });
    
    // Reset player and viewing indices
    playerNationIndex = 0;
    viewingNationIndex = 0;
    selectedUnclaimedTile = null;
    
    // Reinitialize UI
    initializeGrid();
    createLegend();
    populateNationSelect();
    setCurrentNation(0);
    updateTurnDisplay();
    renderTradeHistory();
    renderWarStatus();
    renderAIActionLog();
    updateDrawProposalUI();
    
    showNotification('New game started! Good luck!', 'success');
}

// --- PART 9: Save/Load Game State ---

function saveGame() {
    try {
        const gameState = {
            nations: NATIONS.map(nation => ({
                name: nation.name,
                emoji: nation.emoji,
                color: nation.color,
                territory: nation.territory,
                money: nation.money,
                politicalCapital: nation.politicalCapital,
                projects: nation.projects,
                army: nation.army,
                wars: nation.wars,
                maxProjects: nation.maxProjects
            })),
            currentTurn: currentTurn,
            lastIncome: lastIncome,
            playerNationIndex: playerNationIndex,
            viewingNationIndex: viewingNationIndex,
            pendingWars: pendingWars,
            tradeHistory: tradeHistory,
            aiActionLog: aiActionLog,
            gameOver: gameOver,
            drawProposal: drawProposal
        };
        
        localStorage.setItem('nationGameSave', JSON.stringify(gameState));
        showNotification('Game saved successfully!', 'success');
    } catch (error) {
        showNotification('Failed to save game: ' + error.message, 'error');
    }
}

function loadGame() {
    try {
        const savedData = localStorage.getItem('nationGameSave');
        if (!savedData) {
            showNotification('No saved game found!', 'error');
            return;
        }
        
        const gameState = JSON.parse(savedData);
        
        // Clear current nations
        NATIONS.length = 0;
        
        // Restore nations
        gameState.nations.forEach(nationData => {
            NATIONS.push(new Nation(nationData));
        });
        
        // Restore game state variables
        currentTurn = gameState.currentTurn;
        lastIncome = gameState.lastIncome;
        playerNationIndex = gameState.playerNationIndex;
        viewingNationIndex = gameState.viewingNationIndex;
        pendingWars = gameState.pendingWars || [];
        tradeHistory = gameState.tradeHistory || [];
        aiActionLog = gameState.aiActionLog || [];
        gameOver = gameState.gameOver || false;
        drawProposal = gameState.drawProposal || null;
        
        // Reinitialize UI
        initializeGrid();
        createLegend();
        populateNationSelect();
        setCurrentNation(viewingNationIndex);
        updateTurnDisplay();
        renderTradeHistory();
        renderWarStatus();
        renderAIActionLog();
        updateDrawProposalUI();
        
        if (gameOver) {
            // If the saved game was in game over state, show it
            const winner = NATIONS.length === 1 ? NATIONS[0] : null;
            showGameOverScreen(winner, drawProposal ? 'draw' : 'conquest');
        } else {
            hideGameOverScreen();
        }
        
        showNotification('Game loaded successfully!', 'success');
    } catch (error) {
        showNotification('Failed to load game: ' + error.message, 'error');
    }
}
