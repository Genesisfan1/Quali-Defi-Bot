import { 
  MatrixClient, 
  SimpleFsStorageProvider, 
  AutojoinRoomsMixin, 
  AutojoinUpgradedRoomsMixin, 
  RichReply,
  RustSdkCryptoStorageProvider,
  MatrixAuth
} from "matrix-bot-sdk";
import Fastify from "fastify";
import { registerSigningRoutes } from "./signing.js";
import { renderMenu, renderQuoteCard, renderNewsList } from "./views.js";
import { parseUserMessage, Intent } from "./nlu.js";
import { getQuote, QuoteRequest } from "./uniswap.js";
import { resolveTokenPair } from "./tokens.js";
import { getLatestNews } from "./news.js";
import { getSession, setSession, resetSession, createActionTicket, consumeActionTicket } from "./state.js";
import { performSwap } from "./swap.js";
import dotenv from "dotenv";
import { ethers } from "ethers";

dotenv.config();
const BASE_URL = process.env.MATRIX_BASE_URL!;
const ACCESS_TOKEN = process.env.MATRIX_ACCESS_TOKEN || "";
const MATRIX_USER = process.env.MATRIX_USER || "";
const MATRIX_PASSWORD = process.env.MATRIX_PASSWORD || "";
const DISPLAY_NAME = process.env.BOT_DISPLAY_NAME || "Quali DeFi Bot";
const DEVICE_NAME = process.env.MATRIX_DEVICE_NAME || "Quali DeFi Bot";
const AVATAR_URL = process.env.BOT_AVATAR_URL || "";
const STORAGE_FILE = process.env.BOT_STORAGE_FILE || "./storage.json";
const ENCRYPTION_DIR = process.env.BOT_ENCRYPTION_DIR || "./encryption";
const PORT = Number(process.env.PORT || 8080);
const RPC_URL = process.env.RPC_URL || "https://1rpc.io/eth";
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const ADMIN_API_TOKEN = process.env.ADMIN_API_TOKEN || "";
const APP_BASE_URL = process.env.APP_BASE_URL || "";
const USER_SIGNING_MODE = process.env.USER_SIGNING_MODE === "1"; // force client-side signing even if PRIVATE_KEY is present
const DEBUG_LOGS = process.env.DEBUG_LOGS === "1";

if (!BASE_URL) {
  console.error("Missing MATRIX_BASE_URL in env");
  process.exit(1);
}

// Persistent storage + E2EE crypto store
const storage = new SimpleFsStorageProvider(STORAGE_FILE);
const crypto = new RustSdkCryptoStorageProvider(ENCRYPTION_DIR);
// Ethereum provider & wallet (for on-chain execution)
const provider = new ethers.JsonRpcProvider(RPC_URL);
const signer = PRIVATE_KEY ? new ethers.Wallet(PRIVATE_KEY, provider) : null;
console.log("Wallet:", signer ? signer.address : "not configured");


let client: MatrixClient;

function buildInteractiveMenu(roomId: string, actionBase: string): string {
  const tSwapQuick = createActionTicket(roomId, "SWAP 0.1 ETH to USDC");
  const tNews = createActionTicket(roomId, "NEWS");
  const tAcc = createActionTicket(roomId, "!accept");
  const tCan = createActionTicket(roomId, "!cancel");
  const tBack = createActionTicket(roomId, "!back");
  const tS1 = createActionTicket(roomId, "!slippage 1");
  const tS2 = createActionTicket(roomId, "!slippage 2");
  const tS3 = createActionTicket(roomId, "!slippage 3");
  const tS4 = createActionTicket(roomId, "!slippage 4");
  const tS5 = createActionTicket(roomId, "!slippage 5");
  return `
        <div>
          <p>
            <a href="${actionBase}/act?id=${tSwapQuick}"><b>SWAP 0.1 ETH to USDC</b></a>
            | <a href="${actionBase}/act?id=${tNews}"><b>NEWS</b></a>
          </p>
          <p>
            <b>SLIPPAGE %</b>
            <a href="${actionBase}/act?id=${tS1}">1</a>
            <a href="${actionBase}/act?id=${tS2}">2</a>
            <a href="${actionBase}/act?id=${tS3}">3</a>
            <a href="${actionBase}/act?id=${tS4}">4</a>
            <a href="${actionBase}/act?id=${tS5}">5</a>
            | <a href="${actionBase}/act?id=${tAcc}"><b>ACCEPT</b></a>
            | <a href="${actionBase}/act?id=${tCan}">CANCEL</a>
            | <a href="${actionBase}/act?id=${tBack}">BACK</a>
          </p>
        </div>`;
}

