import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import {
  REGISTER_FORMALITY_ANCHORS,
  socialNetworkSchema,
  type BrandVoiceRegister,
} from "@presencia/shared";
import { Button } from "../components/ui/Button.js";
import { Field } from "../components/ui/Field.js";
import { Select } from "../components/ui/Select.js";
import { TagInput } from "../components/ui/TagInput.js";
import { TextInput } from "../components/ui/TextInput.js";
import { ApiError, apiFetch } from "../lib/api.js";
import { authClient } from "../lib/auth-client.js";

const TOTAL_STEPS = 5;

const REGISTER_LABELS: Record<BrandVoiceRegister, string> = {
  de_barrio: "De barrio",
  informal: "Informal",
  neutro_profesional: "Neutro-profesional",
  profesional: "Profesional",
  tecnico: "Técnico",
};

// Orden por formalidad ascendente (REGISTER_FORMALITY_ANCHORS), no el orden
// crudo del enum — más natural para un dropdown "menos formal → más formal".
const REGISTER_OPTIONS = (Object.keys(REGISTER_FORMALITY_ANCHORS) as BrandVoiceRegister[]).sort(
  (a, b) => REGISTER_FORMALITY_ANCHORS[a] - REGISTER_FORMALITY_ANCHORS[b],
);

const NETWORK_LABELS: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  threads: "Threads",
  x: "X",
};

const GOAL_PRESETS = [
  "Más seguidores",
  "Más ventas/clientes",
  "Ahorrar tiempo",
  "Consistencia al publicar",
  "Entender qué funciona",
];

type Step = 1 | 2 | 3 | 4 | 5;

const DEFAULT_ERROR = "Algo salió mal. Inténtalo de nuevo.";

