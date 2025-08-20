import { ethers } from "ethers";
// Addresses (Ethereum mainnet)
export const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
export const QUOTER_V2 = "0x61fFE014bA17989E743c5F6cB21bF9697530B21e";
export const SWAP_ROUTER_02 = "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45";
const ERC20_ABI = [
    "function decimals() view returns (uint8)",
    "function approve(address spender, uint256 value) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)",
];
const QUOTER_ABI = [
    // QuoterV2 returns (amountOut, sqrtPriceX96After, initializedTicksCrossed, gasEstimate)
    "function quoteExactInputSingle((address tokenIn,address tokenOut,uint24 fee,uint256 amountIn,uint160 sqrtPriceLimitX96)) view returns (uint256,uint160,uint32,uint256)",
    "function quoteExactInput(bytes path,uint256 amountIn) view returns (uint256,uint160,uint32,uint256)",
];
const SWAP_ROUTER_ABI = [
    "function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns (uint256 amountOut)",
];
export async function getTokenDecimals(provider, token) {
    const c = new ethers.Contract(token, ERC20_ABI, provider);
    return await c.decimals();
}
export async function quoteSingleHop(provider, tokenIn, tokenOut, amountIn) {
    const quoter = new ethers.Contract(QUOTER_V2, QUOTER_ABI, provider);
    const fees = [500, 3000, 10000];
    let best = { fee: 3000, amountOut: 0n };
    for (const fee of fees) {
        try {
            const params = { tokenIn, tokenOut, fee, amountIn, sqrtPriceLimitX96: 0n };
            const [amountOut] = await quoter.quoteExactInputSingle.staticCall(params);
            if (amountOut > best.amountOut)
                best = { fee, amountOut };
        }
        catch {
            // Fallback to bytes path form (tokenIn | fee | tokenOut)
            try {
                const path = ethers.concat([
                    ethers.getBytes(ethers.getAddress(tokenIn)),
                    ethers.getBytes(ethers.toBeHex(fee, 3)),
                    ethers.getBytes(ethers.getAddress(tokenOut)),
                ]);
                const [amountOut2] = await quoter.quoteExactInput.staticCall(path, amountIn);
                if (amountOut2 > best.amountOut)
                    best = { fee, amountOut: amountOut2 };
            }
            catch {
                // ignore pools that don't exist
            }
        }
    }
    return best.amountOut > 0n ? best : null;
}
export function applySlippage(amountOut, slippagePct) {
    return (amountOut * BigInt(100 - Math.floor(slippagePct))) / 100n;
}
export async function buildSwapExactIn(provider, { tokenIn, tokenOut, amountInHuman, slippagePct, recipient, }) {
    const decIn = await getTokenDecimals(provider, tokenIn);
    const amountIn = ethers.parseUnits(amountInHuman, decIn);
    const quote = await quoteSingleHop(provider, tokenIn, tokenOut, amountIn);
    if (!quote)
        throw new Error("No V3 single-hop route available");
    const minOut = applySlippage(quote.amountOut, slippagePct);
    const to = SWAP_ROUTER_02;
    const iface = new ethers.Interface(SWAP_ROUTER_ABI);
    const params = {
        tokenIn,
        tokenOut,
        fee: quote.fee,
        // Recipient will be msg.sender (the user's wallet) if zero.
        recipient: recipient && recipient !== "0x0000000000000000000000000000000000000000" ? recipient : ethers.ZeroAddress,
        deadline: BigInt(Math.floor(Date.now() / 1000) + 60 * 5),
        amountIn,
        amountOutMinimum: minOut,
        sqrtPriceLimitX96: 0n,
    };
    const data = iface.encodeFunctionData("exactInputSingle", [params]);
    const txRequest = { to, data };
    // rough gas estimate to surface on UI
    let gasHint;
    try {
        const gas = await provider.estimateGas({ to, data });
        const fee = await provider.getFeeData();
        gasHint = { gasUnits: Number(gas), gasPriceGwei: fee.gasPrice ? Number(ethers.formatUnits(fee.gasPrice, 9)) : undefined };
    }
    catch { }
    return { txRequest, quote, minOut, gasHint };
}
export function buildSwapTxFromKnownQuote({ tokenIn, tokenOut, fee, amountInHuman, tokenInDecimals, minOut, recipient, }) {
    const amountIn = ethers.parseUnits(amountInHuman, tokenInDecimals);
    const to = SWAP_ROUTER_02;
    const iface = new ethers.Interface(SWAP_ROUTER_ABI);
    const params = {
        tokenIn,
        tokenOut,
        fee,
        recipient: recipient ?? "0x0000000000000000000000000000000000000000",
        deadline: BigInt(Math.floor(Date.now() / 1000) + 60 * 5),
        amountIn,
        amountOutMinimum: minOut,
        sqrtPriceLimitX96: 0n,
    };
    const data = iface.encodeFunctionData("exactInputSingle", [params]);
    return { txRequest: { to, data } };
}
