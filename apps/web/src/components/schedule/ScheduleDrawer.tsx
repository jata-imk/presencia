import { useEffect, useMemo, useRef, useState } from "react";
import {
  summarizeCardContent,
  type PublicationCardDto,
  type ScheduleGroupResultItem,
} from "@presencia/shared";
import { Link } from "react-router";
import { Button } from "../ui/Button.js";
import { Select } from "../ui/Select.js";
import { TextInput } from "../ui/TextInput.js";
import { fetchScheduleConflicts, scheduleGroup } from "../../lib/cards-api.js";
import { NETWORK_LABELS } from "../../lib/network-labels.js";
import { useChannels } from "../../lib/use-channels.js";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"]), select, input';
const MIN_LEAD_MINUTES = 5;
const CONFLICT_WINDOW_MINUTES = 30;

interface RowState {
  cardId: string;
  network: PublicationCardDto["network"];
  mode: "schedule" | "draft";
  date: string;
  time: string;
  socialAccountId: string | null;
  conflictWarning: string | null;
}

function defaultDateTime(): { date: string; time: string } {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  d.setHours(10, 0, 0, 0);
  return { date: toDateInput(d), time: "10:00" };
}

function toDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function combineToISO(date: string, time: string): string | null {
  if (!date || !time) return null;
  const local = new Date(`${date}T${time}:00`);
  if (Number.isNaN(local.getTime())) return null;
  return local.toISOString();
}

