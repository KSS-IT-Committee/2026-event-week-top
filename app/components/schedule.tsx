"use client";

import { useEffect, useRef, useState } from "react";

import styles from "./schedule.module.css";

export type ScheduleItem = {
  label: string;
  date: string;
  muted?: boolean;
};

type ScheduleProps = {
  items: ScheduleItem[];
  subject?: string;
};

type ParsedDate = { y: string; m: string; d: string };

function parseDate(date: string): ParsedDate | null {
  const match = date.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (!match) return null;
  return {
    y: match[1],
    m: match[2].padStart(2, "0"),
    d: match[3].padStart(2, "0"),
  };
}

function formatYmd(p: ParsedDate) {
  return `${p.y}${p.m}${p.d}`;
}

function nextDayYmd(p: ParsedDate) {
  const next = new Date(Date.UTC(Number(p.y), Number(p.m) - 1, Number(p.d) + 1));
  const y = next.getUTCFullYear();
  const m = String(next.getUTCMonth() + 1).padStart(2, "0");
  const d = String(next.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function googleCalendarUrl(title: string, p: ParsedDate) {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${formatYmd(p)}/${nextDayYmd(p)}`,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function buildIcs(title: string, p: ParsedDate) {
  const start = formatYmd(p);
  const end = nextDayYmd(p);
  const dtstamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+/, "");
  const uid = `${start}-${Math.random().toString(36).slice(2, 10)}@event-week-2026`;
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//KSS Event Week 2026//JP",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    `SUMMARY:${title}`,
    `DTSTART;VALUE=DATE:${start}`,
    `DTEND;VALUE=DATE:${end}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

function downloadIcs(title: string, p: ParsedDate) {
  const blob = new Blob([buildIcs(title, p)], {
    type: "text/calendar;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function Schedule({ items, subject }: ScheduleProps) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const rootRef = useRef<HTMLDListElement>(null);

  useEffect(() => {
    if (openKey === null) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpenKey(null);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenKey(null);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [openKey]);

  return (
    <dl className={styles.schedule} ref={rootRef}>
      {items.map(({ label, date, muted }) => {
        const key = `${label}-${date}`;
        const parsed = parseDate(date);
        const title = subject ? `${subject} ${label}` : label;
        const isOpen = openKey === key;

        return (
          <div
            key={key}
            className={`${styles.row}${muted ? ` ${styles.muted}` : ""}`}
          >
            <dt className={styles.label}>{label}</dt>
            <dd className={styles.date}>
              {parsed ? (
                <button
                  type="button"
                  className={styles.dateButton}
                  aria-expanded={isOpen}
                  aria-haspopup="menu"
                  onClick={() => setOpenKey(isOpen ? null : key)}
                >
                  {date}
                </button>
              ) : (
                date
              )}
              {isOpen && parsed && (
                <div className={styles.popover} role="menu">
                  <a
                    className={styles.popoverItem}
                    href={googleCalendarUrl(title, parsed)}
                    target="_blank"
                    rel="noopener noreferrer"
                    role="menuitem"
                    onClick={() => setOpenKey(null)}
                  >
                    Google カレンダーに追加
                  </a>
                  <button
                    type="button"
                    className={styles.popoverItem}
                    role="menuitem"
                    onClick={() => {
                      downloadIcs(title, parsed);
                      setOpenKey(null);
                    }}
                  >
                    .ics をダウンロード
                  </button>
                </div>
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
