const RPC = require('@hyperswarm/rpc');
const DHT = require('hyperdht');
const crypto = require('crypto');

class Client {
    constructor(serverPublicKey) {
        this.serverPublicKey = Buffer.from(serverPublicKey, 'hex');
        this.dht = null;
        this.rpc = null;
    }

    async initialize() {
        // Initialize DHT
        const dhtSeed = crypto.randomBytes(32);
        this.dht = new DHT({
            port: 50001,
            keyPair: DHT.keyPair(dhtSeed),
            bootstrap: [{ host: '127.0.0.1', port: 30001 }]
        });
        await this.dht.ready();

        // Initialize RPC
        this.rpc = new RPC({ dht: this.dht });
    }

    async getLatestPrices(pairs = []) {
        try {
            const payload = { pairs };
            const payloadRaw = Buffer.from(JSON.stringify(payload), 'utf-8');
            const respRaw = await this.rpc.request(this.serverPublicKey, 'getLatestPrices', payloadRaw);
            const data = JSON.parse(respRaw.toString('utf-8'));
            
            if (Object.keys(data).length === 0) {
                console.log('No prices available yet. Wait for the server to collect some data.');
                return null;
            }
            
            return data;
        } catch (error) {
            console.error('Error getting latest prices:', error);
            throw error;
        }
    }

    async getHistoricalPrices(pairs = [], from, to) {
        try {
            const payload = { pairs, from, to };
            const payloadRaw = Buffer.from(JSON.stringify(payload), 'utf-8');
            const respRaw = await this.rpc.request(this.serverPublicKey, 'getHistoricalPrices', payloadRaw);
            const data = JSON.parse(respRaw.toString('utf-8'));
            
            if (Object.keys(data).length === 0) {
                console.log('No historical data available yet. Wait for the server to collect some data.');
                return null;
            }
            
            return data;
        } catch (error) {
            console.error('Error getting historical prices:', error);
            throw error;
        }
    }

    async cleanup() {
        if (this.rpc) await this.rpc.destroy();
        if (this.dht) await this.dht.destroy();
    }
}

async function main() {
    // Replace with the actual server public key from the server console output
    const serverPublicKey = 'e6fc1c9c739d81435fb5fe3c9d26d764b57772f63e8a2a109b4a4382d14b5474';
    
    const client = new Client(serverPublicKey);
    await client.initialize();

    try {
        // Get latest prices for all available pairs
        console.log('Fetching latest prices...');
        const latestPrices = await client.getLatestPrices();
        if (latestPrices) {
            console.log('Latest prices:', latestPrices);
        }

        // Get prices from the last hour
        console.log('\nGetting prices from the last hour...');
        const oneHourAgo = Date.now() - (60 * 60 * 1000);
        const historicalPrices = await client.getHistoricalPrices(
            [], // Get all pairs
            oneHourAgo,
            Date.now()
        );
        if (historicalPrices) {
            console.log('Historical prices:', historicalPrices);
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await client.cleanup();
    }
}

main().catch(console.error); 