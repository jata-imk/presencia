import { Link } from "react-router";
import type { SocialNetwork } from "@presencia/shared";
import { NETWORK_META } from "../cards/NetworkLogos.js";
import { MiniCalendar } from "./MiniCalendar.js";
import { TimeChips } from "./TimeChips.js";

interface Account {
  id: string;
  displayName: string | null;
}

// Portado de NetworkScheduleRow (Chat Part 3.html) — usada tanto en modo
// "personalizar por red" (cada fila con su propio calendario) como en el
// resumen de "mismo horario" (showDateTimePicker=false: solo el toggle
// Programar/Dejar en borrador, el calendario compartido vive una sola vez
// en ScheduleDrawer).
export function NetworkScheduleRow({
  network,
  mode,
  onChangeMode,
  showModeToggle,
  showDateTimePicker,
  date,
  time,
  viewMonth,
  onChangeMonth,
  onChangeDate,
  onChangeTime,
  markers,
  conflictWarning,
  accounts,
  socialAccountId,
  onChangeAccount,
}: {
  network: SocialNetwork;
  mode: "schedule" | "draft";
  onChangeMode: (mode: "schedule" | "draft") => void;
  showModeToggle: boolean;
  showDateTimePicker: boolean;
  date: Date;
  time: string;
  viewMonth: Date;
  onChangeMonth: (month: Date) => void;
  onChangeDate: (date: Date) => void;
  onChangeTime: (time: string) => void;
  markers: Record<string, number>;
  conflictWarning: string | null;
  accounts: Account[];
  socialAccountId: string | null;
  onChangeAccount: (id: string) => void;
}) {
  const meta = NETWORK_META[network];
  const hasAccount = accounts.length > 0;

  return (
    <div
      className={`rounded-lg border px-3 py-3 ${
        mode === "draft" ? "border-ai-border bg-ai-bg" : "border-line bg-card"
      }`}
    >
      <div className="mb-2 flex items-center gap-2.5">
        <meta.Logo size={15} />
        <span className="flex-1 text-xs font-semibold" style={{ color: meta.color }}>
          {meta.label}
        </span>
        {showModeToggle && (
          <div className="flex gap-0.5 rounded-md bg-tint-plum p-0.5 text-[11px]">
            <button
              type="button"
              onClick={() => onChangeMode("schedule")}
              className={`rounded px-2 py-1 font-semibold ${
                mode === "schedule" ? "bg-card text-brand" : "text-fg-secondary"
              }`}
            >
              Programar
            </button>
            <button
              type="button"
              onClick={() => onChangeMode("draft")}
              className={`rounded px-2 py-1 font-semibold ${
                mode === "draft" ? "bg-card text-accent" : "text-fg-secondary"
              }`}
            >
              Dejar en borrador
            </button>
          </div>
        )}
      </div>

      {mode === "draft" ? (
        <p className="text-xs text-fg-secondary italic">
          Esta red se queda como está, sin programar.
        </p>
      ) : !hasAccount ? (
        <p className="text-xs text-warning">
          No tienes una cuenta de {meta.label} conectada.{" "}
          <Link to="/configuracion/canales" className="underline">
            Conéctala primero
          </Link>
          .
        </p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {accounts.length > 1 && (
            <select
              value={socialAccountId ?? ""}
              onChange={(e) => onChangeAccount(e.target.value)}
              className="rounded-md border border-line bg-card px-2.5 py-1.5 text-xs text-fg"
            >
              <option value="" disabled>
                Elige la cuenta
              </option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.displayName ?? a.id}
                </option>
              ))}
            </select>
          )}
          {showDateTimePicker && (
            <>
              <MiniCalendar
                viewMonth={viewMonth}
                onChangeMonth={onChangeMonth}
                selectedDate={date}
                onSelectDate={onChangeDate}
                markers={markers}
              />
              <TimeChips selectedTime={time} onSelectTime={onChangeTime} />
            </>
          )}
          {conflictWarning && <p className="text-xs text-warning">⚠ {conflictWarning}</p>}
        </div>
      )}
    </div>
  );
}
