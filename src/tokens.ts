export type Token = { symbol: string; address: string; decimals: number; name?: string };

const ETH: Token = { symbol: "ETH", address: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE", decimals: 18, name: "Ether" };
const WETH: Token = { symbol: "WETH", address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", decimals: 18 };
const USDC: Token = { symbol: "USDC", address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 };
const USDT: Token = { symbol: "USDT", address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6 };

const MAP: Record<string, Token> = {
  ETH, WETH, USDC, USDT,
  ETHER: ETH,
};

export async function resolveTokenPair(base: string, quote: string): Promise<{ in: Token; out: Token } | null> {
  const b = MAP[base.toUpperCase()] || null;
  const q = MAP[quote.toUpperCase()] || null;
  if (!b || !q) return null;
  const tokenIn = b.symbol === "ETH" ? WETH : b;
  return { in: tokenIn, out: q };
}

// Static decimals lookup for common tokens; fallback to 18
export function getStaticDecimals(address: string): number {
  const a = address.toLowerCase();
  if (a === WETH.address.toLowerCase()) return WETH.decimals;
  if (a === USDC.address.toLowerCase()) return USDC.decimals;
  if (a === USDT.address.toLowerCase()) return USDT.decimals;
  if (a === ETH.address.toLowerCase()) return ETH.decimals;
  return 18;
}
