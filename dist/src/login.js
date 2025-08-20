import { MatrixAuth, MatrixClient, SimpleFsStorageProvider } from "matrix-bot-sdk";
import dotenv from "dotenv";
dotenv.config();
const HOMESERVER = process.env.MATRIX_BASE_URL;
const USERNAME = process.env.MATRIX_USER;
const PASSWORD = process.env.MATRIX_PASSWORD;
if (!HOMESERVER || !USERNAME || !PASSWORD) {
    console.error("Set MATRIX_BASE_URL, MATRIX_USER, MATRIX_PASSWORD in .env");
    process.exit(1);
}
(async () => {
    const storage = new SimpleFsStorageProvider("./storage.json");
    const auth = new MatrixAuth(HOMESERVER);
    const tempClient = await auth.passwordLogin(USERNAME, PASSWORD, "Quali DeFi Bot");
    const token = tempClient.accessToken;
    console.log("ACCESS_TOKEN=" + token);
    const client = new MatrixClient(HOMESERVER, token, storage);
    console.log("Login successful for:", await client.getUserId());
    process.exit(0);
})();
