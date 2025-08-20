import type { QuoteResponse } from "./uniswap.js";

export type Session = {
  slippagePct: number;
  lastQuote?: QuoteResponse;
  pendingSwap?: boolean;
  decryptionWarned?: boolean;
  lastQuoteEventId?: string;
  onboardInvited?: boolean;
  onboardRoomId?: string;
};

const SESS = new Map<string, Session>();

export function getSession(roomId: string): Session {
  return SESS.get(roomId) ?? { slippagePct: 1 };
}
export function setSession(roomId: string, s: Session) {
  SESS.set(roomId, s);
}
export function resetSession(roomId: string) {
  SESS.delete(roomId);
}

// Ephemeral action tickets for tappable links
type ActionTicket = {
  roomId: string;
  text: string;
  expiresAt: number;
};

const ACTION_TICKETS = new Map<string, ActionTicket>();

function randomId(len: number = 24): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

export function createActionTicket(roomId: string, text: string, ttlMs: number = 10 * 60 * 1000): string {
  const id = randomId();
  ACTION_TICKETS.set(id, { roomId, text, expiresAt: Date.now() + ttlMs });
  return id;
}

export function consumeActionTicket(id: string | undefined | null): { roomId: string; text: string } | null {
  if (!id) return null;
  const t = ACTION_TICKETS.get(id);
  if (!t) return null;
  ACTION_TICKETS.delete(id);
  if (Date.now() > t.expiresAt) return null;
  return { roomId: t.roomId, text: t.text };
}
