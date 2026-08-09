import { useEffect, useState } from "react";
import type { ProfileDto } from "@presencia/shared";
import { Button } from "../../components/ui/Button.js";
import { Field } from "../../components/ui/Field.js";
import { Select } from "../../components/ui/Select.js";
import { TextInput } from "../../components/ui/TextInput.js";
import { ApiError, apiFetch } from "../../lib/api.js";

const TIME_ZONES = Intl.supportedValuesOf("timeZone");
const DEFAULT_ERROR = "Algo salió mal. Inténtalo de nuevo.";

// Cierra el backlog de F2: el onboarding (PR 3) ya captura y guarda la
// zona horaria detectada del navegador — esta pantalla solo la muestra y
// permite corregirla, no vuelve a detectar nada.
export function MiPerfilPage() {
  const [profile, setProfile] = useState<ProfileDto | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [timezone, setTimezone] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    apiFetch<ProfileDto>("/api/me")
      .then((data) => {
        setProfile(data);
        setDisplayName(data.displayName ?? "");
        setTimezone(data.timezone);
      })
      .catch(() => setLoadError("No se pudo cargar tu perfil."));
  }, []);

  async function handleSave() {
    setSaveError(null);
    setSaved(false);
    setSubmitting(true);
    try {
      const updated = await apiFetch<ProfileDto>("/api/me", {
        method: "PATCH",
        body: { displayName: displayName.trim() || undefined, timezone },
      });
      setProfile(updated);
      setSaved(true);
    } catch (e) {
      setSaveError(e instanceof ApiError ? e.message : DEFAULT_ERROR);
    } finally {
      setSubmitting(false);
    }
  }

  if (loadError) return <p className="text-sm text-error">{loadError}</p>;
  if (!profile) return <p className="text-sm text-fg-muted">Cargando…</p>;

  return (
    <div className="flex max-w-sm flex-col gap-4">
      <h1 className="text-xl font-bold text-fg">Mi perfil</h1>
      <Field
        label="Nombre público"
        htmlFor="display-name"
        hint="Se muestra en vez de tu nombre de cuenta si lo llenas."
      >
        <TextInput
          id="display-name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder={profile.name}
        />
      </Field>
      <Field label="Zona horaria" htmlFor="timezone">
        <Select id="timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
          {TIME_ZONES.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </Select>
      </Field>
      {saveError && <p className="text-sm text-error">{saveError}</p>}
      {saved && <p className="text-sm text-success">Guardado.</p>}
      <Button onClick={() => void handleSave()} disabled={submitting} className="w-fit">
        {submitting ? "Guardando…" : "Guardar"}
      </Button>
    </div>
  );
}