async function ensureProfile() {
  try {
    await client.setDisplayName(DISPLAY_NAME);
    if (AVATAR_URL) await client.setAvatarUrl(AVATAR_URL);
  } catch (e) {
    console.warn("Profile setup warning:", e);
  }
}
async function createUnencryptedRoomAndInvite(userId: string): Promise<string> {
  const roomId = await client.createRoom({
    // Create a PUBLIC chat so clients do not auto-enable encryption
    visibility: "public",
    preset: "public_chat",
    invite: [userId],
    isDirect: false,
    name: "Quali DeFi Bot Public Support",
    topic: "Public unencrypted support room for onboarding",
    initial_state: [
      { type: "m.room.history_visibility", state_key: "", content: { history_visibility: "world_readable" } },
      { type: "m.room.join_rules", state_key: "", content: { join_rule: "public" } }
    ],
  } as any);
  await client.sendText(roomId, "Hello! This room is unencrypted so I can assist. Type `!menu` or `!news`.");
  return roomId;
}
async function handleAdminCommand(roomId: string, body: string) {
  const session = getSession(roomId);
  const parsed = parseUserMessage(body, session);
  switch (parsed.intent) {
    case Intent.START:
    case Intent.MENU: {
      const actionBase = APP_BASE_URL || `http://localhost:${PORT}`;
      const interactive = buildInteractiveMenu(roomId, actionBase);
      const html = renderMenu(interactive);
      await client.sendHtmlText(roomId, html);
      return;
    }
    case Intent.NEWS: {
      const list = await getLatestNews();
      const actionBase = APP_BASE_URL || `http://localhost:${PORT}`;
      const back = createActionTicket(roomId, "!back");
      const actions = `<a href="${actionBase}/act?id=${back}"><b>BACK</b></a>`;
      const html = renderNewsList(list, actions);
      await client.sendHtmlText(roomId, html);
      return;
    }
    case Intent.SWAP: {
      const { base, quote, amount, slippage } = parsed;
      if (!base || !quote || !amount) { await client.sendText(roomId, "Usage: !swap <amount> <BASE> to <QUOTE>"); return; }
      const pair = await resolveTokenPair(base!, quote!);
      if (!pair) { await client.sendText(roomId, "Unsupported pair"); return; }
      const req: QuoteRequest = {
        chainId: Number(process.env.ETH_CHAIN_ID || 1),
        tokenIn: pair.in.address,
        tokenOut: pair.out.address,
        amountInHuman: String(amount),
        slippageBps: Math.round((slippage ?? 1) * 100),
      };
      const quoteRes = await getQuote(req);
      if (!quoteRes) { await client.sendText(roomId, "No route available"); return; }
      setSession(roomId, { ...session, lastQuote: quoteRes, slippagePct: (slippage ?? 1) });
      const actionBase = APP_BASE_URL || `http://localhost:${PORT}`;
      const actAccept = createActionTicket(roomId, "!accept");
      const actSlip1 = createActionTicket(roomId, "!slippage 1");
      const actSlip2 = createActionTicket(roomId, "!slippage 2");
      const actSlip3 = createActionTicket(roomId, "!slippage 3");
      const actSlip4 = createActionTicket(roomId, "!slippage 4");
      const actSlip5 = createActionTicket(roomId, "!slippage 5");
      const actCancel = createActionTicket(roomId, "!cancel");
      const actBack = createActionTicket(roomId, "!back");
      const actions = `
        <a href="${actionBase}/act?id=${actAccept}"><b>ACCEPT</b></a>
        | SLIPPAGE %
        <a href="${actionBase}/act?id=${actSlip1}">1</a>
        <a href="${actionBase}/act?id=${actSlip2}">2</a>
        <a href="${actionBase}/act?id=${actSlip3}">3</a>
        <a href="${actionBase}/act?id=${actSlip4}">4</a>
        <a href="${actionBase}/act?id=${actSlip5}">5</a>
        | <a href="${actionBase}/act?id=${actCancel}">CANCEL</a>
        | <a href="${actionBase}/act?id=${actBack}">BACK</a>`;
      const html = renderQuoteCard(quoteRes, (slippage ?? 1), actions);
      await client.sendHtmlText(roomId, html);
      return;
    }
    case Intent.ADJUST_SLIPPAGE: {
      const newSlip = parsed.slippage ?? 1;
      const sess = getSession(roomId);
      if (!sess.lastQuote) { await client.sendText(roomId, "No active quote"); return; }
      const q = await getQuote({ ...sess.lastQuote.request, slippageBps: Math.round(newSlip * 100) });
      if (!q) { await client.sendText(roomId, "Could not refresh quote"); return; }
      setSession(roomId, { ...sess, lastQuote: q, slippagePct: newSlip });
      const actionBase2 = APP_BASE_URL || `http://localhost:${PORT}`;
      const actAccept = createActionTicket(roomId, "!accept");
      const actCancel = createActionTicket(roomId, "!cancel");
      const actBack = createActionTicket(roomId, "!back");
      const actions = `
        <a href="${actionBase2}/act?id=${actAccept}"><b>ACCEPT</b></a>
        | SLIPPAGE %
        <a href="${actionBase2}/act?id=${createActionTicket(roomId, '!slippage 1')}">1</a>
        <a href="${actionBase2}/act?id=${createActionTicket(roomId, '!slippage 2')}">2</a>
        <a href="${actionBase2}/act?id=${createActionTicket(roomId, '!slippage 3')}">3</a>
        <a href="${actionBase2}/act?id=${createActionTicket(roomId, '!slippage 4')}">4</a>
        <a href="${actionBase2}/act?id=${createActionTicket(roomId, '!slippage 5')}">5</a>
        | <a href="${actionBase2}/act?id=${actCancel}">CANCEL</a>
        | <a href="${actionBase2}/act?id=${actBack}">BACK</a>`;
      const html = renderQuoteCard(q, newSlip, actions);
      const evId = await client.sendHtmlText(roomId, html);
      await seedActionReactions(client, roomId, evId);
      return;
    }
    case Intent.ACCEPT: {
      const sess = getSession(roomId);
      if (!sess.lastQuote) { await client.sendText(roomId, "No quote to accept"); return; }
      if (!APP_BASE_URL) { await client.sendText(roomId, "Signing app URL not configured (APP_BASE_URL). Ask admin to set it."); return; }
      const q = sess.lastQuote;
      const u = new URL(APP_BASE_URL);
      u.pathname = "/sign/swap";
      u.searchParams.set("chainId", String(q.request.chainId));
      u.searchParams.set("tokenIn", q.request.tokenIn);
      u.searchParams.set("tokenOut", q.request.tokenOut);
      u.searchParams.set("amountIn", q.request.amountInHuman);
      u.searchParams.set("slippageBps", String(q.request.slippageBps));
      const html = `Tap <a href="${u.toString()}"><b>SIGN</b></a> to open your wallet and confirm.`;
      await client.sendHtmlText(roomId, html);
      return;
    }
    case Intent.CANCEL:
    case Intent.BACK: {
      resetSession(roomId);
      const actionBase = APP_BASE_URL || `http://localhost:${PORT}`;
      const interactive = buildInteractiveMenu(roomId, actionBase);
      await client.sendHtmlText(roomId, renderMenu(interactive));
      return;
    }
    default:
      await client.sendText(roomId, "Type: '!swap 0.5 ETH to USDC' or '!news'");
  }
}
export async function onRoomEvent(c: MatrixClient, roomId: string, event: any) {
  try {
    const type = event["type"];
    const sender = event["sender"];
    const evId = event["event_id"];
    if (DEBUG_LOGS) console.log(`[evt] room=${roomId} type=${type} from=${sender} id=${evId}`);
    if (type === "m.room.encrypted") {
      const session = getSession(roomId);
      if (!session["decryptionWarned"]) {
        try {
          await c.sendText(
            roomId,
            "I received an encrypted message but could not decrypt it. Please ensure your room shares keys with unverified devices or invite me to a non-encrypted room."
          );
        } catch {}
        setSession(roomId, { ...session, decryptionWarned: true });
      }
    }
  } catch {}
}

