import { ethers } from "ethers";
import { SWAP_ROUTER_02, WETH as WETH_ADDRESS, applySlippage, buildSwapTxFromKnownQuote } from "./onchainSwap.js";
import { getStaticDecimals } from "./tokens.js";
const ERC20_ABI = [
    "function approve(address spender, uint256 value) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function balanceOf(address account) view returns (uint256)",
];
const WETH_ABI = [
    "function deposit() payable",
    "function balanceOf(address account) view returns (uint256)",
];
export async function performSwap(provider, wallet, quote, slippagePct) {
    const tokenIn = ethers.getAddress(quote.request.tokenIn);
    const tokenOut = ethers.getAddress(quote.request.tokenOut);
    const amountInHuman = quote.request.amountInHuman;
    const feeTier = Number(quote.raw?.feeTier || 3000);
    const tokenInDecimals = getStaticDecimals(tokenIn);
    const tokenOutDecimals = getStaticDecimals(tokenOut);
    const amountIn = ethers.parseUnits(amountInHuman, tokenInDecimals);
    // Compute minOut with slippage
    const bestOutStr = String(quote.raw?.amountOut || "0");
    const bestOut = BigInt(bestOutStr);
    if (bestOut === 0n)
        throw new Error("Invalid quote: amountOut is 0");
    const minOut = applySlippage(bestOut, slippagePct);
    // If tokenIn is WETH, ensure we have enough WETH (wrap ETH if needed)
    if (tokenIn.toLowerCase() === WETH_ADDRESS.toLowerCase()) {
        await ensureWethBalance(wallet, amountIn);
    }
    // Ensure allowance to the router for ERC20 input
    await ensureAllowance(provider, wallet, tokenIn, SWAP_ROUTER_02, amountIn);
    // Build swap calldata using known quote details
    const { txRequest } = buildSwapTxFromKnownQuote({
        tokenIn,
        tokenOut,
        fee: feeTier,
        amountInHuman,
        tokenInDecimals,
        minOut,
        recipient: wallet.address,
    });
    const sent = await wallet.sendTransaction({ ...txRequest });
    const rec = await sent.wait();
    if (!rec)
        throw new Error("No receipt");
    return { hash: sent.hash };
}
async function ensureAllowance(provider, wallet, token, spender, requiredAmount) {
    // Native ETH path is disabled (we map ETH->WETH earlier), so always ERC20 here
    const erc20 = new ethers.Contract(token, ERC20_ABI, provider).connect(wallet);
    const current = await erc20.allowance(wallet.address, spender);
    if (current >= requiredAmount)
        return;
    try {
        const tx = await erc20.approve(spender, requiredAmount);
        await tx.wait();
    }
    catch {
        // Some tokens (e.g., USDT) require allowance reset to zero first
        const zero = await erc20.approve(spender, 0n);
        await zero.wait();
        const tx2 = await erc20.approve(spender, requiredAmount);
        await tx2.wait();
    }
}
async function ensureWethBalance(wallet, requiredAmount) {
    const weth = new ethers.Contract(WETH_ADDRESS, WETH_ABI, wallet);
    const bal = await weth.balanceOf(wallet.address);
    if (bal >= requiredAmount)
        return;
    const shortfall = requiredAmount - bal;
    // Wrap exactly the shortfall
    const depositTx = await weth.deposit({ value: shortfall });
    await depositTx.wait();
}
