export enum Intent {
  START = "START",
  MENU = "MENU",
  SWAP = "SWAP",
  NEWS = "NEWS",
  ADJUST_SLIPPAGE = "ADJUST_SLIPPAGE",
  ACCEPT = "ACCEPT",
  CONFIRM = "CONFIRM",
  CANCEL = "CANCEL",
  BACK = "BACK",
}

export type Parsed = {
  intent: Intent;
  base?: string;
  quote?: string;
  amount?: number;
  slippage?: number;
};

const START_WORDS = ["hi", "hello", "start", "menu"];
const PREFIX = "!";

function stripPrefix(text: string): string {
  const t = text.trim();
  if (t.startsWith(PREFIX)) return t.slice(PREFIX.length).trim();
  return t;
}

export function parseUserMessage(text: string, _session?: any): Parsed {
  const raw = text.trim();
  if (!raw) return { intent: Intent.MENU };

  const t = stripPrefix(raw).toLowerCase();

  if (START_WORDS.includes(t)) return { intent: Intent.MENU };
  if (t === "swap") return { intent: Intent.SWAP };
  if (t === "news") return { intent: Intent.NEWS };
  if (t === "accept") return { intent: Intent.ACCEPT };
  if (t === "confirm") return { intent: Intent.CONFIRM };
  if (t === "cancel") return { intent: Intent.CANCEL };
  if (t === "back") return { intent: Intent.BACK };

  // slippage 1..5
  const slip = t.match(/^slippage\s+([1-5])$/);
  if (slip) return { intent: Intent.ADJUST_SLIPPAGE, slippage: Number(slip[1]) };

  // swap patterns
  const m1 = t.match(/^swap\s+([0-9]*\.?[0-9]+)\s+([a-z0-9\-\.]+)\s+to\s+([a-z0-9\-\.]+)$/);
  if (m1) return { intent: Intent.SWAP, amount: Number(m1[1]), base: m1[2].toUpperCase(), quote: m1[3].toUpperCase() };

  const m2 = t.match(/^([a-z0-9\-\.]+)\/(\w+)\s+([0-9]*\.?[0-9]+)$/);
  if (m2) return { intent: Intent.SWAP, base: m2[1].toUpperCase(), quote: m2[2].toUpperCase(), amount: Number(m2[3]) };

  const m3 = t.match(/^(\w+)\s+to\s+(\w+)\s+([0-9]*\.?[0-9]+)$/);
  if (m3) return { intent: Intent.SWAP, base: m3[1].toUpperCase(), quote: m3[2].toUpperCase(), amount: Number(m3[3]) };

  return { intent: Intent.MENU };
}