export async function onRoomMessage(c: MatrixClient, roomId: string, event: any) {
  try {
    if (DEBUG_LOGS) {
      console.log(`[msg] room=${roomId} sender=${event["sender"]} content=${JSON.stringify(event["content"] || {})}`);
    }
    if (!event["content"] || event["content"]["msgtype"] !== "m.text") return;
    const body: string = event["content"]["body"] || "";
    const sender: string = event["sender"];
    if (sender === await c.getUserId()) return;

    // Fallback: if user sends an emoji as a text message, interpret it as a command
    const emojiKey = body.trim();
    const emojiToCmd: Record<string, string> = {
      "✅": "!accept",
      "🚫": "!cancel",
      "🔙": "!back",
      "1️⃣": "!slippage 1",
      "2️⃣": "!slippage 2",
      "3️⃣": "!slippage 3",
      "4️⃣": "!slippage 4",
      "5️⃣": "!slippage 5",
    };
    const mapped = emojiToCmd[emojiKey];
    if (mapped) {
      await handleAdminCommand(roomId, mapped);
      return;
    }

    const session = getSession(roomId);
    const parsed = parseUserMessage(body, session);

    switch (parsed.intent) {
      case Intent.START:
      case Intent.MENU: {
        const actionBase = APP_BASE_URL || `http://localhost:${PORT}`;
        const html = renderMenu(buildInteractiveMenu(roomId, actionBase));
        await c.sendHtmlText(roomId, html);
        break;
      }
      case Intent.NEWS: {
        const list = await getLatestNews();
        const actionBase = APP_BASE_URL || `http://localhost:${PORT}`;
        const back = createActionTicket(roomId, "!back");
        const actions = `<a href="${actionBase}/act?id=${back}"><b>BACK</b></a>`;
        const html = renderNewsList(list, actions);
        await c.sendHtmlText(roomId, html);
        break;
      }
      case Intent.SWAP: {
        const { base, quote, amount, slippage } = parsed;
        if (!base || !quote || !amount) {
          await c.sendText(roomId, "Tell me what to swap, e.g. `!swap 0.5 ETH to USDC` or `!eth/usdt 1000`");
          break;
        }
        const pair = await resolveTokenPair(base, quote);
        if (!pair) {
          await c.sendText(roomId, "I couldn't resolve that token pair on Ethereum. Try symbols like ETH/USDC/USDT.");
          break;
        }
        const req: QuoteRequest = {
          chainId: Number(process.env.ETH_CHAIN_ID || 1),
          tokenIn: pair.in.address,
          tokenOut: pair.out.address,
          amountInHuman: String(amount),
          slippageBps: Math.round((slippage ?? 1) * 100),
        };
        const quoteRes = await getQuote(req);
        if (!quoteRes) {
          await c.sendText(roomId, "No route or quote available right now. Try a different amount or pair.");
          break;
        }
        setSession(roomId, { ...session, lastQuote: quoteRes, slippagePct: (slippage ?? 1) });
        const actionBase3 = APP_BASE_URL || `http://localhost:${PORT}`;
        const actAccept = createActionTicket(roomId, "!accept");
        const actSlip1 = createActionTicket(roomId, "!slippage 1");
        const actSlip2 = createActionTicket(roomId, "!slippage 2");
        const actSlip3 = createActionTicket(roomId, "!slippage 3");
        const actSlip4 = createActionTicket(roomId, "!slippage 4");
        const actSlip5 = createActionTicket(roomId, "!slippage 5");
        const actCancel = createActionTicket(roomId, "!cancel");
        const actBack = createActionTicket(roomId, "!back");
        const actions = `
          <a href="${actionBase3}/act?id=${actAccept}"><b>ACCEPT</b></a>
          | SLIPPAGE %
          <a href="${actionBase3}/act?id=${actSlip1}">1</a>
          <a href="${actionBase3}/act?id=${actSlip2}">2</a>
          <a href="${actionBase3}/act?id=${actSlip3}">3</a>
          <a href="${actionBase3}/act?id=${actSlip4}">4</a>
          <a href="${actionBase3}/act?id=${actSlip5}">5</a>
          | <a href="${actionBase3}/act?id=${actCancel}">CANCEL</a>
          | <a href="${actionBase3}/act?id=${actBack}">BACK</a>`;
        const html = renderQuoteCard(quoteRes, (slippage ?? 1), actions);
        await c.sendHtmlText(roomId, html);
        break;
      }
      case Intent.ADJUST_SLIPPAGE: {
        const newSlip = parsed.slippage ?? 1;
        const sess = getSession(roomId);
        if (!sess.lastQuote) {
          await c.sendText(roomId, "No active quote yet. Say `!swap 0.5 ETH to USDC` first.");
          break;
        }
        const q = await getQuote({
          ...sess.lastQuote.request,
          slippageBps: Math.round(newSlip * 100)
        });
        if (!q) { await c.sendText(roomId, "Couldn't refresh quote with that slippage."); break; }
        setSession(roomId, { ...sess, lastQuote: q, slippagePct: newSlip });
        const html = renderQuoteCard(q, newSlip);
        await c.sendHtmlText(roomId, html);
        break;
      }
      case Intent.ACCEPT: {
        const sess = getSession(roomId);
        if (!sess.lastQuote) { await c.sendText(roomId, "No quote to accept. Try a swap first."); break; }
        if (USER_SIGNING_MODE || !signer) {
          if (!APP_BASE_URL) { await c.sendText(roomId, "Signing app URL not configured (APP_BASE_URL)."); break; }
          const q = sess.lastQuote;
          const u = new URL(APP_BASE_URL);
          u.pathname = "/sign/swap";
          u.searchParams.set("chainId", String(q.request.chainId));
          u.searchParams.set("tokenIn", q.request.tokenIn);
          u.searchParams.set("tokenOut", q.request.tokenOut);
          u.searchParams.set("amountIn", q.request.amountInHuman);
          u.searchParams.set("slippageBps", String(q.request.slippageBps));
          const html = `Tap <a href="${u.toString()}"><b>SIGN</b></a> to open your wallet and confirm.`;
          await c.sendHtmlText(roomId, html);
          break;
        }
        try {
          await c.sendText(roomId, `Submitting on-chain swap from ${signer.address}…`);
          const res = await performSwap(provider, signer, sess.lastQuote, sess.slippagePct || 1);
          await c.sendHtmlText(roomId, `✅ Swap submitted. Tx: <a href="https://etherscan.io/tx/${res.hash}">${res.hash}</a>`);
        } catch (e: any) {
          await c.sendText(roomId, `Swap failed: ${e?.message || e}`);
        }
        break;
      }
      case Intent.CANCEL: {
        resetSession(roomId);
        const actionBase = APP_BASE_URL || `http://localhost:${PORT}`;
        await c.sendHtmlText(roomId, renderMenu(buildInteractiveMenu(roomId, actionBase)));
        break;
      }
      case Intent.BACK: {
        const actionBase = APP_BASE_URL || `http://localhost:${PORT}`;
        await c.sendHtmlText(roomId, renderMenu(buildInteractiveMenu(roomId, actionBase)));
        break;
      }
      default: {
        const actionBase = APP_BASE_URL || `http://localhost:${PORT}`;
        const tSwap1 = createActionTicket(roomId, "SWAP 0.5 ETH to USDC");
        const tSwap2 = createActionTicket(roomId, "ETH/USDT 1000");
        const tNews = createActionTicket(roomId, "NEWS");
        const html = `Try:
          <p>
            <a href="${actionBase}/act?id=${tSwap1}"><b>SWAP 0.5 ETH to USDC</b></a>
            | <a href="${actionBase}/act?id=${tSwap2}"><b>ETH/USDT 1000</b></a>
            | <a href="${actionBase}/act?id=${tNews}"><b>NEWS</b></a>
          </p>`;
        await c.sendHtmlText(roomId, html);
      }
    }
  } catch (err) {
    console.error(err);
  }
}

