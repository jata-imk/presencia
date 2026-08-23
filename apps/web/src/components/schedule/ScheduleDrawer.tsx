import { useEffect, useMemo, useRef, useState } from "react";
import { summarizeCardContent, type PublicationCardDto } from "@presencia/shared";
import { X } from "lucide-react";
import { Link } from "react-router";
import { Button } from "../ui/Button.js";
import { NETWORK_META } from "../cards/NetworkLogos.js";
import { MiniCalendar } from "./MiniCalendar.js";
import { NetworkScheduleRow } from "./NetworkScheduleRow.js";
import { TimeChips } from "./TimeChips.js";
import { WeekStrip } from "./WeekStrip.js";
import { combineDateAndTime, dateKey, startOfDay } from "./date-utils.js";
import { fetchScheduleConflicts, scheduleGroup } from "../../lib/cards-api.js";
import { useChannels } from "../../lib/use-channels.js";
import { useCardsStore } from "../../stores/cards-store.js";
import { useScheduleDrawerStore } from "../../stores/schedule-drawer-store.js";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"]), select, input';
const MIN_LEAD_MINUTES = 5;
const CONFLICT_WINDOW_MINUTES = 30;

interface RowState {
  cardId: string;
  network: PublicationCardDto["network"];
  mode: "schedule" | "draft";
  date: Date;
  time: string;
  socialAccountId: string | null;
  conflictWarning: string | null;
}

function defaultDate(): Date {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  d.setHours(10, 0, 0, 0);
  return d;
}

// Drawer de programación (reconciliado con Claude Design "Presencia -
// Chat" / Chat Part 3.html, artboards d1-d6). Un solo <ScheduleDrawer/> vive
// montado en ChatView; su visibilidad depende de schedule-drawer-store, no
// de un useState local por card (F6 PR4).
export function ScheduleDrawer() {
  const cards = useScheduleDrawerStore((s) => s.cards);
  const close = useScheduleDrawerStore((s) => s.close);
  if (!cards) return null;
  return <ScheduleDrawerInner cards={cards} onClose={close} />;
}

