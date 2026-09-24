"use client";

import { useId, useState, type ReactNode } from "react";
import { AlertCircle, Check, Eye, EyeOff } from "lucide-react";
import styles from "@/app/(auth)/auth.module.css";

/**
 * Auth text field with a floating label and live validation.
 *
 * Validation only speaks up once the field has been left (or the form has been
 * submitted) — nagging a half-typed email is the classic sign-up annoyance.
 * The value is lifted so the sign-up page can drive the strength meter, and
 * Caps Lock is surfaced on password fields because a hidden value plus a stuck
 * Caps Lock is the single most common "wrong password" that isn't.
 */
export default function Field({
  id,
  label,
  type = "text",
  icon,
  placeholder,
  autoComplete,
  required = true,
  value,
  onValueChange,
  validate,
  hint,
}: {
  id: string;
  label: string;
  type?: string;
  icon: ReactNode;
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
  value?: string;
  onValueChange?: (value: string) => void;
  /** Returns an error message, or null when the value is acceptable. */
  validate?: (value: string) => string | null;
  hint?: ReactNode;
}) {
  const [show, setShow] = useState(false);
  const [inner, setInner] = useState("");
  const [touched, setTouched] = useState(false);
  const [focused, setFocused] = useState(false);
  const [caps, setCaps] = useState(false);
  const errorId = useId();

  const current = value ?? inner;
  const isPassword = type === "password";
  const error = touched && validate ? validate(current) : null;
  const valid = touched && !error && current.length > 0;

  return (
    <div
      className={styles.field}
      data-state={error ? "error" : valid ? "valid" : focused ? "focus" : "idle"}
    >
      <div className={styles.inputWrap}>
        <span className={styles.inputIcon}>{icon}</span>
        <input
          id={id}
          name={id}
          type={isPassword && show ? "text" : type}
          className={`${styles.input}${isPassword ? ` ${styles.inputWithEye}` : ""}`}
          /* A single space keeps `:placeholder-shown` meaningful: with no
             placeholder attribute at all the selector never matches, and the
             floating label would sit raised over an empty field. */
          placeholder={placeholder ?? " "}
          autoComplete={autoComplete}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          value={current}
          onChange={(e) => {
            const next = e.target.value;
            if (value === undefined) setInner(next);
            onValueChange?.(next);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            setTouched(true);
            setCaps(false);
          }}
          onKeyUp={(e) => isPassword && setCaps(e.getModifierState("CapsLock"))}
        />

        {/* Floating label: sits in the field until it holds a value or focus. */}
        <label className={styles.label} htmlFor={id}>
          {label}
          {required ? null : <span className={styles.optional}>optional</span>}
        </label>

        {isPassword ? (
          <button
            type="button"
            className={styles.eyeBtn}
            onClick={() => setShow((v) => !v)}
            aria-label={show ? "Hide password" : "Show password"}
          >
            {show ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        ) : valid ? (
          <span className={styles.validMark} aria-hidden="true">
            <Check size={16} />
          </span>
        ) : null}

        {/* Animated underline that tracks the field state. */}
        <span className={styles.fieldGlow} aria-hidden="true" />
      </div>

      {caps ? (
        <p className={styles.capsHint}>
          <AlertCircle size={13} /> Caps Lock is on
        </p>
      ) : null}

      {error ? (
        <p className={styles.fieldError} id={errorId} role="alert">
          <AlertCircle size={13} /> {error}
        </p>
      ) : null}

      {/* The hint stays visible even while the field is invalid — the password
          checklist is precisely what the user needs at that moment. */}
      {hint}
    </div>
  );
}
