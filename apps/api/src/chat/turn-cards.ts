/**
 * Las cards que crea un turno de chat (closure compartido con la tool de
 * cards): onEnd las liga a la respuesta una vez que existe.
 *
 * F10.9: un turno cortado borra, al vencer la gracia, las cards que el
 * creator nunca vio (ChatService.saveInterrupted). Una tool que termina
 * DESPUÉS de esa gracia antes dejaba su card sin mensaje para siempre: el
 * borrado ya había corrido. Al cerrar el turno, cada card que llegue tarde
 * va directo a `late`.
 */
export class TurnCards {
  private readonly created: string[] = [];
  private late: ((cardId: string) => void) | null = null;

  get ids(): readonly string[] {
    return this.created;
  }

  add(cardId: string): void {
    this.created.push(cardId);
    this.late?.(cardId);
  }

  /** Desde aquí, cada card nueva del turno se entrega a `late`. */
  close(late: (cardId: string) => void): void {
    this.late = late;
  }
}
