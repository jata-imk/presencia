import { describe, expect, it } from "vitest";
import { isPublicAddress } from "./ip-policy.js";

// F10.10: a qué direcciones se conecta el lector. Solo unicast pública.

describe("isPublicAddress", () => {
  it.each(["8.8.8.8", "200.94.1.1", "2001:4860:4860::8888", "::ffff:8.8.8.8"])(
    "deja pasar %s",
    (ip) => {
      expect(isPublicAddress(ip)).toBe(true);
    },
  );

  it.each([
    ["127.0.0.1", "loopback"],
    ["10.0.0.1", "privada"],
    ["172.16.5.4", "privada"],
    ["192.168.1.1", "privada"],
    ["169.254.169.254", "metadatos del VPS (link-local)"],
    ["100.64.0.1", "CGNAT"],
    ["0.0.0.0", "no especificada"],
    ["224.0.0.1", "multicast"],
    ["255.255.255.255", "broadcast"],
    ["192.0.2.1", "reservada (documentación)"],
    ["::1", "loopback IPv6"],
    ["::", "no especificada IPv6"],
    ["fc00::1", "única local IPv6"],
    ["fe80::1", "link-local IPv6"],
    ["::ffff:10.0.0.1", "IPv4 privada mapeada en IPv6"],
    ["::ffff:127.0.0.1", "loopback mapeada en IPv6"],
    ["2002:0a00:0001::1", "6to4 (envuelve 10.0.0.1)"],
    ["64:ff9b::0a00:0001", "NAT64 (envuelve 10.0.0.1)"],
    ["no-es-ip", "basura"],
  ])("rechaza %s (%s)", (ip) => {
    expect(isPublicAddress(ip)).toBe(false);
  });
});
