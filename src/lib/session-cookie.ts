/**
 * Name des Session-Cookies. In Produktion mit `__Host-`-Präfix: Der Browser akzeptiert
 * das Cookie dann nur mit `Secure`, `Path=/` und ohne `Domain` (kein Setzen durch Subdomains).
 */
export const SESSION_COOKIE = process.env.NODE_ENV === "production" ? "__Host-pw_session" : "pw_session";
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