function registerHandlers() {
  // Autojoin new invites and upgraded rooms
  AutojoinRoomsMixin.setupOnClient(client);
  AutojoinUpgradedRoomsMixin.setupOnClient(client);

  client.on("room.event", async (roomId, event) => onRoomEvent(client, roomId, event));

  client.on("room.message", async (roomId, event) => onRoomMessage(client, roomId, event));

  // Reaction handler to turn emoji taps into commands (no links, no windows)
  client.on("room.event", async (roomId, event) => {
    try {
      if (event?.type !== "m.reaction") return;
      const botUserId = await client.getUserId();
      if (event?.sender === botUserId) return; // ignore our own seeded reactions
      const relates = event?.content?.["m.relates_to"]; // { rel_type: "m.annotation", event_id, key }
      const key: string | undefined = relates?.key;
      if (!key || !relates?.event_id) return;
      const sess = getSession(roomId);
      // Only react to recent quote cards we produced (if any session exists)
      // Map emojis to commands
      const emojiToCmd: Record<string, string> = {
        "✅": "!accept",
        "🚫": "!cancel",
        "🔙": "!back",
        "1️⃣": "!slippage 1",
        "2️⃣": "!slippage 2",
        "3️⃣": "!slippage 3",
        "4️⃣": "!slippage 4",
        "5️⃣": "!slippage 5",
      };
      const cmd = emojiToCmd[key];
      if (!cmd) return;
      await handleAdminCommand(roomId, cmd);
    } catch {}
  });
}

