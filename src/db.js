const Hypercore = require('hypercore');
const Hyperbee = require('hyperbee');

class Database {
    constructor(storagePath) {
        this.core = new Hypercore(storagePath);
        this.db = new Hyperbee(this.core, {
            keyEncoding: 'utf-8',
            valueEncoding: 'json'
        });
    }

    async ready() {
        await this.db.ready();
    }

    async storePriceData(data) {
        const timestamp = data.timestamp;
        const crypto = data.crypto;
        const key = `price:${crypto}:${timestamp}`;
        await this.db.put(key, data);
    }

    async getAllPairs() {
        const pairs = new Set();
        const iterator = this.db.createReadStream({
            gt: 'price:',
            lt: 'price:~'
        });

        for await (const { key } of iterator) {
            // Get crypto ID from key (price:cryptoId:timestamp)
            const parts = key.split(':');
            if (parts.length === 3) {
                pairs.add(parts[1]);
            }
        }

        return Array.from(pairs);
    }

    async getLatestPrices(pairs) {
        const results = {};
        
        // Get all pairs if none specified
        if (!pairs || pairs.length === 0) {
            pairs = await this.getAllPairs();
        }
        
        for (const pair of pairs) {
            // Get most recent price
            const iterator = this.db.createReadStream({
                gt: `price:${pair}:`,
                lt: `price:${pair}:~`,
                reverse: true,
                limit: 1
            });

            for await (const { value } of iterator) {
                results[pair] = {
                    averagePrice: value.averagePrice,
                    prices: value.prices,
                    timestamp: value.timestamp
                };
                break;
            }
        }

        return results;
    }

    async getHistoricalPrices(pairs, from, to) {
        const results = {};
        
        // Get all pairs if none specified
        if (!pairs || pairs.length === 0) {
            pairs = await this.getAllPairs();
        }
        
        for (const pair of pairs) {
            results[pair] = [];
            
            // Get prices in time range
            const iterator = this.db.createReadStream({
                gt: `price:${pair}:${from}`,
                lt: `price:${pair}:${to}`
            });

            for await (const { value } of iterator) {
                results[pair].push({
                    averagePrice: value.averagePrice,
                    prices: value.prices,
                    timestamp: value.timestamp
                });
            }
        }

        return results;
    }
}

module.exports = Database; 