function ScheduleDrawerInner({
  cards,
  onClose,
}: {
  cards: PublicationCardDto[];
  onClose: () => void;
}) {
  const { channels } = useChannels();
  const refreshCards = useCardsStore((s) => s.refresh);
  const isBatch = cards.length > 1;
  const [sameTime, setSameTime] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [viewMonth, setViewMonth] = useState(() => {
    const d = defaultDate();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [markers, setMarkers] = useState<Record<string, number>>({});
  const dialogRef = useRef<HTMLDivElement>(null);

  const [rows, setRows] = useState<RowState[]>(() =>
    cards.map((card) => ({
      cardId: card.id,
      network: card.network,
      mode: "schedule",
      date: defaultDate(),
      time: "10:00",
      socialAccountId: null,
      conflictWarning: null,
    })),
  );

  // Auto-selecciona la cuenta si solo hay una activa para esa red.
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

  // Marcadores del mes visible — cards realmente programadas, no datos de muestra.
  useEffect(() => {
    const from = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1).toISOString();
    const to = new Date(
      viewMonth.getFullYear(),
      viewMonth.getMonth() + 1,
      0,
      23,
      59,
      59,
    ).toISOString();
    fetchScheduleConflicts(from, to)
      .then((conflicts) => {
        const counts: Record<string, number> = {};
        for (const c of conflicts) {
          if (!c.scheduledAt) continue;
          const key = dateKey(new Date(c.scheduledAt));
          counts[key] = (counts[key] ?? 0) + 1;
        }
        setMarkers(counts);
      })
      .catch(() => {
        // Los marcadores son una ayuda visual, no bloquean el drawer.
      });
  }, [viewMonth]);

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

  const effectiveRows = useMemo(() => {
    if (!sameTime || rows.length === 0) return rows;
    const [leaderRow] = rows;
    if (!leaderRow) return rows;
    return rows.map((r) => ({ ...r, date: leaderRow.date, time: leaderRow.time }));
  }, [rows, sameTime]);

  async function checkConflict(cardId: string, date: Date, time: string) {
    const combined = combineDateAndTime(date, time);
    if (!combined) return;
    const dayStart = startOfDay(date).toISOString();
    const dayEnd = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      23,
      59,
      59,
    ).toISOString();
    try {
      const conflicts = await fetchScheduleConflicts(dayStart, dayEnd);
      const target = combined.getTime();
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
      // El conflicto es una ayuda, no un bloqueo.
    }
  }

  function handleDateChange(cardId: string, date: Date) {
    updateRow(cardId, { date, conflictWarning: null });
    setViewMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    const row = rows.find((r) => r.cardId === cardId);
    if (row) void checkConflict(cardId, date, row.time);
  }

  function handleTimeChange(cardId: string, time: string) {
    updateRow(cardId, { time, conflictWarning: null });
    const row = rows.find((r) => r.cardId === cardId);
    if (row) void checkConflict(cardId, row.date, time);
  }

  async function handleSubmit() {
    setFormError(null);
    const targetRows = sameTime && rows.length > 0 ? effectiveRows : rows;

    const items = targetRows.map((row) => {
      if (row.mode === "draft") return { cardId: row.cardId, keepDraft: true as const };
      const combined = combineDateAndTime(row.date, row.time);
      return {
        cardId: row.cardId,
        socialAccountId: row.socialAccountId ?? "",
        scheduledAt: combined ? combined.toISOString() : "",
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
      const combined = combineDateAndTime(row.date, row.time);
      return !combined || combined.getTime() < Date.now() + MIN_LEAD_MINUTES * 60_000;
    });
    if (tooSoon) {
      setFormError(`Elige un horario al menos ${MIN_LEAD_MINUTES} minutos en el futuro.`);
      return;
    }

    const [firstCard] = cards;
    if (!firstCard) return;

    setSubmitting(true);
    try {
      await scheduleGroup({ items });
      await refreshCards(firstCard.chatId);
      onClose();
    } catch {
      setFormError("No se pudo programar. Inténtalo de nuevo.");
    } finally {
      setSubmitting(false);
    }
  }

  const displayRows = sameTime ? effectiveRows : rows;
  const [leader] = displayRows;
  const anyReschedule = cards.some((c) => c.status === "scheduled" || c.status === "failed");

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-overlay">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="schedule-drawer-title"
        tabIndex={-1}
        className="flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-line bg-surface shadow-lg outline-none"
      >
        <div className="flex items-start justify-between border-b border-line px-5 py-4">
          <div>
            <h2 id="schedule-drawer-title" className="text-lg font-bold text-fg">
              {anyReschedule ? "Reprogramar publicación" : "Programar publicación"}
            </h2>
            {!isBatch && leader && (
              <p className="mt-0.5 text-xs text-fg-secondary">
                {NETWORK_META[leader.network].label}
              </p>
            )}
          </div>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            className="rounded-md p-1.5 text-fg-muted hover:bg-secondary-hover"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 px-5 py-4">
          <div className="mb-4 flex flex-col gap-2">
            {cards.map((card) => {
              const meta = NETWORK_META[card.network];
              return (
                <div key={card.id} className="rounded-lg border border-line bg-card px-3 py-2.5">
                  <div className="mb-1 flex items-center gap-1.5">
                    <meta.Logo size={13} />
                    <span className="text-xs font-semibold" style={{ color: meta.color }}>
                      {meta.label}
                    </span>
                  </div>
                  <p className="line-clamp-2 text-xs text-fg-secondary">
                    {summarizeCardContent(card.content)}
                  </p>
                </div>
              );
            })}
          </div>

          {isBatch && (
            <div className="mb-4 flex items-center gap-1 rounded-lg bg-tint-plum p-1 text-sm">
              <button
                type="button"
                onClick={() => setSameTime(true)}
                className={`flex-1 rounded-md py-1.5 font-semibold ${sameTime ? "bg-card text-fg shadow-sm" : "text-fg-secondary"}`}
              >
                Mismo horario
              </button>
              <button
                type="button"
                onClick={() => setSameTime(false)}
                className={`flex-1 rounded-md py-1.5 font-semibold ${!sameTime ? "bg-card text-fg shadow-sm" : "text-fg-secondary"}`}
              >
                Personalizar por red
              </button>
            </div>
          )}

          {(!isBatch || sameTime) && leader && (
            <div className="mb-4 flex flex-col gap-3">
              <p className="text-[11px] font-bold tracking-wide text-fg-secondary uppercase">
                ¿Cuándo publicar?
              </p>
              <MiniCalendar
                viewMonth={viewMonth}
                onChangeMonth={setViewMonth}
                selectedDate={leader.date}
                onSelectDate={(d) => handleDateChange(leader.cardId, d)}
                markers={markers}
              />
              <p className="text-[11px] font-bold tracking-wide text-fg-secondary uppercase">
                ¿A qué hora?
              </p>
              <TimeChips
                selectedTime={leader.time}
                onSelectTime={(t) => handleTimeChange(leader.cardId, t)}
              />
              <p className="text-[11px] font-bold tracking-wide text-fg-secondary uppercase">
                Tu semana
              </p>
              <WeekStrip
                selectedDate={leader.date}
                onSelectDate={(d) => handleDateChange(leader.cardId, d)}
                markers={markers}
                hasConflict={leader.conflictWarning !== null}
              />
              {leader.conflictWarning && (
                <p className="text-xs text-warning">⚠ {leader.conflictWarning}</p>
              )}
              {!isBatch &&
                (accountsFor(leader.network).length === 0 ? (
                  <p className="text-xs text-warning">
                    No tienes una cuenta de {NETWORK_META[leader.network].label} conectada.{" "}
                    <Link to="/configuracion/canales" className="underline">
                      Conéctala primero
                    </Link>
                    .
                  </p>
                ) : (
                  accountsFor(leader.network).length > 1 && (
                    <select
                      value={leader.socialAccountId ?? ""}
                      onChange={(e) =>
                        updateRow(leader.cardId, { socialAccountId: e.target.value })
                      }
                      className="rounded-md border border-line bg-card px-2.5 py-2 text-sm text-fg"
                    >
                      <option value="" disabled>
                        Elige la cuenta
                      </option>
                      {accountsFor(leader.network).map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.displayName ?? a.id}
                        </option>
                      ))}
                    </select>
                  )
                ))}
            </div>
          )}

          {isBatch && (
            <div className="flex flex-col gap-3">
              <p className="text-[11px] font-bold tracking-wide text-fg-secondary uppercase">
                Por red
              </p>
              {displayRows.map((row) => (
                <NetworkScheduleRow
                  key={row.cardId}
                  network={row.network}
                  mode={row.mode}
                  onChangeMode={(mode) => updateRow(row.cardId, { mode })}
                  showModeToggle
                  showDateTimePicker={!sameTime}
                  date={row.date}
                  time={row.time}
                  viewMonth={viewMonth}
                  onChangeMonth={setViewMonth}
                  onChangeDate={(d) => handleDateChange(row.cardId, d)}
                  onChangeTime={(t) => handleTimeChange(row.cardId, t)}
                  markers={markers}
                  conflictWarning={sameTime ? null : row.conflictWarning}
                  accounts={accountsFor(row.network)}
                  socialAccountId={row.socialAccountId}
                  onChangeAccount={(id) => updateRow(row.cardId, { socialAccountId: id })}
                />
              ))}
            </div>
          )}

          {formError && <p className="mt-4 text-sm text-error">{formError}</p>}
        </div>

        <div className="flex gap-2 border-t border-line px-5 py-4">
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