async function seedActionReactions(c: MatrixClient, roomId: string, eventId: string): Promise<void> {
  // Replaced emoji reactions with clickable command links in the quote card.
  return;
}

// Minimal webhook server for future signing callbacks
const app = Fastify();
app.get("/health", async () => ({ ok: true, wallet: signer ? signer.address : null }));
app.post("/admin/command", async (req: any, reply) => {
  try {
    if (!ADMIN_API_TOKEN) return reply.code(403).send({ ok: false, error: "admin disabled" });
    const token = req.headers["x-admin-token"] as string | undefined;
    if (!token || token !== ADMIN_API_TOKEN) return reply.code(401).send({ ok: false, error: "unauthorized" });
    const { roomId, text } = req.body || {};
    if (!roomId || !text) return reply.code(400).send({ ok: false, error: "roomId and text required" });
    await handleAdminCommand(roomId, String(text));
    return reply.send({ ok: true });
  } catch (e: any) {
    return reply.code(500).send({ ok: false, error: e?.message || String(e) });
  }
});
// Action endpoint: consume ticket and dispatch text to room as if user typed it
app.get("/act", async (req: any, reply) => {
  try {
    const id = String((req.query || {}).id || "");
    const ticket = consumeActionTicket(id);
    if (!ticket) {
      reply.type('text/html').send("<script>setTimeout(function(){ try{ window.close(); }catch(e){} }, 100);</script>Link expired.");
      return;
    }
    // Try to post a visible echo of the command so users see what was triggered
    try { await client.sendText(ticket.roomId, ticket.text); } catch {}
    await handleAdminCommand(ticket.roomId, ticket.text);
      reply.type('text/html').send("<script>setTimeout(function(){ try{ window.close(); }catch(e){} }, 100);</script>OK");
    return;
  } catch (e: any) {
    return reply.type('text/html').send(`<p>Error: ${e?.message || e}</p>`);
  }
});
app.post("/webhook/signed", async (req, reply) => {
  // TODO: verify signature, notify room
  return reply.send({ ok: true });
});
app.post("/admin/onboard", async (req: any, reply) => {
  try {
    if (!ADMIN_API_TOKEN) return reply.code(403).send({ ok: false, error: "admin disabled" });
    const token = req.headers["x-admin-token"] as string | undefined;
    if (!token || token !== ADMIN_API_TOKEN) return reply.code(401).send({ ok: false, error: "unauthorized" });
    const { userId } = req.body || {};
    if (!userId) return reply.code(400).send({ ok: false, error: "userId required" });
    const roomId = await createUnencryptedRoomAndInvite(String(userId));
    return reply.send({ ok: true, roomId });
  } catch (e: any) {
    return reply.code(500).send({ ok: false, error: e?.message || String(e) });
  }
});

