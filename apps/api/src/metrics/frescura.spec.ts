import { describe, expect, it } from "vitest";
import { bucketAMedir, bucketDe } from "./frescura.js";

// Función pura y sin red: la escalera se prueba con fechas fijas, que es la
// única forma de cubrir los cuatro tramos sin esperar semanas.

const AHORA = new Date("2026-09-18T06:40:00.000Z");
const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;

function haceHoras(horas: number): Date {
  return new Date(AHORA.getTime() - horas * HORA);
}

describe("bucketDe", () => {
  it("en las primeras 12 h el bucket es de una hora", () => {
    expect(bucketDe(haceHoras(3), AHORA)).toEqual(new Date("2026-09-18T06:00:00.000Z"));
  });

  it("entre 12 y 48 h el bucket es de seis horas", () => {
    expect(bucketDe(haceHoras(20), AHORA)).toEqual(new Date("2026-09-18T06:00:00.000Z"));
    // Y a las 11:40 seguiría siendo el mismo bucket de las 06:00.
    const masTarde = new Date("2026-09-18T11:40:00.000Z");
    expect(bucketDe(new Date(masTarde.getTime() - 20 * HORA), masTarde)).toEqual(
      new Date("2026-09-18T06:00:00.000Z"),
    );
  });

  it("entre 2 y 14 días el bucket es el día", () => {
    expect(bucketDe(haceHoras(5 * 24), AHORA)).toEqual(new Date("2026-09-18T00:00:00.000Z"));
  });

  it("entre 14 y 30 días el bucket es de tres días", () => {
    const bucket = bucketDe(haceHoras(20 * 24), AHORA);
    expect(bucket).not.toBeNull();
    // Alineado a múltiplos de 3 días desde la época, no a "hace 3 días".
    expect((bucket as Date).getTime() % (3 * DIA)).toBe(0);
    expect((bucket as Date).getTime()).toBeLessThanOrEqual(AHORA.getTime());
    expect(AHORA.getTime() - (bucket as Date).getTime()).toBeLessThan(3 * DIA);
  });

  it("pasados 30 días no hay bucket", () => {
    expect(bucketDe(haceHoras(31 * 24), AHORA)).toBeNull();
  });

  // Un published_at en el futuro (reloj torcido) daría edad negativa. No debe
  // caerse de la ventana por el lado equivocado.
  it("un published_at futuro se trata como recién publicado", () => {
    expect(bucketDe(new Date(AHORA.getTime() + 2 * HORA), AHORA)).toEqual(
      new Date("2026-09-18T06:00:00.000Z"),
    );
  });

  // Los bordes se alinean al reloj UTC y no a la hora de publicación: de otro
  // modo dos posts del mismo día tendrían series que no se pueden comparar.
  it("los bordes no dependen de la hora de publicación", () => {
    const a = bucketDe(new Date("2026-09-18T06:05:00.000Z"), AHORA);
    const b = bucketDe(new Date("2026-09-18T06:35:00.000Z"), AHORA);
    expect(a).toEqual(b);
  });
});

describe("bucketAMedir", () => {
  it("un post nunca medido entra siempre, esté donde esté de la ventana", () => {
    for (const horas of [0, 3, 30, 10 * 24, 29 * 24]) {
      expect(
        bucketAMedir({ publishedAt: haceHoras(horas), ultimoBucket: null, ahora: AHORA }),
      ).not.toBeNull();
    }
  });

  // El bucket ES la política: si ya hay fila para este bucket, volver a pedir
  // gastaría una request para sobrescribirla con casi lo mismo.
  it("no se vuelve a medir dentro del mismo bucket", () => {
    const publishedAt = haceHoras(3);
    const bucket = bucketDe(publishedAt, AHORA);
    expect(bucketAMedir({ publishedAt, ultimoBucket: bucket, ahora: AHORA })).toBeNull();
  });

  it("una hora después, un post caliente sí entra de nuevo", () => {
    const publishedAt = haceHoras(3);
    const bucketPrevio = bucketDe(publishedAt, new Date(AHORA.getTime() - HORA));
    expect(bucketAMedir({ publishedAt, ultimoBucket: bucketPrevio, ahora: AHORA })).toEqual(
      new Date("2026-09-18T06:00:00.000Z"),
    );
  });

  // Y el mismo salto de una hora NO alcanza para un post de cinco días, que
  // vive en buckets diarios.
  it("una hora después, un post de cinco días no entra", () => {
    const publishedAt = haceHoras(5 * 24);
    const bucketPrevio = bucketDe(publishedAt, new Date(AHORA.getTime() - HORA));
    expect(bucketAMedir({ publishedAt, ultimoBucket: bucketPrevio, ahora: AHORA })).toBeNull();
  });

  // El ancho del bucket CRECE con la edad, así que al cruzar un escalón el
  // borde truncado puede quedar ATRÁS del último medido. Sin la guardia de
  // "solo avanzar", acá se pagaría una request para pisar el punto de las
  // 12:00 con números de las 14:00 — y otra vez a las 15, 16 y 17.
  it("al cruzar un escalón no retrocede a un bucket ya medido", () => {
    const publishedAt = new Date("2026-09-18T01:00:00.000Z");
    const alasTrece = new Date("2026-09-18T13:00:00.000Z");
    const ultimoBucket = bucketDe(publishedAt, alasTrece);
    expect(ultimoBucket).toEqual(alasTrece);

    for (const hora of [14, 15, 16, 17]) {
      const ahora = new Date(`2026-09-18T${String(hora)}:00:00.000Z`);
      expect(bucketDe(publishedAt, ahora)).toEqual(new Date("2026-09-18T12:00:00.000Z"));
      expect(bucketAMedir({ publishedAt, ultimoBucket, ahora })).toBeNull();
    }

    // Y al borde siguiente del tramo nuevo sí avanza.
    const alasDieciocho = new Date("2026-09-18T18:00:00.000Z");
    expect(bucketAMedir({ publishedAt, ultimoBucket, ahora: alasDieciocho })).toEqual(
      alasDieciocho,
    );
  });

  it("pasados 30 días ya no se mide, ni siquiera si nunca se midió", () => {
    expect(
      bucketAMedir({ publishedAt: haceHoras(31 * 24), ultimoBucket: null, ahora: AHORA }),
    ).toBeNull();
  });
});
