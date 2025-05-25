class UpgradeRepairManager {
    constructor() {
        this.currentUser = null;
        this.assets = [];
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.checkAuthStatus();
    }

    setupEventListeners() {
        // Tab switching
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
        });
    }

    async checkAuthStatus() {
        try {
            const response = await fetch('/api/auth/me');
            const data = await response.json();
            
            if (data.authenticated) {
                this.currentUser = data.user;
                this.showUpgradeRepairInterface();
                this.loadAssets();
            } else {
                this.showAccessDenied();
            }
        } catch (error) {
            console.error('Error checking auth status:', error);
            this.showAccessDenied();
        }
    }

    showUpgradeRepairInterface() {
        // Update header
        const authSection = document.getElementById('authSection');
        authSection.innerHTML = `
            <div class="user-info">
                <span>${this.currentUser.username}</span>
                <span class="user-level ${this.currentUser.userLevel}">${this.currentUser.userLevel}</span>
            </div>
            <button onclick="upgradeRepairManager.logout()" class="logout-btn">Logout</button>
        `;

        // Show admin button if user is admin or owner
        if (['admin', 'owner'].includes(this.currentUser.userLevel)) {
            document.getElementById('adminBtn').style.display = 'inline-block';
        }
        
        // Show main content
        document.getElementById('upgradeRepairContent').style.display = 'block';
        document.getElementById('accessDenied').style.display = 'none';
    }

    showAccessDenied() {
        document.getElementById('upgradeRepairContent').style.display = 'none';
        document.getElementById('accessDenied').style.display = 'block';
    }

    switchTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        document.getElementById(`${tabName}Tab`).classList.add('active');

        // Load content for the tab
        this.loadAssetsForTab(tabName);
    }

    async loadAssets() {
        try {
            const response = await fetch('/api/assets');
            const assets = await response.json();
            this.assets = assets;
            
            // Load both tabs
            this.loadAssetsForTab('repair');
            this.loadAssetsForTab('upgrade');
        } catch (error) {
            console.error('Error loading assets:', error);
            this.showError('Error loading assets: ' + error.message);
        }
    }

    async loadAssetsForTab(status) {
        try {
            const response = await fetch(`/api/assets/${status}`);
            const assets = await response.json();
            this.renderAssets(assets, status);
        } catch (error) {
            console.error(`Error loading ${status} assets:`, error);
            this.showError(`Error loading ${status} assets: ` + error.message);
        }
    }

    renderAssets(assets, status) {
        const container = document.getElementById(`${status}Assets`);
        const noAssetsDiv = document.getElementById(`no${status.charAt(0).toUpperCase() + status.slice(1)}Assets`);
        
        if (assets.length === 0) {
            container.innerHTML = '';
            noAssetsDiv.style.display = 'block';
            return;
        }

        noAssetsDiv.style.display = 'none';

        // Group assets by category
        const assetsByCategory = this.groupAssetsByCategory(assets);
        
        container.innerHTML = Object.keys(assetsByCategory).map(category => `
            <div class="asset-category">
                <h4 class="category-title">${category}</h4>
                <div class="category-assets">
                    ${assetsByCategory[category].map(asset => this.renderAssetCard(asset, status)).join('')}
                </div>
            </div>
        `).join('');
    }

    groupAssetsByCategory(assets) {
        return assets.reduce((groups, asset) => {
            const category = asset.category;
            if (!groups[category]) {
                groups[category] = [];
            }
            groups[category].push(asset);
            return groups;
        }, {});
    }

    renderAssetCard(asset, status) {
        const statusColor = status === 'repair' ? '#dc3545' : '#007bff';
        const statusIcon = status === 'repair' ? '🔧' : '⬆️';
        
        return `
            <div class="asset-card">
                <div class="asset-header">
                    <h5 class="asset-name">${asset.name}</h5>
                </div>
                <div class="asset-status" style="background-color: ${statusColor}; color: white;">
                    ${statusIcon} ${status.charAt(0).toUpperCase() + status.slice(1)}
                </div>
                <div class="asset-info">
                    <small>Updated: ${new Date(asset.updated_at).toLocaleDateString()}</small>
                </div>
            </div>
        `;
    }

    async logout() {
        try {
            const response = await fetch('/api/auth/logout', { method: 'POST' });
            if (response.ok) {
                window.location.href = '/';
            }
        } catch (error) {
            console.error('Error logging out:', error);
        }
    }

    showError(message) {
        this.showMessage(message, 'error');
    }

    showSuccess(message) {
        this.showMessage(message, 'success');
    }

    showMessage(message, type) {
        const existing = document.querySelector('.message');
        if (existing) existing.remove();

        const div = document.createElement('div');
        div.className = `message ${type}`;
        div.textContent = message;
        
        document.body.appendChild(div);
        
        setTimeout(() => {
            div.remove();
        }, 5000);

        // Add CSS for message positioning
        div.style.position = 'fixed';
        div.style.top = '20px';
        div.style.right = '20px';
        div.style.zIndex = '10000';
        div.style.padding = '15px 20px';
        div.style.borderRadius = '4px';
        div.style.maxWidth = '300px';
        div.style.wordWrap = 'break-word';
        
        if (type === 'error') {
            div.style.backgroundColor = '#f8d7da';
            div.style.color = '#721c24';
            div.style.border = '1px solid #f5c6cb';
        } else {
            div.style.backgroundColor = '#d4edda';
            div.style.color = '#155724';
            div.style.border = '1px solid #c3e6cb';
        }
    }
}

// Initialize the upgrade repair application
const upgradeRepairManager = new UpgradeRepairManager();
