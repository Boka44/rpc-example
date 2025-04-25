const fetch = require('node-fetch');

class DataCollector {
    constructor() {
        this.baseUrl = 'https://api.coingecko.com/api/v3';
        // API rate limit is ~30 requests per minute
        this.rateLimitDelay = 15000; // 15 seconds delay between requests
    }

    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async makeRequest(url, retries = 3) {
        for (let i = 0; i < retries; i++) {
            try {
                const response = await fetch(url);
                
                if (response.status === 429) {
                    console.log('Hit rate limit, waiting...');
                    await this.sleep(this.rateLimitDelay);
                    continue;
                }
                
                if (!response.ok) {
                    throw new Error(`CoinGecko API error: ${response.status} ${response.statusText}`);
                }
                
                return await response.json();
            } catch (error) {
                if (i === retries - 1) throw error;
                console.log(`Request failed, retrying... (${i + 1}/${retries})`);
                await this.sleep(this.rateLimitDelay);
            }
        }
    }

    async getTopCryptos() {
        try {
            const data = await this.makeRequest(
                `${this.baseUrl}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=5&page=1&sparkline=false`
            );
            
            if (!Array.isArray(data)) {
                throw new Error('Invalid response from CoinGecko API');
            }
            
            return data.map(coin => coin.id);
        } catch (error) {
            console.error('Error fetching top cryptocurrencies:', error);
            throw error;
        }
    }

    async getTopExchanges() {
        try {
            const data = await this.makeRequest(
                `${this.baseUrl}/exchanges?per_page=3&order=volume_desc`
            );
            
            if (!Array.isArray(data)) {
                throw new Error('Invalid response from CoinGecko API');
            }
            
            return data.map(exchange => exchange.id);
        } catch (error) {
            console.error('Error fetching top exchanges:', error);
            throw error;
        }
    }

    async getPrices(cryptoId) {
        try {
            const topExchanges = await this.getTopExchanges();
            const prices = [];
            const timestamp = Date.now();

            // Get prices from each exchange
            for (const exchangeId of topExchanges) {
                try {
                    await this.sleep(this.rateLimitDelay); // Add delay between requests
                    
                    const tickerData = await this.makeRequest(
                        `${this.baseUrl}/exchanges/${exchangeId}/tickers?coin_ids=${cryptoId}`
                    );

                    if (!tickerData?.tickers?.length) {
                        console.log(`No tickers for ${cryptoId} on ${exchangeId}`);
                        continue;
                    }

                    // console.log(`Available trading pairs for ${cryptoId} on ${exchangeId}:`);
                    // tickerData.tickers.forEach(ticker => {
                    //     console.log(`  ${ticker.base}/${ticker.target}`);
                    // });


                    // Try USDT first, then USD, then any USD pair
                    let ticker = tickerData.tickers.find(t => t.target.toLowerCase() === 'usdt') ||
                               tickerData.tickers.find(t => t.target.toLowerCase() === 'usd') ||
                               tickerData.tickers.find(t => t.target.toLowerCase().includes('usd'));

                    if (ticker) {
                        prices.push({
                            exchange: exchangeId,
                            price: ticker.last,
                            volume: ticker.volume,
                            timestamp: ticker.timestamp || timestamp,
                            pair: `${ticker.base}/${ticker.target}`
                        });
                        console.log(`Found price for ${cryptoId} on ${exchangeId}: ${ticker.last} ${ticker.target}`);
                    } else {
                        console.log(`No suitable trading pair found for ${cryptoId} on ${exchangeId}`);
                    }
                } catch (error) {
                    console.error(`Error fetching price for ${cryptoId} on ${exchangeId}:`, error);
                    continue;
                }
            }

            if (prices.length === 0) {
                throw new Error(`No prices available for ${cryptoId} on any exchange`);
            }

            // Calculate average price
            const averagePrice = prices.reduce((sum, p) => sum + p.price, 0) / prices.length;

            return {
                crypto: cryptoId,
                averagePrice,
                prices,
                timestamp
            };
        } catch (error) {
            console.error(`Error fetching prices for ${cryptoId}:`, error);
            throw error;
        }
    }

    async collectData() {
        try {
            const topCryptos = await this.getTopCryptos();
            const results = [];

            for (const cryptoId of topCryptos) {
                try {
                    await this.sleep(this.rateLimitDelay); // Add delay between requests
                    const priceData = await this.getPrices(cryptoId);
                    if (priceData) {
                        results.push(priceData);
                    }
                } catch (error) {
                    console.error(`Error fetching price for ${cryptoId}:`, error);
                    continue;
                }
            }

            if (results.length === 0) {
                throw new Error('No price data collected');
            }

            return results;
        } catch (error) {
            console.error('Error collecting data:', error);
            throw error;
        }
    }
}

module.exports = DataCollector; 