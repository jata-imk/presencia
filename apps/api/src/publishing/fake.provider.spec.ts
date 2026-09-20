import { beforeEach, describe, expect, it } from "vitest";
import { FakePublishingProvider } from "./fake.provider.js";
import type { PostMetricsQuery } from "./publishing.provider.js";

// El fake es el proveedor con el que corre dev y con el que se prueba el job
// de métricas, así que sus propiedades NO son cosméticas: si sus números
// cambiaran entre llamadas, un test de "el segundo pase no duplica filas"
// pasaría o fallaría por azar.

let provider: FakePublishingProvider;

const POST: PostMetricsQuery = {
  accountProviderRef: "fake:account",
  network: "linkedin",
  platformPostId: "fake-post-ref-1",
  publishedAt: new Date("2026-09-10T18:00:00.000Z"),
};

describe("FakePublishingProvider.getPostMetrics", () => {
  beforeEach(() => {
    provider = new FakePublishingProvider();
  });

  it("dos llamadas seguidas dan los mismos números", async () => {
    const a = await provider.getPostMetrics([POST]);
    const b = await provider.getPostMetrics([POST]);

    const uno = a.get(POST.platformPostId);
    const dos = b.get(POST.platformPostId);
    expect(uno?.impressions).toBe(dos?.impressions);
    expect(uno?.likes).toBe(dos?.likes);
  });

  it("no depende del estado del proceso: otra instancia da lo mismo", async () => {
    const a = await provider.getPostMetrics([POST]);
    const b = await new FakePublishingProvider().getPostMetrics([POST]);

    expect(a.get(POST.platformPostId)?.impressions).toBe(b.get(POST.platformPostId)?.impressions);
  });

  it("un post más viejo acumula más impresiones", async () => {
    // El id decide si el fake devuelve números o el caso "sin métricas", así
    // que primero se busca uno que sí los dé; fijarlo a mano ataría el test a
    // la función de hash.
    const conNumeros = await (async () => {
      for (let i = 0; i < 20; i += 1) {
        const id = `fake-post-${i}`;
        const metrics = await provider.getPostMetrics([{ ...POST, platformPostId: id }]);
        if (metrics.get(id)?.impressions !== null) return id;
      }
      throw new Error("El fake no devolvió métricas para ningún id");
    })();

    const reciente = (
      await provider.getPostMetrics([
        { ...POST, platformPostId: conNumeros, publishedAt: new Date() },
      ])
    ).get(conNumeros);
    const antiguo = (
      await provider.getPostMetrics([
        {
          ...POST,
          platformPostId: conNumeros,
          publishedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        },
      ])
    ).get(conNumeros);

    expect(antiguo?.impressions ?? 0).toBeGreaterThan(reciente?.impressions ?? 0);
  });

  // En producción "publicó pero no hay métricas" es la norma (LinkedIn
  // personal no las da nunca). Si el fake siempre devolviera números, ese
  // camino no se recorrería jamás en dev y el primer lugar donde aparecería
  // sería producción.
  it("algunos posts devuelven el caso sin métricas", async () => {
    const posts: PostMetricsQuery[] = Array.from({ length: 40 }, (_, i) => ({
      ...POST,
      platformPostId: `fake-post-${i}`,
    }));

    const metrics = await provider.getPostMetrics(posts);

    const sinMetricas = [...metrics.values()].filter((m) => m.impressions === null);
    expect(sinMetricas.length).toBeGreaterThan(0);
    expect(sinMetricas.length).toBeLessThan(metrics.size);
    // Y cuando no hay números, hay motivo: lo que se guarda en `raw`.
    const raw = sinMetricas[0]?.raw as { motivo?: unknown };
    expect(typeof raw.motivo).toBe("string");
  });
});
