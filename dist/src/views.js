import dayjs from "dayjs";
export function renderMenu(interactiveHtml) {
    const defaultHtml = `
  <ul>
    <li><b>SWAP 0.1 ETH to USDC</b> | <b>NEWS</b></li>
    <li>On a quote: <code>!slippage 1|2|3|4|5</code></li>
    <li>Confirm or exit: <code>!accept</code>, <code>!cancel</code>, <code>!back</code></li>
  </ul>`;
    return `
  <p><b>Hey!</b> What do you need today?</p>
  ${interactiveHtml || defaultHtml}
  `;
}
export function renderQuoteCard(q, slippagePct, actionsHtml) {
    const rate = q.ui.executionPrice;
    const receive = q.ui.amountOutHuman;
    const fee = q.ui.feeSummary;
    const actionsText = actionsHtml || `<b>ACCEPT</b> | SLIPPAGE % 1 2 3 4 5 | CANCEL | BACK`;
    return `
  <div>
    <p><b>Quote</b></p>
    <p>${q.ui.tokenIn.symbol} → ${q.ui.tokenOut.symbol}</p>
    <p>Rate: ${rate}</p>
    <p>Est. receive: <b>${receive} ${q.ui.tokenOut.symbol}</b></p>
    <p>Fees/Gas (est): ${fee}</p>
    <p>Slippage: <b>${slippagePct}%</b></p>
    <p><b>Actions:</b> ${actionsText}</p>
  </div>
  `;
}
export function renderNewsList(items, actionsHtml, title) {
    const top = items
        .slice(0, 10)
        .map((it, i) => {
        const d = dayjs(it.pubDate);
        const when = d.isValid() ? d.format("D MMM YYYY HH:mm") : it.pubDate;
        return `${i + 1}. ${it.icon} <a href="${it.link}"><b>${escapeHtml(it.title)}</b></a> <i>(${when})</i>`;
    })
        .join("<br/>");
    return `
  <div>
    <p><b>${escapeHtml(title || 'Top headlines')}</b></p>
    <p>${top}</p>
    <p>${actionsHtml || 'Type <code>!back</code> to return to menu.'}</p>
  </div>
  `;
}
export function renderNewsTimeframeMenu(actionBase, roomId, createTicket) {
    const t1 = createTicket(roomId, "!news 1h");
    const t24 = createTicket(roomId, "!news 24h");
    const t7 = createTicket(roomId, "!news 7d");
    const t1m = createTicket(roomId, "!news 1m");
    return `
  <div>
    <p><b>Select timeframe:</b>
      <a href="${actionBase}/act?id=${t1}"><b>1H</b></a> |
      <a href="${actionBase}/act?id=${t24}"><b>24H</b></a> |
      <a href="${actionBase}/act?id=${t7}"><b>7D</b></a> |
      <a href="${actionBase}/act?id=${t1m}"><b>1M</b></a>
    </p>
  </div>`;
}
function escapeHtml(s) { return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c])); }
