import { MatrixClient } from "matrix-bot-sdk";
import dotenv from "dotenv";
dotenv.config();
const BASE_URL = process.env.MATRIX_BASE_URL;
const ACCESS_TOKEN = process.env.MATRIX_ACCESS_TOKEN;
async function main() {
    const userId = process.argv[2];
    if (!userId) {
        console.error("Usage: node dist/src/admin.js <userId>");
        process.exit(1);
    }
    if (!BASE_URL || !ACCESS_TOKEN) {
        console.error("Missing MATRIX_BASE_URL or MATRIX_ACCESS_TOKEN in env");
        process.exit(1);
    }
    const client = new MatrixClient(BASE_URL, ACCESS_TOKEN);
    // Create a new direct chat and invite the user
    const roomId = await client.createRoom({
        invite: [userId],
        is_direct: true,
        preset: "private_chat",
        // Do not include encryption state here to avoid forcing E2EE
    });
    try {
        await client.sendText(roomId, "Hi! This is Quali DeFi Bot. Send !menu to get started.");
    }
    catch { }
    console.log("Created DM room:", roomId);
}
main().catch((e) => { console.error(e); process.exit(1); });