(async () => {
  // Prefer explicit access token (keeps existing device + encryption store). Fallback to password login.
  if (ACCESS_TOKEN) {
    client = new MatrixClient(BASE_URL, ACCESS_TOKEN, storage, crypto);
  } else if (MATRIX_USER && MATRIX_PASSWORD) {
    try {
      const auth = new MatrixAuth(BASE_URL);
      const tempClient = await auth.passwordLogin(MATRIX_USER, MATRIX_PASSWORD, DEVICE_NAME);
      client = new MatrixClient(BASE_URL, tempClient.accessToken, storage, crypto);
      console.log("Obtained access token via password login.");
    } catch (e) {
      console.error("Password login failed:", (e as any)?.message || e);
      process.exit(1);
    }
  } else {
    console.error("Missing MATRIX_ACCESS_TOKEN or MATRIX_USER/MATRIX_PASSWORD.");
    process.exit(1);
  }

  registerHandlers();
  await ensureProfile();
  try {
    const who = await client.getWhoAmI();
    console.log("WhoAmI:", JSON.stringify(who));
  } catch (e) {
    console.warn("whoami failed", (e as any)?.message || e);
  }
  try {
    const rooms = await client.getJoinedRooms();
    console.log("Joined rooms count:", rooms.length);
  } catch (e) {
    console.warn("getJoinedRooms failed", (e as any)?.message || e);
  }
  client.on("sync", (state: any) => {
    if (DEBUG_LOGS) console.log("sync state:", state);
  });
  async function startWithRetry(maxAttempts: number = 10): Promise<void> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await client.start();
        return;
      } catch (e: any) {
        const msg = (e?.message || String(e));
        console.error(`Matrix client start failed (attempt ${attempt}/${maxAttempts}):`, msg);
        const backoffMs = Math.min(30000, attempt * 3000);
        await new Promise((r) => setTimeout(r, backoffMs));
      }
    }
    console.error("Matrix client failed to start after retries. Exiting.");
    process.exit(1);
  }
  await startWithRetry();
  try {
    await client.setPresenceStatus("online");
  } catch {}
  console.log("Bot online.");
  registerSigningRoutes(app, RPC_URL);
  await app.listen({ host: "0.0.0.0", port: PORT });
})();
