// Fixtures de Voz de marca para la suite cultural (F4, DoD de
// docs/explanation/product/presencia-configuracion-voz-de-marca.md): dos
// usuarios con voces distintas deben recibir outputs notoriamente
// distintos del mismo prompt. Mismo shape que consume
// chat/system-prompt.ts::buildSystemPrompt — nunca una fila de Drizzle
// (comentario en system-prompt.ts).

import type { BrandVoiceForPrompt } from "@presencia/shared";

export interface VoiceFixture {
  id: string;
  label: string;
  voice: BrandVoiceForPrompt;
}

// Opuesta a voiceFintechCorporativa en cada eje que importa: formalidad,
// modismos, anglicismos, CTAs.
const voiceBarrioMerida: BrandVoiceForPrompt = {
  marketCountry: "MX",
  marketRegion: "Yucatán",
  niche: ["taquería", "comida callejera"],
  audience: "vecinos y clientes frecuentes del barrio, gente que busca antojo rápido y económico",
  register: "de_barrio",
  formality: 15,
  allowedExpressions: ["wey", "chido", "al chile", "la banda"],
  bannedExpressions: ["premium", "exclusivo", "experiencia gastronómica"],
  useAnglicisms: false,
  keyTopics: ["promos del día", "antojo", "ambiente de barrio"],
  preferredCtas: ["Cae por acá", "Mándanos DM"],
  referenceExamples: [],
};

const voiceFintechCorporativa: BrandVoiceForPrompt = {
  marketCountry: "MX",
  marketRegion: "Ciudad de México",
  niche: ["fintech", "consultoría financiera B2B"],
  audience: "directores financieros y founders de startups buscando soluciones de pago",
  register: "profesional",
  formality: 85,
  allowedExpressions: ["insights", "roadmap", "kickoff"],
  bannedExpressions: ["chido", "wey", "al chile"],
  useAnglicisms: true,
  keyTopics: ["compliance", "escalabilidad", "reducción de costos operativos"],
  preferredCtas: ["Agenda una llamada", "Escríbenos por LinkedIn"],
  referenceExamples: [],
};

// DoD 2 (20 generaciones, 0 apariciones): "increíble" es de las palabras
// que más se le escapan a un LLM en copy de marketing en español — banearla
// es una prueba real de la regla, no una que el modelo iba a evitar de
// todos modos por el registro (a diferencia de banear "wey" en la voz
// fintech, donde el modelo ya no lo usaría ni sin la regla).
const voiceModismoProhibido: BrandVoiceForPrompt = {
  marketCountry: "MX",
  marketRegion: null,
  niche: ["cafetería"],
  audience: "clientes que buscan un café de especialidad para el día a día",
  register: "neutro_profesional",
  formality: 55,
  allowedExpressions: [],
  bannedExpressions: ["increíble"],
  useAnglicisms: true,
  keyTopics: ["café de especialidad", "ambiente acogedor"],
  preferredCtas: ["Visítanos"],
  referenceExamples: [],
};

// Usadas por AI_SUITE_VOICES (suite:cultural) — DoD 1.
export const CULTURAL_SUITE_VOICES: VoiceFixture[] = [
  { id: "barrio-merida", label: "Taquería de barrio en Mérida", voice: voiceBarrioMerida },
  {
    id: "fintech-corporativa",
    label: "Consultora fintech en LinkedIn",
    voice: voiceFintechCorporativa,
  },
];

// Usada por suite:voz-prohibida — DoD 2.
export const PROHIBITED_WORD_VOICE: VoiceFixture = {
  id: "modismo-prohibido",
  label: "Cafetería — 'increíble' prohibido",
  voice: voiceModismoProhibido,
};
