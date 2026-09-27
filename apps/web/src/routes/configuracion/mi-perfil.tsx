import { Clock, User } from "lucide-react";
import { useEffect, useState } from "react";
import type { ProfileDto, UpdateProfileBody } from "@presencia/shared";
import {
  Campo,
  EncabezadoDePagina,
  Seccion,
  SkeletonDePagina,
} from "../../components/configuracion/primitivas.js";
import { Select } from "../../components/ui/Select.js";
import { TextInput } from "../../components/ui/TextInput.js";
import { apiFetch } from "../../lib/api.js";
import { useAutoguardado } from "../../lib/use-autoguardado.js";

const TIME_ZONES = Intl.supportedValuesOf("timeZone");

// Cierra el backlog de F2: el onboarding (PR 3) ya captura y guarda la
// zona horaria detectada del navegador — esta pantalla solo la muestra y
// permite corregirla, no vuelve a detectar nada.
//
// Se guarda sola (F9.7, ver lib/autoguardado.ts): PATCH parcial por campo.
export function MiPerfilPage() {
  const [profile, setProfile] = useState<ProfileDto | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [timezone, setTimezone] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);

  const auto = useAutoguardado<UpdateProfileBody>({
    combinar: (anterior, nuevo) => ({ ...anterior, ...nuevo }),
    enviar: async (parche) => {
      await apiFetch<ProfileDto>("/api/me", { method: "PATCH", body: parche });
    },
  });

  useEffect(() => {
    apiFetch<ProfileDto>("/api/me")
      .then((data) => {
        setProfile(data);
        setDisplayName(data.displayName ?? "");
        setTimezone(data.timezone);
      })
      .catch(() => setLoadError("No se pudo cargar tu perfil."));
  }, []);

  if (loadError) return <p className="text-sm text-error-fg">{loadError}</p>;
  if (!profile) return <SkeletonDePagina />;

  return (
    <div>
      <EncabezadoDePagina titulo="Mi perfil" subtitulo="Cómo te llamamos y en qué hora vives." />

      <Seccion icono={User} titulo="Tu nombre" subtitulo={`Tu cuenta: ${profile.email}`}>
        <Campo
          label="Nombre público"
          htmlFor="display-name"
          estado={auto.estado("displayName")}
          hint={`Se muestra en vez de tu nombre de cuenta (${profile.name}). Déjalo vacío para usar ese.`}
        >
          <TextInput
            id="display-name"
            value={displayName}
            maxLength={60}
            onChange={(e) => {
              setDisplayName(e.target.value);
              // Vacío = null: vuelve al nombre de la cuenta.
              auto.programar("displayName", { displayName: e.target.value.trim() || null });
            }}
            placeholder={profile.name}
          />
        </Campo>
      </Seccion>

      <Seccion
        icono={Clock}
        titulo="Zona horaria"
        subtitulo="Con ella se programan tus publicaciones y se leen tus mejores horarios."
      >
        <Campo label="Zona horaria" htmlFor="timezone" estado={auto.estado("timezone")}>
          <Select
            id="timezone"
            value={timezone}
            onChange={(e) => {
              setTimezone(e.target.value);
              auto.programar("timezone", { timezone: e.target.value }, { inmediato: true });
            }}
          >
            {TIME_ZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </Select>
        </Campo>
      </Seccion>
    </div>
  );
}
