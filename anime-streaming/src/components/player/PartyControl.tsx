"use client";

import { useState } from "react";
import { Copy, LogOut, Users } from "lucide-react";
import IconBtn from "./IconBtn";
import type { PartyMember } from "@/lib/party";
import playerStyles from "./player.module.css";
import styles from "./PartyControl.module.css";

/**
 * "Смотреть вместе": opens a room for this episode and copies the invite link;
 * while in a room, shows who is watching and lets the viewer leave.
 */
export default function PartyControl({
  code,
  link,
  members,
  error,
  onStart,
  onLeave,
  onOpenChange,
}: {
  code: string | null;
  link: string | null;
  members: PartyMember[];
  error: string | null;
  onStart: () => Promise<string | null>;
  onLeave: () => void;
  /** Lets the player keep its controls visible while the panel is open. */
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpenState] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const setOpen = (next: boolean) => {
    setOpenState(next);
    onOpenChange?.(next);
  };

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const toggle = async () => {
    if (open) return setOpen(false);
    setOpen(true);
    if (!code) {
      setBusy(true);
      const invite = await onStart();
      setBusy(false);
      if (invite) await copy(invite);
    }
  };

  return (
    <div className={playerStyles.settingsWrap}>
      <IconBtn label="Смотреть вместе" active={!!code} badge={members.length > 1} onClick={toggle}>
        <Users size={20} />
      </IconBtn>
      {open ? (
        <div className={styles.panel} role="dialog" aria-label="Совместный просмотр">
          <div className={styles.head}>Смотреть вместе</div>
          {busy ? (
            <p className={styles.note}>Создаём комнату…</p>
          ) : error && !code ? (
            <p className={styles.error}>{error}</p>
          ) : code ? (
            <>
              <p className={styles.note}>
                Пауза, перемотка и смена серии синхронизируются у всех в комнате.
              </p>
              {link ? (
                <button type="button" className={styles.action} onClick={() => copy(link)}>
                  <Copy size={15} /> {copied ? "Ссылка скопирована" : "Скопировать приглашение"}
                </button>
              ) : null}
              <div className={styles.subhead}>В комнате: {members.length}</div>
              <ul className={styles.members}>
                {members.map((m) => (
                  <li key={m.userId}>{m.displayName}</li>
                ))}
              </ul>
              <button
                type="button"
                className={`${styles.action} ${styles.leave}`}
                onClick={() => {
                  onLeave();
                  setOpen(false);
                }}
              >
                <LogOut size={15} /> Выйти из комнаты
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
