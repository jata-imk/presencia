// Fuente única de las etiquetas en español de cada red — antes duplicado
// entre canales.tsx y las piezas de F6 (drawer, toolbar de la card). Desde
// F10.5 vive en shared, porque la API también la usa; aquí se reexporta para
// no tocar a cada quien que la importa.
export { NETWORK_LABELS } from "@presencia/shared";