// Stepper de 5 pasos, un solo archivo (mismo estilo que routes/chat.tsx).
// Navegación hacia adelante dispara la llamada a la API del paso que se
// abandona; hacia atrás nunca llama a la API. Solo "Voz" es no-skippable
// (doc: presencia-configuracion-voz-de-marca.md §1).
export function OnboardingPage() {
  const navigate = useNavigate();
  const { refetch } = authClient.useSession();
  const [step, setStep] = useState<Step>(1);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Paso 1 — Welcome: captura silenciosa de zona horaria, una sola vez
  // (guard de ref: React StrictMode invoca los effects dos veces en dev).
  const [timezone, setTimezone] = useState<string | null>(null);
  const capturedTimezone = useRef(false);
  useEffect(() => {
    if (capturedTimezone.current) return;
    capturedTimezone.current = true;
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    setTimezone(detected);
    apiFetch("/api/me", { method: "PATCH", body: { timezone: detected } }).catch(() => {
      // Silenciosa a propósito: si falla, el usuario sigue con el default
      // del servidor y puede ajustarla luego en Mi perfil (PR 4). No
      // bloquea el onboarding.
    });
  }, []);

  // Paso 2 — Voz (no-skippable).
  const [marketCountry, setMarketCountry] = useState("MX");
  const [marketRegion, setMarketRegion] = useState("");
  const [niche, setNiche] = useState<string[]>([]);
  const [register, setRegister] = useState<BrandVoiceRegister>("neutro_profesional");

  // Paso 4 — Goals.
  const [selectedGoals, setSelectedGoals] = useState<string[]>([]);
  const [otherGoal, setOtherGoal] = useState("");

  function toggleGoal(goal: string) {
    setSelectedGoals((prev) =>
      prev.includes(goal) ? prev.filter((g) => g !== goal) : [...prev, goal],
    );
  }

  async function runStep(action: () => Promise<unknown>): Promise<boolean> {
    setError(null);
    setSubmitting(true);
    try {
      await action();
      return true;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : DEFAULT_ERROR);
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVoiceNext() {
    const ok = await runStep(() =>
      apiFetch("/api/brand-voice", {
        method: "PUT",
        body: {
          marketCountry,
          marketRegion: marketRegion.trim() || undefined,
          niche,
          register,
        },
      }),
    );
    if (ok) setStep(3);
  }

  async function handleGoalsNext() {
    const goals = [...selectedGoals, ...(otherGoal.trim() ? [otherGoal.trim()] : [])];
    if (goals.length === 0) {
      setStep(5);
      return;
    }
    const ok = await runStep(() =>
      apiFetch("/api/brand-voice", { method: "PATCH", body: { extras: { goals } } }),
    );
    if (ok) setStep(5);
  }

  async function handleFinish() {
    const ok = await runStep(async () => {
      await apiFetch("/api/me/complete-onboarding", { method: "POST" });
      // Sin esto, protected.tsx sigue viendo onboardingCompletedAt: null
      // en el cache de la sesión y rebota de vuelta a /onboarding.
      await refetch();
    });
    if (ok) void navigate("/chats", { replace: true });
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-8">
      <p className="text-xs font-medium text-fg-muted">
        Paso {step} de {TOTAL_STEPS}
      </p>

      {step === 1 && (
        <section className="flex flex-col gap-4">
          <h1 className="text-2xl font-bold text-fg">Bienvenido a Presencia</h1>
          <p className="text-sm text-fg-secondary">
            En unos pasos configuramos tu voz de marca para que el contenido que generemos suene a
            ti, no a una IA genérica.
          </p>
          <Button onClick={() => setStep(2)}>Empezar</Button>
        </section>
      )}

      {step === 2 && (
        <section className="flex flex-col gap-4">
          <div>
            <h1 className="text-xl font-bold text-fg">Tu voz</h1>
            <p className="text-sm text-fg-secondary">
              Esto alimenta todo lo que Presencia genere para ti. Podrás afinarlo después en
              Configuración.
            </p>
          </div>
          <Field label="País" htmlFor="market-country">
            <TextInput
              id="market-country"
              value={marketCountry}
              onChange={(e) => setMarketCountry(e.target.value)}
            />
          </Field>
          <Field label="Región (opcional)" htmlFor="market-region" hint="Ej. Yucatán">
            <TextInput
              id="market-region"
              value={marketRegion}
              onChange={(e) => setMarketRegion(e.target.value)}
              placeholder="Yucatán"
            />
          </Field>
          <Field
            label="Nicho"
            htmlFor="niche"
            hint="¿A qué te dedicas o de qué hablas? Agrega al menos uno."
          >
            <TagInput
              id="niche"
              value={niche}
              onChange={setNiche}
              placeholder="Ej. repostería, tips de negocio"
            />
          </Field>
          <Field label="Registro" htmlFor="register">
            <Select
              id="register"
              value={register}
              onChange={(e) => setRegister(e.target.value as BrandVoiceRegister)}
            >
              {REGISTER_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {REGISTER_LABELS[option]}
                </option>
              ))}
            </Select>
          </Field>
          {error && <p className="text-sm text-error">{error}</p>}
          <Button
            onClick={() => void handleVoiceNext()}
            disabled={niche.length === 0 || submitting}
          >
            {submitting ? "Guardando…" : "Siguiente"}
          </Button>
        </section>
      )}

      {step === 3 && (
        <section className="flex flex-col gap-4">
          <div>
            <h1 className="text-xl font-bold text-fg">Conecta tus redes</h1>
            <p className="text-sm text-fg-secondary">
              Muy pronto vas a poder publicar directo desde Presencia.
            </p>
          </div>
          <ul className="flex flex-col gap-2">
            {socialNetworkSchema.options.map((network) => (
              <li
                key={network}
                className="flex items-center justify-between rounded-md border border-line bg-card px-3 py-2"
              >
                <span className="text-sm text-fg">{NETWORK_LABELS[network] ?? network}</span>
                <span className="rounded-sm bg-tint-plum px-2 py-0.5 text-xs text-fg-secondary">
                  Próximamente
                </span>
              </li>
            ))}
          </ul>
          <Button onClick={() => setStep(4)}>Saltar por ahora</Button>
        </section>
      )}

      {step === 4 && (
        <section className="flex flex-col gap-4">
          <div>
            <h1 className="text-xl font-bold text-fg">¿Qué te gustaría lograr?</h1>
            <p className="text-sm text-fg-secondary">
              Elige lo que aplique — puedes saltarte esto.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {GOAL_PRESETS.map((goal) => {
              const selected = selectedGoals.includes(goal);
              return (
                <button
                  key={goal}
                  type="button"
                  onClick={() => toggleGoal(goal)}
                  className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                    selected
                      ? "border-primary bg-primary text-primary-fg"
                      : "border-line bg-card text-fg-secondary hover:bg-secondary-hover"
                  }`}
                >
                  {goal}
                </button>
              );
            })}
          </div>
          <Field label="Algo más (opcional)" htmlFor="other-goal">
            <TextInput
              id="other-goal"
              value={otherGoal}
              onChange={(e) => setOtherGoal(e.target.value)}
              placeholder="Cuéntanos qué más te gustaría lograr"
            />
          </Field>
          {error && <p className="text-sm text-error">{error}</p>}
          <Button onClick={() => void handleGoalsNext()} disabled={submitting}>
            {submitting
              ? "Guardando…"
              : selectedGoals.length > 0 || otherGoal.trim()
                ? "Siguiente"
                : "Saltar por ahora"}
          </Button>
        </section>
      )}

      {step === 5 && (
        <section className="flex flex-col gap-4">
          <h1 className="text-xl font-bold text-fg">Todo listo</h1>
          <dl className="flex flex-col gap-1 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-fg-secondary">Registro</dt>
              <dd className="text-right text-fg">{REGISTER_LABELS[register]}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-fg-secondary">Nicho</dt>
              <dd className="text-right text-fg">{niche.join(", ") || "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-fg-secondary">Mercado</dt>
              <dd className="text-right text-fg">
                {[marketCountry, marketRegion].filter(Boolean).join(" / ")}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-fg-secondary">Zona horaria</dt>
              <dd className="text-right text-fg">{timezone ?? "detectando…"}</dd>
            </div>
          </dl>
          <p className="text-xs text-fg-muted">
            Podrás ajustar tu zona horaria más adelante en Mi perfil.
          </p>
          {error && <p className="text-sm text-error">{error}</p>}
          <Button onClick={() => void handleFinish()} disabled={submitting}>
            {submitting ? "Un momento…" : "Finalizar"}
          </Button>
        </section>
      )}
    </main>
  );
}
