// Bloqueo suave (ADR-012 + F5): no es un error de programación, es el
// negocio diciendo "no alcanza". El chat gate (F5 PR2) la traduce a HTTP
// 402; spend()/charge() la lanzan crudo para que cualquier call site futuro
// decida su propio manejo.
export class InsufficientQuotaError extends Error {
  constructor(
    readonly userId: string,
    readonly requiredUnits: number,
    readonly availableUnits: number,
  ) {
    super(
      `Saldo insuficiente para el usuario ${userId}: se necesitan ${requiredUnits} unidades y hay ${availableUnits}.`,
    );
    this.name = "InsufficientQuotaError";
  }
}
