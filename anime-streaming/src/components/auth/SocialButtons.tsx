"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { AppleIcon, GoogleIcon, MicrosoftIcon } from "./BrandIcons";
import { socialNonce, socialProviders, type SocialProvider } from "@/lib/auth-client";
import styles from "@/app/(auth)/auth.module.css";

/**
 * Federated sign-in buttons.
 *
 * Only providers the server can actually verify are offered — the availability
 * list comes from `/auth/social/providers`, which reports a provider as enabled
 * solely when its client id is configured. A provider without one renders as a
 * disabled button with an explanation instead of a control that would fail.
 *
 * Google runs through Google Identity Services: the library is loaded on demand,
 * given a server-issued single-use nonce, and returns a signed ID token that the
 * backend verifies (signature, issuer, audience, expiry, nonce, email_verified).
 * The browser never asserts who the user is; it only carries the provider's
 * signed statement.
 */

const PROVIDERS = [
  { id: "google", label: "Google", Icon: GoogleIcon },
  { id: "microsoft", label: "Microsoft", Icon: MicrosoftIcon },
  { id: "apple", label: "Apple", Icon: AppleIcon },
] as const;

export type Provider = SocialProvider;

const GSI_SRC = "https://accounts.google.com/gsi/client";

interface GoogleCredentialResponse {
  credential?: string;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: GoogleCredentialResponse) => void;
            nonce?: string;
            ux_mode?: "popup" | "redirect";
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
          }) => void;
          prompt: () => void;
          cancel: () => void;
        };
      };
    };
  }
}

function loadScript(src: string): Promise<void> {
  const { promise, resolve, reject } = Promise.withResolvers<void>();
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
  if (existing) {
    if (existing.dataset.loaded === "true") resolve();
    else {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("load failed")), { once: true });
    }
    return promise;
  }
  const el = document.createElement("script");
  el.src = src;
  el.async = true;
  el.defer = true;
  el.addEventListener("load", () => {
    el.dataset.loaded = "true";
    resolve();
  });
  el.addEventListener("error", () => reject(new Error("load failed")));
  document.head.appendChild(el);
  return promise;
}

export default function SocialButtons({
  onCredential,
  disabled = false,
  onError,
}: {
  /** Called with the provider's signed ID token and the nonce it was bound to. */
  onCredential: (provider: Provider, idToken: string, nonce: string) => void;
  disabled?: boolean;
  onError?: (message: string) => void;
}) {
  const [available, setAvailable] = useState<Record<string, boolean>>({});
  const [pending, setPending] = useState<Provider | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    socialProviders().then((list) => {
      if (mounted.current) setAvailable(list);
    });
    return () => {
      mounted.current = false;
    };
  }, []);

  const startGoogle = useCallback(async () => {
    setPending("google");
    try {
      const nonce = await socialNonce();
      await loadScript(GSI_SRC);
      const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
      if (!window.google || !clientId) throw new Error("unavailable");
      window.google.accounts.id.initialize({
        client_id: clientId,
        // The nonce travels into the signed token; the server checks it there.
        nonce,
        ux_mode: "popup",
        auto_select: false,
        cancel_on_tap_outside: true,
        callback: (response) => {
          if (!mounted.current) return;
          setPending(null);
          if (!response.credential) {
            onError?.("Вход через Google отменён.");
            return;
          }
          onCredential("google", response.credential, nonce);
        },
      });
      window.google.accounts.id.prompt();
    } catch {
      if (!mounted.current) return;
      setPending(null);
      onError?.("Вход через Google сейчас недоступен.");
    }
  }, [onCredential, onError]);

  return (
    <div className={styles.social}>
      {PROVIDERS.map(({ id, label, Icon }) => {
        const enabled = available[id] === true;
        return (
          <button
            key={id}
            type="button"
            className={styles.socialBtn}
            onClick={() => (id === "google" ? startGoogle() : undefined)}
            disabled={disabled || !enabled || pending !== null || id !== "google"}
            aria-label={
              enabled && id === "google"
                ? `Продолжить с ${label}`
                : `Вход через ${label} не настроен на этом сервере`
            }
            title={
              enabled && id === "google" ? undefined : `Вход через ${label} здесь недоступен`
            }
          >
            {pending === id ? <Loader2 size={18} className={styles.spinInline} /> : <Icon />}
            <span className={styles.socialLabel}>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
