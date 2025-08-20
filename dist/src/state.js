const SESS = new Map();
export function getSession(roomId) {
    return SESS.get(roomId) ?? { slippagePct: 1 };
}
export function setSession(roomId, s) {
    SESS.set(roomId, s);
}
export function resetSession(roomId) {
    SESS.delete(roomId);
}
const ACTION_TICKETS = new Map();
function randomId(len = 24) {
    const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
    let out = "";
    for (let i = 0; i < len; i++)
        out += alphabet[Math.floor(Math.random() * alphabet.length)];
    return out;
}
export function createActionTicket(roomId, text, ttlMs = 10 * 60 * 1000) {
    const id = randomId();
    ACTION_TICKETS.set(id, { roomId, text, expiresAt: Date.now() + ttlMs });
    return id;
}
export function consumeActionTicket(id) {
    if (!id)
        return null;
    const t = ACTION_TICKETS.get(id);
    if (!t)
        return null;
    ACTION_TICKETS.delete(id);
    if (Date.now() > t.expiresAt)
        return null;
    return { roomId: t.roomId, text: t.text };
}
