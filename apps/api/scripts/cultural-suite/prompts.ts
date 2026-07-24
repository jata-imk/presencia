// Suite de regresión cultural (ADR-004): prompts en registro mexicano "de
// barrio". El objetivo es detectar cuál proveedor suena menos a "español de
// aeropuerto": tuteo natural, modismos, cero voseo, registro cercano.
// Los prompts con expectsTool: true fuerzan alguna de las 3 tools de crear
// borrador (crear_borrador_visual/video/texto, ADR-005) para medir la
// disciplina de tool calling de cada proveedor.

export interface CulturalPrompt {
  id: string;
  text: string;
  expectsTool: boolean;
}

export const culturalPrompts: CulturalPrompt[] = [
  {
    id: "marquesitas-merida",
    text: "Oye, ¿me echas la mano con ideas para mi negocio de marquesitas aquí en Mérida? Quiero subir algo esta semana pero ando seco de ideas.",
    expectsTool: false,
  },
  {
    id: "barberia-atorado",
    text: "Ando bien atorado, no sé qué publicar hoy. Tengo una barbería, ¿qué se te ocurre?",
    expectsTool: false,
  },
  {
    id: "registro-barrio",
    text: "¿Cómo le hago para que mi contenido no suene bien fresa? Mi público es más de barrio y siento que mis posts parecen de agencia.",
    expectsTool: false,
  },
  {
    id: "fiestas-patrias",
    text: "Ya viene el Grito y quiero aprovechar, ¿qué publico pa' las fiestas patrias sin que se vea bien gacho de comercial?",
    expectsTool: false,
  },
  {
    id: "engagement-tia",
    text: "Explícame rapidito qué es eso del 'engagement', pero sin tecnicismos, como si se lo contaras a mi tía.",
    expectsTool: false,
  },
  {
    id: "aviso-puente",
    text: "Mañana hay puente y quiero avisar que no voy a abrir el changarro. ¿Cómo lo digo bonito en Face sin que suene cortante?",
    expectsTool: false,
  },
  {
    id: "hashtags-comadre",
    text: "Mi comadre dice que le ponga hashtags a todo, ¿de veras sirven o es puro cuento?",
    expectsTool: false,
  },
  {
    // Con todos los datos que el system prompt exige (negocio, promo,
    // condición) — el modelo no tiene por qué preguntar antes de llamar
    // la tool, así medimos disciplina de tool calling sin ese ruido.
    id: "tool-promo-tacos",
    text: "Hazme un borrador para Instagram de una promo 2x1 en tacos al pastor para este viernes en mi taquería 'El Trompo Feliz', solo en sucursal, de 6 a 11pm. Tono relajado, de barrio.",
    expectsTool: true,
  },
  {
    id: "tool-guion-cafe",
    text: "Quiero un guion para TikTok mostrando cómo preparo el café de olla en mi cafetería 'La Canela', algo cortito y estilo ASMR que enganche, 20-30 segundos.",
    expectsTool: true,
  },
  {
    id: "tool-post-linkedin",
    text: "Arma un post para LinkedIn presentando mi nuevo servicio de fotografía profesional para restaurantes en Mérida, se llama 'Lente y Sazón', tono corporativo pero cercano, con llamada a que me escriban por DM.",
    expectsTool: true,
  },
];
