const RPC = require('@hyperswarm/rpc');
const DHT = require('hyperdht');
const crypto = require('crypto');
const schedule = require('node-schedule');
const DataCollector = require('./dataCollector');
const Database = require('./db');

class Server {
    constructor() {
        this.dataCollector = new DataCollector();
        this.db = new Database('./db/server');
        this.dht = null;
        this.rpc = null;
        this.rpcServer = null;
    }

    async initialize() {
        // Set up database
        await this.db.ready();

        // Set up DHT
        const dhtSeed = crypto.randomBytes(32);
        this.dht = new DHT({
            port: 40001,
            keyPair: DHT.keyPair(dhtSeed),
            bootstrap: [{ host: '127.0.0.1', port: 30001 }]
        });
        await this.dht.ready();

        // Set up RPC
        const rpcSeed = crypto.randomBytes(32);
        this.rpc = new RPC({ seed: rpcSeed, dht: this.dht });
        this.rpcServer = this.rpc.createServer();
        await this.rpcServer.listen();

        console.log('Server running on public key:', this.rpcServer.publicKey.toString('hex'));

        // Set up RPC handlers
        this.setupRpcHandlers();

        // Get initial data
        await this.collectAndStoreData();

        // Start regular updates
        this.startScheduledCollection();
    }

    setupRpcHandlers() {
        this.rpcServer.respond('getLatestPrices', async (reqRaw) => {
            const req = JSON.parse(reqRaw.toString('utf-8'));
            const pairs = req.pairs || [];
            console.log('Getting latest prices for:', pairs.length ? pairs : 'all pairs');
            const results = await this.db.getLatestPrices(pairs);
            return Buffer.from(JSON.stringify(results), 'utf-8');
        });

        this.rpcServer.respond('getHistoricalPrices', async (reqRaw) => {
            const req = JSON.parse(reqRaw.toString('utf-8'));
            const { pairs, from, to } = req;
            console.log('Getting historical prices for:', pairs.length ? pairs : 'all pairs');
            const results = await this.db.getHistoricalPrices(pairs, from, to);
            return Buffer.from(JSON.stringify(results), 'utf-8');
        });
    }

    async collectAndStoreData() {
        try {
            console.log('Starting data collection...');
            const data = await this.dataCollector.collectData();
            
            // Log the collected data
            data.forEach(item => {
                console.log(`Collected data for ${item.crypto}:`);
                console.log(`  Average price: ${item.averagePrice}`);
                console.log(`  Prices from ${item.prices.length} exchanges:`);
                item.prices.forEach(price => {
                    console.log(`    ${price.exchange}: ${price.price}`);
                });
            });

            // Store the data
            for (const item of data) {
                await this.db.storePriceData(item);
            }
            console.log('Data collection completed at:', new Date().toISOString());
        } catch (error) {
            console.error('Error in data collection:', error);
        }
    }

    startScheduledCollection() {
        // Run every 5 minutes
        schedule.scheduleJob('*/5 * * * *', async () => {
            await this.collectAndStoreData();
        });
    }

    async cleanup() {
        if (this.rpcServer) await this.rpcServer.close();
        if (this.dht) await this.dht.destroy();
    }
}

// Start the server
const server = new Server();
server.initialize().catch(console.error);

// Clean up on exit
process.on('SIGINT', async () => {
    console.log('Shutting down...');
    await server.cleanup();
    process.exit(0);
}); 