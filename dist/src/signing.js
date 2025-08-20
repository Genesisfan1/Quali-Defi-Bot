import { ethers } from 'ethers';
import { buildSwapExactIn, getTokenDecimals, SWAP_ROUTER_02 } from './onchainSwap.js';
export function registerSigningRoutes(app, rpcUrl) {
    app.get('/sign/swap', async (req, reply) => {
        const q = req.query || {};
        const chainId = Number(q.chainId || 1);
        const tokenIn = String(q.tokenIn || '');
        const tokenOut = String(q.tokenOut || '');
        const amountIn = String(q.amountIn || '');
        const slippageBps = Number(q.slippageBps || 100);
        const router = SWAP_ROUTER_02;
        const short = (a) => (a ? a.slice(0, 6) + '…' + a.slice(-4) : '');
        const symbol = (addr) => {
            const a = (addr || '').toLowerCase();
            // FIX: correct WETH address (had a missing 'a')
            if (a === '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2')
                return 'ETH';
            if (a === '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48')
                return 'USDC';
            if (a === '0xdac17f958d2ee523a2206206994597c13d831ec7')
                return 'USDT';
            return short(addr);
        };
        // Prefill estimate and gas on the server to match chat quote
        let estInit = '—';
        let gasInit = '—';
        try {
            const provider = new ethers.JsonRpcProvider(rpcUrl);
            const { quote, minOut, gasHint } = await buildSwapExactIn(provider, {
                tokenIn,
                tokenOut,
                amountInHuman: amountIn,
                // FIX: bps -> percent (100 bps = 1%), but function expects fraction => /10000
                slippagePct: slippageBps / 10_000,
            });
            const decOut = await getTokenDecimals(provider, tokenOut);
            const amountOutHuman = ethers.formatUnits(quote.amountOut, decOut);
            estInit = `${amountOutHuman} ${symbol(tokenOut)}`;
            const gasUnits = Number(gasHint?.gasUnits ?? 0);
            let gweiMaybe = Number(gasHint?.gasPriceGwei ?? 0);
            if (gweiMaybe > 1e6)
                gweiMaybe = gweiMaybe / 1e9; // looked like wei, convert to gwei
            if (gasUnits > 0 && gweiMaybe > 0) {
                const feeEth = (gasUnits * gweiMaybe) / 1e9;
                gasInit = `~${feeEth.toFixed(6)} ETH`;
            }
        }
        catch {
            // ignore server prefill errors
        }
        const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Quali • Confirm Swap</title>
  <style>
    :root { color-scheme: dark; --bg:#0b0f16; --card:#121827; --muted:#8aa0b6; --pri:#4f7cff; --ok:#1bc58d; --warn:#ffb020; --err:#ff5b6e; }
    *{ box-sizing:border-box }
    body{ margin:0; font:16px/1.4 system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, "Helvetica Neue", Arial, "Apple Color Emoji", "Segoe UI Emoji"; background:var(--bg); color:#e6eef7; }
    .wrap{ max-width:760px; margin:0 auto; padding:24px 16px 48px; }
    header{ display:flex; align-items:center; justify-content:space-between; margin-bottom:18px }
    .brand{ font-weight:600; letter-spacing:0.3px }
    .net{ font-size:12px; color:var(--muted) }
    .card{ background:var(--card); border:1px solid #1b2436; border-radius:14px; padding:18px; box-shadow:0 4px 14px rgba(0,0,0,.25) }
    .row{ display:block }
    .kv{ display:flex; justify-content:space-between; align-items:center; color:var(--muted); margin:8px 0; gap:16px }
    .kv b{ color:#e6eef7; font-weight:600 }
    .kv code{ color:#cfe3ff; background:#0e1729; padding:3px 6px; border-radius:6px }
    .cta{ margin-top:16px; display:flex; gap:10px; flex-wrap:wrap }
    button{ padding:12px 16px; border:0; border-radius:10px; background:var(--pri); color:#fff; font-weight:600; cursor:pointer }
    button[disabled]{ opacity:.6; cursor:not-allowed }
    .ghost{ background:#1b2436 }
    .msg{ margin-top:14px; font-family:ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace; white-space:pre-wrap; color:#8aa0b6 }
    .pill{ display:inline-flex; align-items:center; gap:6px; padding:6px 10px; border-radius:999px; background:#10213c; color:#bcd0e6; font-size:12px }
    a{ color:#9ec1ff; text-decoration:none }
    a:hover{ text-decoration:underline }
  </style>
</head>
<body>
  <div class="wrap">
    <header>
      <div class="brand">Quali • Confirm Swap</div>
      <div class="net" id="net">Ethereum Mainnet</div>
    </header>
    <div class="card">
      <div class="row">
        <div class="kv"><span>Destination</span> <div style="margin-left:auto; display:flex; gap:10px; align-items:center"><code id="srcAddr">${short(tokenIn)}</code> <b id="srcSym">(${symbol(tokenIn)})</b> <span>→</span> <code id="dstAddr">${short(router)}</code> <b id="dstSym">(${symbol(tokenOut)})</b></div></div>
        <div class="kv"><span>Amount</span> <div style="margin-left:auto; display:flex; gap:10px"><b id="amt">${amountIn}</b> <b id="amtToken">${symbol(tokenIn)}</b></div></div>
        <div class="kv"><span>Slippage</span> <div style="margin-left:auto"><b id="slip">${(slippageBps / 100).toFixed(2)}%</b></div></div>
        <div class="kv"><span>Est. Network Fee</span> <div style="margin-left:auto; display:flex; gap:10px"><b id="gas">${(gasInit.split(' ')[0] || '—')}</b> <b id="gasToken">${(gasInit.split(' ')[1] || 'ETH')}</b></div></div>
        <div class="kv"><span>Est. Receives</span> <div style="margin-left:auto; display:flex; gap:10px"><b id="est">${estInit.split(' ')[0]}</b> <b id="estToken">${symbol(tokenOut)}</b></div></div>
      </div>
      <div class="cta">
        <button id="connect">Connect Wallet</button>
        <button id="approve" class="ghost" disabled>Approve Token</button>
        <button id="swap" class="ghost" disabled>Sign Swap</button>
      </div>
      <div class="msg" id="msg"></div>
      <div class="kv" style="margin-top:10px"><span class="pill" id="addr">Not connected</span></div>
    </div>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/ethers@6.13.1/dist/ethers.umd.min.js"></script>
  <script src="https://unpkg.com/@metamask/detect-provider/dist/detect-provider.min.js"></script>
  <script>
    const params = new URLSearchParams(location.search);
    const chainId = Number(params.get('chainId') || '1');
    const tokenIn = params.get('tokenIn');
    const tokenOut = params.get('tokenOut');
    const amountIn = params.get('amountIn');
    const slippageBps = Number(params.get('slippageBps') || '100');
    const router = ${JSON.stringify(SWAP_ROUTER_02)};

    const $ = (id)=>document.getElementById(id);
    const msg = (t)=>{ $('msg').textContent = t || '' };
    let lastGasUnits = undefined;
    const short = (a)=> a ? a.slice(0,6) + '…' + a.slice(-4) : '';

    let current;
    const symbol = (addr)=>{
      if(!addr) return '';
      const a = String(addr).toLowerCase();
      if(a === '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2') return 'ETH';
      if(a === '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48') return 'USDC';
      if(a === '0xdac17f958d2ee523a2206206994597c13d831ec7') return 'USDT';
      return short(addr);
    };
    const isWeth = (addr)=> (addr||'').toLowerCase() === '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';

    // Pre-populate token symbols and destination before connect
    $('srcSym').textContent = '(' + symbol(tokenIn) + ')';
    $('dstSym').textContent = '(' + symbol(tokenOut) + ')';
    $('net').textContent = chainId === 1 ? 'Ethereum Mainnet' : 'Chain ' + chainId;

    async function waitForEthers(timeoutMs=3000){
      const start = Date.now();
      while (!window.ethers && Date.now() - start < timeoutMs) {
        await new Promise(r=>setTimeout(r, 50));
      }
      if(!window.ethers) throw new Error('Failed to load ethers library');
    }

    function normalizeGwei(x){
      let g = Number(x || 0);
      if (!isFinite(g) || g <= 0) return 0;
      if (g > 1e6) g = g / 1e9; // looked like wei
      return g;
    }
    function showFeeETH(gasUnits, gasPriceGwei){
      const gu = Number(gasUnits || 0);
      const gwei = normalizeGwei(gasPriceGwei);
      if (gu > 0 && gwei > 0) {
        const feeEth = (gu * gwei) / 1e9;
        $('gas').textContent = '~' + feeEth.toFixed(6);
        $('gasToken').textContent = 'ETH';
      }
    }

    // Prefetch estimate and gas info to mirror the chat quote
    (async () => {
      try{
        const r = await fetch('/sign/buildSwap', { method:'POST', headers:{ 'content-type':'application/json' }, body: JSON.stringify({ tokenIn, tokenOut, amountIn, slippageBps, chainId, recipient: current?.addr }) });
        const j = await r.json();
        if(!j?.ok){ throw new Error(j?.error || 'Quote failed'); }
        if(j?.ui?.amountOutHuman){ $('est').textContent = j.ui.amountOutHuman; $('estToken').textContent = symbol(tokenOut); }
        if(j?.ui?.gasUnits != null){ lastGasUnits = Number(j.ui.gasUnits); }
        showFeeETH(lastGasUnits, j?.ui?.gasPriceGwei);
        $('srcSym').textContent = '(' + symbol(tokenIn) + ')';
        $('dstSym').textContent = '(' + symbol(tokenOut) + ')';
      }catch(e){ msg('Error: ' + (e?.message||e)); }
    })();

    async function checkAllowance(current){
      try{
        if(!current || isWeth(tokenIn)) { $('approve').disabled = true; $('swap').disabled = false; return; }
        const erc20 = new window.ethers.Contract(tokenIn, ["function decimals() view returns (uint8)","function allowance(address owner,address spender) view returns (uint256)","function approve(address spender,uint256 value) returns (bool)"], current.signer);
        const dec = await erc20.decimals();
        const needed = window.ethers.parseUnits(String(amountIn), dec);
        const allowance = await erc20.allowance(current.addr, router);
        if(allowance < needed){ $('approve').disabled = false; $('swap').disabled = true; msg('Approval required for ' + symbol(tokenIn)); }
        else { $('approve').disabled = true; $('swap').disabled = false; msg('Ready to sign'); }
      }catch(e){ msg('Allowance check failed: ' + (e?.message||e)); }
    }

    $('connect').onclick = async () => {
      try{
        await waitForEthers();
        // Robust provider resolution
        let injected = null;
        if (window.detectEthereumProvider) {
          try { injected = await window.detectEthereumProvider({ mustBeMetaMask: true }); } catch {}
        }
        if (!injected) {
          injected = window.ethereum;
          const provs = injected && injected.providers ? injected.providers : (window.ethereum && window.ethereum.providers);
          if (Array.isArray(provs) && provs.length) {
            injected = provs.find(p=>p && p.isMetaMask) || provs.find(p=>p && p.isRabby) || provs[0];
          }
        }
        if (!injected || typeof injected.request !== 'function') {
          const dappUrl = location.host + location.pathname + location.search;
          window.location.href = 'https://metamask.app.link/dapp/' + dappUrl;
          msg('Opening MetaMask… If nothing happens, install/enable MetaMask.');
          return;
        }
        // Request accounts first to trigger the extension/app
        await injected.request({ method: 'eth_requestAccounts' });
        // Ensure correct chain
        try {
          await injected.request({ method:'wallet_switchEthereumChain', params:[{ chainId: '0x' + chainId.toString(16) }] });
        } catch (e) {
          if (e && e.code === 4902) {
            await injected.request({ method: 'wallet_addEthereumChain', params: [{ chainId: '0x1', chainName: 'Ethereum Mainnet', nativeCurrency: { name:'Ether', symbol:'ETH', decimals:18 }, rpcUrls:['https://1rpc.io/eth'], blockExplorerUrls:['https://etherscan.io'] }] });
          }
        }
        const provider = new window.ethers.BrowserProvider(injected);
        const signer = await provider.getSigner();
        const addr = await signer.getAddress();
        current = { provider, signer, addr };
        $('addr').textContent = short(addr);
        $('srcSym').textContent = '(' + symbol(tokenIn) + ')';
        msg('Connected');
        await checkAllowance(current);
      }catch(e){ msg('Connect error: ' + (e?.message||e)); }
    };

    $('approve').onclick = async () => {
      try{
        if(!current){ msg('Connect wallet first'); return; }
        const erc20 = new window.ethers.Contract(tokenIn, ["function decimals() view returns (uint8)","function approve(address spender,uint256 value) returns (bool)"], current.signer);
        await erc20.decimals(); // warm up
        msg('Sending approval…');
        const tx = await erc20.approve(router, window.ethers.MaxUint256);
        await tx.wait();
        msg('Approval confirmed. You can now sign the swap.');
        $('approve').disabled = true; $('swap').disabled = false;
      }catch(e){ msg('Approve error: ' + (e?.message||e)); }
    };

    $('swap').onclick = async () => {
      try{
        $('swap').disabled = true; msg('Preparing transaction…');
        const r = await fetch('/sign/buildSwap', { method:'POST', headers:{ 'content-type':'application/json' }, body: JSON.stringify({ tokenIn, tokenOut, amountIn, slippageBps, chainId, recipient: current?.addr }) });
        const j = await r.json(); if(!j?.tx){ throw new Error(j?.error || 'Build failed'); }
        if (j.ui && j.ui.amountOutHuman) { $('est').textContent = j.ui.amountOutHuman; $('estToken').textContent = symbol(tokenOut); }
        if(j?.ui?.gasUnits != null){ lastGasUnits = Number(j.ui.gasUnits); }
        try {
          const feeData = await current.provider.getFeeData();
          const gp = feeData.maxFeePerGas ?? feeData.gasPrice;
          if (gp) {
            const gwei = Number(window.ethers.formatUnits(gp, 9));
            showFeeETH(lastGasUnits, gwei);
          } else {
            showFeeETH(lastGasUnits, j?.ui?.gasPriceGwei);
          }
        } catch { showFeeETH(lastGasUnits, j?.ui?.gasPriceGwei); }
        $('srcSym').textContent = '(' + symbol(tokenIn) + ')';
        $('dstSym').textContent = '(' + symbol(tokenOut) + ')';

        const tx = Object.assign({}, j.tx, { from: current.addr });

        // If ETH is being sent (tokenIn = WETH), include value so wallet uses native ETH without prior approval
        if(isWeth(tokenIn)){
          const valueWei = window.ethers.parseUnits(String(amountIn), 18);
          tx.value = window.ethers.toQuantity(valueWei);
        }

        // Keep gas inputs unset for wallet to estimate; fee preview is in ETH above

        msg('Awaiting wallet confirmation…');
        const hash = await window.ethereum.request({ method:'eth_sendTransaction', params:[tx] });
        const link = 'https://etherscan.io/tx/' + hash;
        msg('Submitted: ' + hash + '\\n' + link + '\\nWaiting for confirmation…');

        // Optional: lightweight status feedback
        try {
          let seen = false;
          for (let i = 0; i < 10; i++) {
            const txObj = await current.provider.getTransaction(hash);
            if (txObj) { seen = true; break; }
            await new Promise(r=>setTimeout(r, 1500));
          }
          if (!seen) { msg('Submitted: ' + hash + '\\n' + link + '\\nPending broadcast…'); }
          const receipt = await current.provider.waitForTransaction(hash, 1, 120000).catch(()=>null);
          if (receipt && receipt.status === 1) {
            msg('Confirmed in block ' + receipt.blockNumber + '\\n' + link);
          } else if (receipt && receipt.status === 0) {
            msg('Transaction reverted. See: ' + link);
          } else {
            msg('Still pending… Track here: ' + link);
          }
        } catch {}
      }catch(e){ msg('Error: ' + (e?.message||e)); }
      finally{ $('swap').disabled = false; }
    };
  </script>
</body>
</html>`;
        reply
            .type('text/html; charset=utf-8')
            .header('Cache-Control', 'no-store')
            .send(html);
    });
    app.post('/sign/buildSwap', async (req, reply) => {
        try {
            const { tokenIn, tokenOut, amountIn, slippageBps, chainId } = req.body || {};
            const provider = new ethers.JsonRpcProvider(rpcUrl);
            const { txRequest, quote, minOut, gasHint } = await buildSwapExactIn(provider, {
                tokenIn: String(tokenIn),
                tokenOut: String(tokenOut),
                amountInHuman: String(amountIn),
                // FIX: bps -> fraction
                slippagePct: Number(slippageBps) / 10_000,
            });
            // some providers return bigint fields; normalize to hex strings for JSON
            const sanitizeTx = (tx) => {
                const out = {};
                for (const [k, v] of Object.entries(tx)) {
                    if (typeof v === 'bigint')
                        out[k] = ethers.toQuantity(v);
                    else
                        out[k] = v;
                }
                return out;
            };
            txRequest.chainId = Number(chainId || 1);
            const safeTx = sanitizeTx(txRequest);
            // Humanize expected outputs
            let amountOutHuman;
            let minOutHuman;
            try {
                const decOut = await getTokenDecimals(provider, String(tokenOut));
                amountOutHuman = ethers.formatUnits(quote.amountOut, decOut);
                minOutHuman = ethers.formatUnits(minOut, decOut);
            }
            catch { }
            // Prepare UI hints with JSON-safe primitives
            const gasUnitsNum = gasHint?.gasUnits != null ? Number(gasHint.gasUnits) : undefined;
            const gasPriceGweiNum = gasHint?.gasPriceGwei != null ? Number(gasHint.gasPriceGwei) : undefined;
            const feeWei = quote?.fee != null ? String(quote.fee) : undefined;
            reply.send({
                ok: true,
                tx: safeTx,
                ui: { amountOutHuman, minOutHuman, fee: feeWei, gasUnits: gasUnitsNum, gasPriceGwei: gasPriceGweiNum }
            });
        }
        catch (e) {
            reply.code(400).send({ ok: false, error: e?.message || String(e) });
        }
    });
}
