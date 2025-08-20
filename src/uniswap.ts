import { ethers } from "ethers";
import { getStaticDecimals } from "./tokens.js";

export type QuoteRequest = {
  chainId: number;
  tokenIn: string;
  tokenOut: string;
  amountInHuman: string;
  slippageBps: number;
};

export type QuoteResponse = {
  request: QuoteRequest;
  ui: {
    tokenIn: { symbol: string };
    tokenOut: { symbol: string };
    amountOutHuman: string;
    executionPrice: string;
    feeSummary: string;
  };
  raw: any;
  // Enhanced quote properties
  gasEstimate?: string;
  gasPrice?: string;
  gasCostEth?: string;
  needsApproval?: boolean;
  txRequest?: any;
  value?: string;
};

export async function getQuote(req: QuoteRequest): Promise<QuoteResponse | null> {
  const urls: string[] = [
    process.env.RPC_URL || "",
    "https://1rpc.io/eth",
    "https://ethereum.publicnode.com",
    "https://rpc.ankr.com/eth",
    "https://rpc.builder0x69.io",
    "https://eth.llamarpc.com",
    "https://cloudflare-eth.com",
  ].filter(Boolean);
  for (const url of urls) {
    try {
      const provider = new ethers.JsonRpcProvider(url);
      // quick connectivity test; tolerant of some providers rejecting eth_blockNumber
      try { await provider.getBlockNumber(); } catch {}

      const decIn = getStaticDecimals(req.tokenIn);
      const decOut = getStaticDecimals(req.tokenOut);
      const amountIn = ethers.parseUnits(req.amountInHuman, decIn);

      const QUOTER_V2 = "0x61fFE014bA17989E743c5F6cB21bF9697530B21e";
      const QUOTER_ABI = [
        "function quoteExactInputSingle((address tokenIn,address tokenOut,uint24 fee,uint256 amountIn,uint160 sqrtPriceLimitX96)) returns (uint256 amountOut,uint160,uint32,uint256)",
        "function quoteExactInput(bytes path,uint256 amountIn) returns (uint256 amountOut,uint160,uint32,uint256)",
      ];
      const quoter = new ethers.Contract(QUOTER_V2, QUOTER_ABI, provider);
      const fees: Array<500 | 3000 | 10000> = [500, 3000, 10000];
      let bestOut: bigint = 0n;
      let bestFee: 500 | 3000 | 10000 = 3000;
      for (const fee of fees) {
        try {
          const params = { tokenIn: req.tokenIn, tokenOut: req.tokenOut, fee, amountIn, sqrtPriceLimitX96: 0n };
          const [amountOut]: [bigint, bigint, number, bigint] = await quoter.quoteExactInputSingle.staticCall(params);
          const out: bigint = amountOut;
          if (out > bestOut) { bestOut = out; bestFee = fee; }
        } catch (e) {
          // fallback: bytes path (tokenIn | fee | tokenOut)
          try {
            const path = ethers.concat([
              ethers.getBytes(ethers.getAddress(req.tokenIn)),
              ethers.getBytes(ethers.toBeHex(fee, 3)),
              ethers.getBytes(ethers.getAddress(req.tokenOut)),
            ]);
            const [amountOut2]: [bigint, bigint, number, bigint] = await quoter.quoteExactInput.staticCall(path, amountIn);
            const out2: bigint = amountOut2;
            if (out2 > bestOut) { bestOut = out2; bestFee = fee; }
          } catch {
            // ignore missing pools or provider errors
          }
        }
      }
      if (bestOut === 0n) return null;

    const amountOutHuman = ethers.formatUnits(bestOut, decOut);
    const execPrice = computeExecPrice(amountIn, decIn, bestOut, decOut);
    // rough gas price hint
    let feeSummary = "n/a";
    try {
      const fee = await provider.getFeeData();
      const gp = fee.gasPrice ? Number(ethers.formatUnits(fee.gasPrice, 9)).toFixed(2) : undefined;
      if (gp) feeSummary = `gasPrice≈${gp} gwei`;
    } catch {}

      return {
        request: req,
        ui: {
          tokenIn: { symbol: symbolFromAddr(req.tokenIn) },
          tokenOut: { symbol: symbolFromAddr(req.tokenOut) },
          amountOutHuman,
          executionPrice: execPrice,
          feeSummary,
        },
        raw: { feeTier: bestFee, amountOut: bestOut.toString() },
      };
    } catch (e: any) {
      console.warn(`RPC provider failed (${url}):`, e?.message || e);
      continue;
    }
  }
  return null;
}

export type TxBuildResult = { url: string; calldata: string; to: string; chainId: number };

async function getTokenDecimals(provider: ethers.Provider, token: string): Promise<number> {
  const ERC20_ABI = ["function decimals() view returns (uint8)"];
  try {
    const c = new ethers.Contract(token, ERC20_ABI, provider);
    return await c.decimals();
  } catch {
    return 18;
  }
}

function computeExecPrice(amountIn: bigint, decIn: number, amountOut: bigint, decOut: number): string {
  try {
    const inHuman = Number(ethers.formatUnits(amountIn, decIn));
    const outHuman = Number(ethers.formatUnits(amountOut, decOut));
    if (inHuman === 0) return "n/a";
    return String(outHuman / inHuman);
  } catch {
    return "n/a";
  }
}
function symbolFromAddr(addr: string): string {
  const a = addr.toLowerCase();
  if (a === "0xc02aa39b223fe8d0a0e5c4f27ead9083c756cc2") return "ETH";
  if (a === "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48") return "USDC";
  if (a === "0xdac17f958d2ee523a2206206994597c13d831ec7") return "USDT";
  if (a === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee") return "ETH";
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}
