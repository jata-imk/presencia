// F10.8.4: los proxies que están entre el cliente y la API en prod, para que
// Better Auth sepa cuál IP del X-Forwarded-For es la del cliente. Sin esto,
// con dos saltos (Cloudflare → el nginx de CloudPanel → la app) la cabecera
// trae dos IPs, Better Auth no elige ninguna y todo el tráfico cae en un solo
// contador del límite de intentos: tres logins (o tres códigos de
// recuperación) de quien sea bloqueaban a todos.
//
// Con la lista, Better Auth recorre la cabecera de derecha a izquierda,
// salta lo que sea proxy confiable y se queda con la primera IP que no lo es.
// Quien mande su propio X-Forwarded-For no puede fingir otra IP: la que
// cuenta es la que agregó el último proxy confiable.
//
// Rangos publicados por Cloudflare (https://www.cloudflare.com/ips/),
// consultados el 2026-10-13. Cambian rara vez; si cambian, hay que
// actualizarlos aquí.

const CLOUDFLARE_IPV4 = [
  "173.245.48.0/20",
  "103.21.244.0/22",
  "103.22.200.0/22",
  "103.31.4.0/22",
  "141.101.64.0/18",
  "108.162.192.0/18",
  "190.93.240.0/20",
  "188.114.96.0/20",
  "197.234.240.0/22",
  "198.41.128.0/17",
  "162.158.0.0/15",
  "104.16.0.0/13",
  "104.24.0.0/14",
  "172.64.0.0/13",
  "131.0.72.0/22",
];

const CLOUDFLARE_IPV6 = [
  "2400:cb00::/32",
  "2606:4700::/32",
  "2803:f800::/32",
  "2405:b500::/32",
  "2405:8100::/32",
  "2a06:98c0::/29",
  "2c0f:f248::/32",
];

/** El nginx de CloudPanel corre en el mismo VPS y llega por loopback. */
const LOCAL = ["127.0.0.1/32", "::1/128"];

export const TRUSTED_PROXIES = [...LOCAL, ...CLOUDFLARE_IPV4, ...CLOUDFLARE_IPV6];