// Drawer de programación (presencia-chat.md, reconciliado desde Claude
// Design "Chat Part 3.html" d1-d6): siempre opera sobre un ARRAY de cards
// (una sola card = array de 1) y siempre llama a schedule-group — un solo
// camino, nunca dos formas de leer la respuesta. "Personalizar por red"
// habilita fecha/hora independiente por card; "Mismo horario" copia la del
// primer renglón a todas al enviar. keepDraft dentro del grupo (variante
// mixta d3b) deja esa red donde estaba, sin tocarla.
export function ScheduleDrawer({
  cards,
  onClose,
  onDone,
}: {
  cards: PublicationCardDto[];
  onClose: () => void;
  onDone: (results: ScheduleGroupResultItem[]) => void;
}) {
  const { channels } = useChannels();
  const isBatch = cards.length > 1;
  const [sameTime, setSameTime] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const [rows, setRows] = useState<RowState[]>(() =>
    cards.map((card) => {
      const { date, time } = defaultDateTime();
      return {
        cardId: card.id,
        network: card.network,
        mode: "schedule",
        date,
        time,
        socialAccountId: null,
        conflictWarning: null,
      };
    }),
  );

  // Auto-selecciona la cuenta si solo hay una activa para esa red; deja null
  // (bloquea programar esa fila) si no hay ninguna conectada todavía.
  useEffect(() => {
    if (!channels) return;
    setRows((prev) =>
      prev.map((row) => {
        if (row.socialAccountId) return row;
        const active = channels.filter((c) => c.network === row.network && c.status === "active");
        return active.length === 1 && active[0] ? { ...row, socialAccountId: active[0].id } : row;
      }),
    );
  }, [channels]);

  useEffect(() => {
    dialogRef.current?.focus();
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const container = dialogRef.current;
      if (!container) return;
      const focusable = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        }
      } else if (document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  function accountsFor(network: PublicationCardDto["network"]) {
    return (channels ?? []).filter((c) => c.network === network && c.status === "active");
  }

  function updateRow(cardId: string, patch: Partial<RowState>) {
    setRows((prev) => prev.map((r) => (r.cardId === cardId ? { ...r, ...patch } : r)));
  }

  // Cuando "mismo horario" está activo, la fecha/hora del primer renglón
  // manda — se refleja en los demás en cuanto cambia (solo visual; el envío
  // vuelve a resolverlo explícito, ver handleSubmit).
  const effectiveRows = useMemo(() => {
    if (!sameTime || rows.length === 0) return rows;
    const [leader] = rows;
    if (!leader) return rows;
    return rows.map((r) => ({ ...r, date: leader.date, time: leader.time }));
  }, [rows, sameTime]);

  async function checkConflict(cardId: string, date: string, time: string) {
    const iso = combineToISO(date, time);
    if (!iso) return;
    const dayStart = new Date(`${date}T00:00:00`).toISOString();
    const dayEnd = new Date(`${date}T23:59:59`).toISOString();
    try {
      const conflicts = await fetchScheduleConflicts(dayStart, dayEnd);
      const target = new Date(iso).getTime();
      const clash = conflicts.find(
        (c) =>
          c.id !== cardId &&
          c.scheduledAt &&
          Math.abs(new Date(c.scheduledAt).getTime() - target) < CONFLICT_WINDOW_MINUTES * 60_000,
      );
      updateRow(cardId, {
        conflictWarning: clash ? "Ya tienes una publicación programada cerca de esta hora." : null,
      });
    } catch {
      // El conflicto es una ayuda, no un bloqueo — si la consulta falla, se
      // sigue sin advertencia en vez de tumbar el drawer.
    }
  }

  function handleDateTimeChange(cardId: string, date: string, time: string) {
    updateRow(cardId, { date, time, conflictWarning: null });
    void checkConflict(cardId, date, time);
  }

  async function handleSubmit() {
    setFormError(null);
    const targetRows = sameTime && rows.length > 0 ? effectiveRows : rows;

    const items = targetRows.map((row) => {
      if (row.mode === "draft") return { cardId: row.cardId, keepDraft: true as const };
      const iso = combineToISO(row.date, row.time);
      return {
        cardId: row.cardId,
        socialAccountId: row.socialAccountId ?? "",
        scheduledAt: iso ?? "",
      };
    });

    const invalid = items.find(
      (item) => !("keepDraft" in item) && (!item.socialAccountId || !item.scheduledAt),
    );
    if (invalid) {
      setFormError("Completa la cuenta y el horario de cada red antes de programar.");
      return;
    }
    const tooSoon = targetRows.some((row) => {
      if (row.mode === "draft") return false;
      const iso = combineToISO(row.date, row.time);
      return !iso || new Date(iso).getTime() < Date.now() + MIN_LEAD_MINUTES * 60_000;
    });
    if (tooSoon) {
      setFormError(`Elige un horario al menos ${MIN_LEAD_MINUTES} minutos en el futuro.`);
      return;
    }

    setSubmitting(true);
    try {
      const results = await scheduleGroup({ items });
      onDone(results);
    } catch {
      setFormError("No se pudo programar. Inténtalo de nuevo.");
    } finally {
      setSubmitting(false);
    }
  }

  const displayRows = sameTime ? effectiveRows : rows;
  const anyReschedule = cards.some((c) => c.status === "scheduled" || c.status === "failed");

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-overlay">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="schedule-drawer-title"
        tabIndex={-1}
        className="flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-line bg-surface p-5 shadow-lg outline-none"
      >
        <div className="mb-4 flex items-start justify-between">
          <h2 id="schedule-drawer-title" className="text-lg font-bold text-fg">
            {anyReschedule ? "Reprogramar publicación" : "Programar publicación"}
          </h2>
          <button type="button" aria-label="Cerrar" className="text-fg-muted" onClick={onClose}>
            ×
          </button>
        </div>

        {isBatch && (
          <div className="mb-4 flex items-center gap-2 rounded-md bg-tint-plum p-1 text-sm">
            <button
              type="button"
              className={`flex-1 rounded-md py-1.5 font-medium ${sameTime ? "bg-card text-fg shadow-sm" : "text-fg-secondary"}`}
              onClick={() => setSameTime(true)}
            >
              Mismo horario
            </button>
            <button
              type="button"
              className={`flex-1 rounded-md py-1.5 font-medium ${!sameTime ? "bg-card text-fg shadow-sm" : "text-fg-secondary"}`}
              onClick={() => setSameTime(false)}
            >
              Personalizar por red
            </button>
          </div>
        )}

        <div className="flex flex-col gap-4">
          {displayRows.map((row, i) => {
            const card = cards.find((c) => c.id === row.cardId);
            const accounts = accountsFor(row.network);
            const showDateTime = !sameTime || i === 0;
            return (
              <ScheduleRow
                key={row.cardId}
                row={row}
                summary={card ? summarizeCardContent(card.content) : ""}
                accounts={accounts}
                showDateTime={showDateTime || !isBatch}
                showKeepDraftOption={isBatch}
                onChangeDateTime={(date, time) => handleDateTimeChange(row.cardId, date, time)}
                onChangeAccount={(id) => updateRow(row.cardId, { socialAccountId: id })}
                onChangeMode={(mode) => updateRow(row.cardId, { mode })}
              />
            );
          })}
        </div>

        {formError && <p className="mt-4 text-sm text-error">{formError}</p>}

        <div className="mt-auto flex gap-2 pt-5">
          <Button variant="secondary" onClick={onClose} disabled={submitting} className="flex-1">
            Cancelar
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={submitting} className="flex-1">
            {submitting ? "Programando…" : anyReschedule ? "Reprogramar" : "Programar"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ScheduleRow({
  row,
  summary,
  accounts,
  showDateTime,
  showKeepDraftOption,
  onChangeDateTime,
  onChangeAccount,
  onChangeMode,
}: {
  row: RowState;
  summary: string;
  accounts: { id: string; displayName: string | null }[];
  showDateTime: boolean;
  showKeepDraftOption: boolean;
  onChangeDateTime: (date: string, time: string) => void;
  onChangeAccount: (id: string) => void;
  onChangeMode: (mode: RowState["mode"]) => void;
}) {
  const hasAccount = accounts.length > 0;

  return (
    <div className="rounded-md border border-line bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-fg">{NETWORK_LABELS[row.network]}</span>
        {showKeepDraftOption && (
          <div className="flex gap-1 rounded-md bg-tint-plum p-0.5 text-xs">
            <button
              type="button"
              className={`rounded px-2 py-1 ${row.mode === "schedule" ? "bg-card font-semibold text-fg" : "text-fg-secondary"}`}
              onClick={() => onChangeMode("schedule")}
            >
              Programar
            </button>
            <button
              type="button"
              className={`rounded px-2 py-1 ${row.mode === "draft" ? "bg-card font-semibold text-fg" : "text-fg-secondary"}`}
              onClick={() => onChangeMode("draft")}
            >
              Dejar en borrador
            </button>
          </div>
        )}
      </div>
      <p className="mb-3 line-clamp-2 text-xs text-fg-secondary">{summary}</p>

      {row.mode === "draft" ? (
        <p className="text-xs text-fg-muted italic">Esta red se queda como está, sin programar.</p>
      ) : !hasAccount ? (
        <p className="text-xs text-warning">
          No tienes una cuenta de {NETWORK_LABELS[row.network]} conectada.{" "}
          <Link to="/configuracion/canales" className="underline">
            Conéctala primero
          </Link>
          .
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {accounts.length > 1 && (
            <Select
              value={row.socialAccountId ?? ""}
              onChange={(e) => onChangeAccount(e.target.value)}
            >
              <option value="" disabled>
                Elige la cuenta
              </option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.displayName ?? a.id}
                </option>
              ))}
            </Select>
          )}
          {showDateTime && (
            <div className="flex gap-2">
              <TextInput
                type="date"
                aria-label="Fecha"
                value={row.date}
                onChange={(e) => onChangeDateTime(e.target.value, row.time)}
                className="flex-1"
              />
              <TextInput
                type="time"
                aria-label="Hora"
                value={row.time}
                onChange={(e) => onChangeDateTime(row.date, e.target.value)}
                className="w-28"
              />
            </div>
          )}
          {row.conflictWarning && <p className="text-xs text-warning">⚠ {row.conflictWarning}</p>}
        </div>
      )}
    </div>
  );
}
