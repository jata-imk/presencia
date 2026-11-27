import { NETWORK_LABELS, type SocialNetwork } from "@presencia/shared";

// "Adaptar a otra red" no es un endpoint: es pedirle otra card al chat
// (flujo 1). Se precarga el composer con el arranque de la petición y el
// creator termina la frase con la red que quiera.
//
// Un solo texto para los dos lugares desde donde se adapta: el pie del panel
// de publicación (PanelCard) y el detalle de Analíticas, que llega al chat con
// el borrador en el state de la navegación.

export function textoAdaptar(network: SocialNetwork): string {
  return `Adapta el borrador de ${NETWORK_LABELS[network]} a `;
}
