"use client";

import { Check, X } from "lucide-react";
import styles from "@/app/(auth)/auth.module.css";

/**
 * Live password feedback for the sign-up form.
 *
 * The score is deliberately behaviour-based rather than a vanity meter: it
 * rewards length far more than symbol soup (a 16-character passphrase beats
 * `P@ss1!`), and it refuses to call anything strong while it still matches an
 * obvious pattern. The rule list mirrors what the backend actually enforces
 * (12 characters minimum, plus the breach check it runs server-side), so the
 * form never promises something the API will then reject.
 */

export interface PasswordRule {
  label: string;
  ok: boolean;
}

const SEQUENCES = /(0123|1234|2345|3456|4567|5678|6789|abcd|bcde|qwer|asdf|zxcv)/i;
const REPEATS = /(.)\1{2,}/;
const COMMON = /(password|anime|qwerty|letmein|welcome|admin|naruto|dragon|monkey)/i;

const LABELS = ["Too short", "Weak", "Fair", "Good", "Strong"] as const;

export function passwordRules(value: string): PasswordRule[] {
  return [
    { label: "At least 12 characters", ok: value.length >= 12 },
    { label: "Upper and lower case", ok: /[a-z]/.test(value) && /[A-Z]/.test(value) },
    { label: "A number or symbol", ok: /[\d\W_]/.test(value) },
    {
      label: "No obvious pattern",
      ok: value.length > 0 && !SEQUENCES.test(value) && !REPEATS.test(value) && !COMMON.test(value),
    },
  ];
}

/** 0–4. Length carries the score; the rules gate the top of the range. */
export function passwordScore(value: string): number {
  if (!value) return 0;
  const rules = passwordRules(value);
  const passed = rules.filter((r) => r.ok).length;
  const lengthPoints = value.length >= 20 ? 2 : value.length >= 16 ? 1 : 0;
  const raw = Math.min(4, passed + lengthPoints);
  // Never advertise "Strong" while a rule is still failing.
  return passed < rules.length ? Math.min(raw, 2) : raw;
}

export default function PasswordStrength({ value }: { value: string }) {
  const rules = passwordRules(value);
  const score = passwordScore(value);

  return (
    <div className={styles.strength} aria-live="polite">
      <div className={styles.strengthBar} data-score={score}>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={styles.strengthSeg} data-on={i < score} />
        ))}
      </div>
      <span className={styles.strengthLabel} data-score={score}>
        {value ? LABELS[score] : "Password strength"}
      </span>

      <ul className={styles.rules}>
        {rules.map((rule) => (
          <li key={rule.label} className={styles.rule} data-ok={rule.ok}>
            <span className={styles.ruleIcon}>
              {rule.ok ? <Check size={13} /> : <X size={13} />}
            </span>
            {rule.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
