/**
 * Reply keywords that stop or restart messages, for SMS (Twilio webhook) and WhatsApp. One list for every
 * channel and every sender, so the three places that read a reply cannot disagree. English and French
 * (Canada), compared after upper-casing, removing accents, punctuation and extra spaces. The whole message
 * has to be the keyword ("STOP." and "stop" count, "please stop texting me about this" does not: carriers
 * and Meta treat only the bare keyword as the command, and the shop can still read the longer message).
 */
export const STOP_KEYWORDS = ["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "ARRET", "REVOKE", "OPTOUT", "OPT OUT", "DESABONNER", "ANNULER"] as const;
export const START_KEYWORDS = ["START", "UNSTOP", "YES", "SUBSCRIBE", "OUI", "COMMENCER"] as const;

export function normalizeReplyWord(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z\s-]/g, "")
    .replace(/-/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export const isStopKeyword = (text: string): boolean => (STOP_KEYWORDS as readonly string[]).includes(normalizeReplyWord(text));
export const isStartKeyword = (text: string): boolean => (START_KEYWORDS as readonly string[]).includes(normalizeReplyWord(text));

/** The line that goes on a text a shop owner (not a shopper) receives from us. */
export const OWNER_SMS_STOP_LINE = "Reply STOP to stop";
