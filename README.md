# Quali.chat DeFi Bot (Matrix • Superhero server)

A Matrix bot for Quali.chat that quotes Uniswap swaps, lets users adjust slippage (1–5%), hands off signing to the wallet, and shows Cointelegraph headlines. Built with **matrix-bot-sdk**, production‑ready with **E2EE** and **room‑upgrade autojoin**.

## Features
- Natural commands + **`!` prefix** (`!swap`, `!news`, `!slippage 3`, `!accept`, `!cancel`, `!back`)
- Uniswap quote scaffold (build calldata via Universal Router in your signing page)
- Slippage presets 1–5%
- Cointelegraph headlines (last 24h)
- E2EE via `RustSdkCryptoStorageProvider`
- Autojoin invites + **AutojoinUpgradedRoomsMixin**

## Quick start
```bash
npm i -g pnpm
pnpm i
cp .env.example .env
# edit .env (MATRIX_BASE_URL=https://matrix.superhero.com, MATRIX_ACCESS_TOKEN=...)
pnpm dev
# health: http://localhost:8080/health
```

## Environment
```
MATRIX_BASE_URL=https://matrix.superhero.com
MATRIX_ACCESS_TOKEN=<bot access token>
BOT_DISPLAY_NAME=Quali DeFi Bot
BOT_STORAGE_FILE=./storage.json
BOT_ENCRYPTION_DIR=./encryption
UNISWAP_API_BASE=https://api.uniswap.org/v2
ETH_CHAIN_ID=1
RPC_URL=<Ethereum RPC endpoint>
PRIVATE_KEY=<server wallet private key>
APP_BASE_URL=<signing app URL>
PORT=8080
```
> Persist `storage.json` & `./encryption/` across restarts for encrypted rooms.

## Commands
- `!news` – latest 10 Cointelegraph headlines (last 24h)
- `!swap 0.5 ETH to USDC` or `!eth/usdt 1000`
- `!slippage 1|2|3|4|5`
- `!accept` – get signing link placeholder
- `!cancel`, `!back`

## Deploy with Docker
```bash
docker build -t quali-bot:latest .
docker run -d --name quali-bot -p 8080:8080   -v $(pwd)/storage.json:/app/storage.json   -v $(pwd)/encryption:/app/encryption   --env-file ./.env   quali-bot:latest
```

## Running on server.staging.quali.chat

1. Create a `.env` on the server with all variables above, including `PRIVATE_KEY` and `RPC_URL`.
2. Build and run with Docker or `pnpm build && node dist/src/index.js`.
3. Expose port 8080 behind your reverse proxy. Health: `/health`.
4. Persist `storage.json` and `encryption/` on disk.

Security notes:
- The bot will execute swaps using the server wallet. Fund it with ETH for gas and inputs. Use a low-risk key.
- Limit supported tokens in `src/tokens.ts` and review `src/swap.ts` approval logic.

## Notes
- `src/uniswap.ts` gets quotes from Uniswap v3 quoter. `src/swap.ts` performs approvals, optional WETH deposit, and submits the swap through Uniswap v3 router.
- Use `AutojoinRoomsMixin` and `AutojoinUpgradedRoomsMixin` to keep the bot present across room upgrades.

