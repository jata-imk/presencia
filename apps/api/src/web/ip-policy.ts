import ipaddr from "ipaddr.js";

// F10.10 (ADR-028): a qué direcciones puede conectarse el lector de páginas.
//
// El riesgo es SSRF: que alguien pegue en el chat `http://localhost:3000/…`,
// `http://169.254.169.254/` (los metadatos del VPS) o una IP de la red interna
// y el servidor la abra por él. La regla es una allowlist, no una denylist:
// solo se conecta a una dirección **unicast pública**. Todo lo demás que
// ipaddr.js clasifica (privada, loopback, link-local, CGNAT, multicast,
// reservada, y en IPv6 las que envuelven una IPv4: mapeada, 6to4, Teredo,
// NAT64) queda fuera, aunque mañana aparezca un rango nuevo: si no es
// "unicast", no se pide.

/** true si la dirección es unicast pública. `ip` es una dirección suelta, sin corchetes. */
export function isPublicAddress(ip: string): boolean {
  if (!ipaddr.isValid(ip)) return false;
  let addr = ipaddr.parse(ip);
  // `::ffff:10.0.0.1` es 10.0.0.1: se juzga la IPv4 que lleva adentro.
  if (addr.kind() === "ipv6" && (addr as ipaddr.IPv6).isIPv4MappedAddress()) {
    addr = (addr as ipaddr.IPv6).toIPv4Address();
  }
  return addr.range() === "unicast";
}

/** Los puertos que se piden: los de la web. Un `:8080` o un `:5432` en un link pegado no es una página. */
export const ALLOWED_PORTS: ReadonlySet<number> = new Set([80, 443]);
