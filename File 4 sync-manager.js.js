// sync-manager.js - Data Synchronization Manager

class SyncManager {
    constructor() {
        this.config = {
            googleScriptUrl: localStorage.getItem('google_script_url') || '',
            syncInterval: 300000, // 5 minutes
            maxRetries: 3,
            offlineQueue: 'sync_queue'
        };
        
        this.initialize();
    }
    
    initialize() {
        this.loadConfig();
        this.setupEventListeners();
        this.startAutoSync();
    }
    
    loadConfig() {
        const savedConfig = localStorage.getItem('sync_config');
        if (savedConfig) {
            this.config = { ...this.config, ...JSON.parse(savedConfig) };
        }
    }
    
    setupEventListeners() {
        // Network status
        window.addEventListener('online', () => this.onNetworkOnline());
        window.addEventListener('offline', () => this.onNetworkOffline());
        
        // Page visibility
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                this.checkAndSync();
            }
        });
    }
    
    startAutoSync() {
        setInterval(() => this.checkAndSync(), this.config.syncInterval);
    }
    
    onNetworkOnline() {
        console.log('Network online, syncing data...');
        this.syncAll();
        this.showNotification('Network restored, syncing data...', 'info');
    }
    
    onNetworkOffline() {
        console.log('Network offline, saving data locally');
        this.showNotification('Network offline, data will be synced when connection is restored', 'warning');
    }
    
    async syncAll() {
        if (!navigator.onLine) {
            console.log('Offline, cannot sync');
            return;
        }
        
        try {
            // Sync local data to Google Sheets
            await this.syncToGoogleSheets();
            
            // Pull updates from Google Sheets
            await this.pullFromGoogleSheets();
            
            // Process offline queue
            await this.processOfflineQueue();
            
            // Update sync timestamp
            localStorage.setItem('last_sync_time', new Date().toISOString());
            
            this.showNotification('All data synced successfully', 'success');
            
        } catch (error) {
            console.error('Sync error:', error);
            this.showNotification('Sync failed: ' + error.message, 'error');
        }
    }
    
    async syncToGoogleSheets() {
        if (!this.config.googleScriptUrl) {
            console.log('No Google Sheets URL configured');
            return;
        }
        
        // Get local data
        const localData = this.getLocalData();
        
        if (!localData || Object.keys(localData.towers.A.flats).length === 0) {
            console.log('No local data to sync');
            return;
        }
        
        try {
            const response = await fetch(this.config.googleScriptUrl, {
                method: 'POST',
                body: JSON.stringify({
                    action: 'sync_data',
                    data: localData,
                    timestamp: new Date().toISOString()
                })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const result = await response.json();
            console.log('Sync to Google Sheets successful:', result);
            
        } catch (error) {
            console.error('Error syncing to Google Sheets:', error);
            this.addToOfflineQueue('sync_to_sheets', localData);
            throw error;
        }
    }
    
    async pullFromGoogleSheets() {
        if (!this.config.googleScriptUrl) return;
        
        try {
            const response = await fetch(`${this.config.googleScriptUrl}?action=get_data&type=all`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const remoteData = await response.json();
            
            if (remoteData) {
                this.mergeRemoteData(remoteData);
                console.log('Pull from Google Sheets successful');
            }
            
        } catch (error) {
            console.error('Error pulling from Google Sheets:', error);
        }
    }
    
    mergeRemoteData(remoteData) {
        // Merge remote data with local data
        const localData = this.getLocalData();
        
        // Simple merge strategy - remote data takes precedence
        const mergedData = { ...localData };
        
        ['A', 'B', 'C'].forEach(tower => {
            if (remoteData.towers && remoteData.towers[tower]) {
                mergedData.towers[tower] = {
                    ...mergedData.towers[tower],
                    ...remoteData.towers[tower]
                };
            }
        });
        
        // Save merged data
        localStorage.setItem('hot_process_data', JSON.stringify(mergedData));
    }
    
    async processOfflineQueue() {
        const queue = this.getOfflineQueue();
        
        if (queue.length === 0) return;
        
        console.log(`Processing ${queue.length} items from offline queue`);
        
        for (const item of queue) {
            try {
                await this.processQueueItem(item);
                this.removeFromQueue(item.id);
            } catch (error) {
                console.error('Failed to process queue item:', item, error);
                item.retries = (item.retries || 0) + 1;
                
                if (item.retries >= this.config.maxRetries) {
                    console.log('Max retries reached, removing item:', item);
                    this.removeFromQueue(item.id);
                }
            }
        }
    }
    
    async processQueueItem(item) {
        switch(item.type) {
            case 'sync_to_sheets':
                await this.syncToGoogleSheets();
                break;
            case 'save_data':
                await this.saveDataToServer(item.data);
                break;
            default:
                console.log('Unknown queue item type:', item.type);
        }
    }
    
    addToOfflineQueue(type, data) {
        const queue = this.getOfflineQueue();
        
        queue.push({
            id: Date.now() + Math.random(),
            type: type,
            data: data,
            timestamp: new Date().toISOString(),
            retries: 0
        });
        
        localStorage.setItem(this.config.offlineQueue, JSON.stringify(queue));
    }
    
    getOfflineQueue() {
        return JSON.parse(localStorage.getItem(this.config.offlineQueue) || '[]');
    }
    
    removeFromQueue(itemId) {
        const queue = this.getOfflineQueue();
        const filteredQueue = queue.filter(item => item.id !== itemId);
        localStorage.setItem(this.config.offlineQueue, JSON.stringify(filteredQueue));
    }
    
    getLocalData() {
        return JSON.parse(localStorage.getItem('hot_process_data') || '{"towers":{"A":{"flats":{}},"B":{"flats":{}},"C":{"flats":{}}}}');
    }
    
    async saveDataToServer(data) {
        // Implementation for saving data to your server
        console.log('Saving data to server:', data);
    }
    
    checkAndSync() {
        if (navigator.onLine) {
            const lastSync = localStorage.getItem('last_sync_time');
            const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
            
            if (!lastSync || new Date(lastSync) < tenMinutesAgo) {
                this.syncAll();
            }
        }
    }
    
    showNotification(message, type) {
        // Implementation depends on your UI framework
        console.log(`${type.toUpperCase()}: ${message}`);
        
        // You can integrate with your existing notification system
        if (typeof showNotification === 'function') {
            showNotification(message, type);
        }
    }
    
    // Export data
    exportData(format = 'json') {
        const data = this.getLocalData();
        
        switch(format) {
            case 'json':
                return JSON.stringify(data, null, 2);
                
            case 'csv':
                return this.convertToCSV(data);
                
            case 'excel':
                return this.convertToExcel(data);
                
            default:
                throw new Error(`Unsupported format: ${format}`);
        }
    }
    
    convertToCSV(data) {
        // Convert data to CSV format
        let csv = 'Tower,Flat,Key_Handover,Snagging,First_Visit,Handover,Move_In\n';
        
        ['A', 'B', 'C'].forEach(tower => {
            Object.entries(data.towers[tower].flats).forEach(([flatId, flatData]) => {
                const flatNumber = flatId.split('-')[1];
                const keyStatus = flatData.keyHandover ? 'Yes' : 'No';
                const snagStatus = flatData.snagging ? 'Yes' : 'No';
                const visitStatus = flatData.firstVisit ? 'Yes' : 'No';
                const handoverStatus = flatData.handover ? 'Yes' : 'No';
                const moveinStatus = flatData.interiors?.moveInClearance ? 'Yes' : 'No';
                
                csv += `${tower},${flatNumber},${keyStatus},${snagStatus},${visitStatus},${handoverStatus},${moveinStatus}\n`;
            });
        });
        
        return csv;
    }
    
    convertToExcel(data) {
        // Using SheetJS to create Excel file
        const wsData = [
            ['Tower', 'Flat', 'Key Handover', 'Snagging', 'First Visit', 'Handover', 'Move-in', 'Last Updated']
        ];
        
        ['A', 'B', 'C'].forEach(tower => {
            Object.entries(data.towers[tower].flats).forEach(([flatId, flatData]) => {
                const flatNumber = flatId.split('-')[1];
                const keyDate = flatData.keyHandover?.date || '';
                const snagDate = flatData.snagging?.endDate || '';
                const visitDate = flatData.firstVisit?.visitDate || '';
                const handoverDate = flatData.handover?.date || '';
                const moveinDate = flatData.interiors?.moveInDate || '';
                const lastUpdated = flatData.keyHandover?.timestamp || '';
                
                wsData.push([
                    tower, flatNumber, keyDate, snagDate, visitDate, handoverDate, moveinDate, lastUpdated
                ]);
            });
        });
        
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'HOT Process Data');
        
        return XLSX.write(wb, { type: 'binary', bookType: 'xlsx' });
    }
    
    // Import data from external source
    async importFromGoogleSheet(sheetUrl) {
        try {
            const sheetId = this.extractSheetId(sheetUrl);
            const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json`;
            
            const response = await fetch(url);
            const text = await response.text();
            const json = JSON.parse(text.substr(47).slice(0, -2));
            
            const data = this.parseGoogleSheetData(json);
            this.saveImportedData(data);
            
            this.showNotification('Data imported from Google Sheets', 'success');
            
        } catch (error) {
            console.error('Error importing from Google Sheets:', error);
            this.showNotification('Import failed: ' + error.message, 'error');
        }
    }
    
    extractSheetId(url) {
        const patterns = [
            /\/d\/([a-zA-Z0-9-_]+)/,
            /id=([a-zA-Z0-9-_]+)/,
            /key=([a-zA-Z0-9-_]+)/
        ];
        
        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match) return match[1];
        }
        
        throw new Error('Invalid Google Sheets URL');
    }
    
    parseGoogleSheetData(json) {
        // Parse Google Sheets JSON data
        const rows = json.table.rows;
        const data = { towers: { A: { flats: {} }, B: { flats: {} }, C: { flats: {} } } };
        
        rows.forEach(row => {
            const cells = row.c;
            
            // Assuming first column is tower, second is flat
            const tower = cells[0]?.v;
            const flat = cells[1]?.v;
            
            if (tower && flat) {
                const flatId = `${tower}-${flat}`;
                
                // Parse other columns based on your sheet structure
                // This is a simplified example
                data.towers[tower].flats[flatId] = {
                    keyHandover: {
                        date: cells[2]?.v || '',
                        person: cells[3]?.v || '',
                        status: 'completed'
                    }
                };
            }
        });
        
        return data;
    }
    
    saveImportedData(data) {
        const existingData = this.getLocalData();
        const mergedData = this.mergeData(existingData, data);
        
        localStorage.setItem('hot_process_data', JSON.stringify(mergedData));
        localStorage.setItem('last_import_time', new Date().toISOString());
    }
    
    mergeData(existing, imported) {
        // Deep merge of data
        const merged = JSON.parse(JSON.stringify(existing));
        
        ['A', 'B', 'C'].forEach(tower => {
            if (imported.towers[tower]) {
                merged.towers[tower].flats = {
                    ...merged.towers[tower].flats,
                    ...imported.towers[tower].flats
                };
            }
        });
        
        return merged;
    }
}

// Initialize Sync Manager
let syncManager = null;

document.addEventListener('DOMContentLoaded', function() {
    syncManager = new SyncManager();
    
    // Make syncManager available globally
    window.syncManager = syncManager;
});

// Export functions for use in other files
function syncAllData() {
    if (syncManager) {
        syncManager.syncAll();
    }
}

function exportData(format = 'json') {
    if (syncManager) {
        return syncManager.exportData(format);
    }
    return null;
}

function importFromGoogleSheet(url) {
    if (syncManager) {
        return syncManager.importFromGoogleSheet(url);
    }
}