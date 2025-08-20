import { getQuote } from '../dist/src/uniswap.js';

const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

async function main() {
  const res = await getQuote({
    chainId: 1,
    tokenIn: WETH,
    tokenOut: USDC,
    amountInHuman: '0.1',
    slippageBps: 100,
  });
  console.log('Quote result:', res);
}

main().catch((e) => {
  console.error('Test error:', e);
  process.exit(1);
});



