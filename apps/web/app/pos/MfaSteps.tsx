"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Copy, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@balm/ui";
import { api, type AuthUser, type MfaEnrolment } from "@/lib/api-client";
import { encodeQr, qrPath } from "@/lib/qr";

/**
 * The second step of staff sign-in for admins and managers (PCI DSS 8.4.2):
 * a code from an authenticator app, or setting one up on first sign-in. Both
 * work from the short-lived challenge the password step returned; the session
 * only exists once a code is accepted.
 */

export const LABEL =
  "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]";
export const INPUT =
  "mb-4 h-10 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-3 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus-visible:border-[var(--color-border-focus)] focus-visible:outline-none";
const CODE_INPUT = `${INPUT} text-center font-mono text-lg tracking-[0.4em]`;
export const CARD =
  "rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-6 shadow-[var(--shadow-xl)]";
const HINT = "mb-4 text-sm text-[var(--color-text-secondary)]";

const message = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);
// Six digits, however they were pasted ("123 456", "123-456").
const digitsOnly = (s: string) => s.replace(/\D/g, "").slice(0, 6);

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="mt-4 inline-flex items-center gap-1.5 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:underline"
    >
      <ArrowLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden />
      Back to sign-in
    </button>
  );
}

function SixDigitField({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  return (
    <>
      <label htmlFor={id} className={LABEL}>
        6-digit code
      </label>
      <input
        id={id}
        name="one-time-code"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={7}
        value={value}
        onChange={(e) => onChange(digitsOnly(e.target.value))}
        placeholder="123456"
        className={CODE_INPUT}
        aria-describedby={`${id}-hint`}
        autoFocus
        required
      />
    </>
  );
}

/** Sign-in, second step: the current code, or one of the recovery codes. */
export function CodeStep({
  challenge,
  onDone,
  onBack,
}: {
  challenge: string;
  onDone: (token: string, user: AuthUser) => void;
  onBack: () => void;
}) {
  const [useRecovery, setUseRecovery] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { token, user } = await api.mfaVerify(challenge, code.trim());
      onDone(token, user);
    } catch (err) {
      setError(message(err, "That code didn't work."));
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className={CARD} aria-labelledby="mfa-code-title">
      <h1 id="mfa-code-title" className="mb-2 flex items-center gap-2 font-display text-lg font-bold text-[var(--color-text-primary)]">
        <ShieldCheck className="h-5 w-5 text-[var(--color-text-brand)]" strokeWidth={1.75} aria-hidden />
        Two-step sign-in
      </h1>
      {useRecovery ? (
        <>
          <p id="mfa-recovery-hint" className={HINT}>
            Type one of the recovery codes you saved when you set up two-step sign-in. Each works once.
          </p>
          <label htmlFor="mfa-recovery" className={LABEL}>
            Recovery code
          </label>
          <input
            id="mfa-recovery"
            type="text"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            value={code}
            onChange={(e) => setCode(e.target.value.slice(0, 24))}
            placeholder="abcd-efgh-ijkl-mnop"
            className={`${INPUT} font-mono`}
            aria-describedby="mfa-recovery-hint"
            autoFocus
            required
          />
        </>
      ) : (
        <>
          <p id="mfa-code-hint" className={HINT}>
            Open your authenticator app and enter the code it shows for Bay Area Landscaping Materials.
          </p>
          <SixDigitField id="mfa-code" value={code} onChange={setCode} />
        </>
      )}

      {error && (
        <p role="alert" className="mb-3 text-sm text-[var(--color-danger)]">
          {error}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={busy || (!useRecovery && code.length !== 6)}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <KeyRound className="h-4 w-4" strokeWidth={1.75} aria-hidden />}
        {busy ? "Checking…" : "Verify"}
      </Button>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <BackButton onBack={onBack} />
        <button
          type="button"
          onClick={() => {
            setUseRecovery((r) => !r);
            setCode("");
            setError(null);
          }}
          className="mt-4 text-sm text-[var(--color-text-brand)] hover:underline"
        >
          {useRecovery ? "Use the authenticator code" : "Use a recovery code"}
        </button>
      </div>
    </form>
  );
}

/** The otpauth:// link as a QR code, drawn here: the secret never goes to a QR service. */
function QrCode({ value, label }: { value: string; label: string }) {
  const { path, size } = useMemo(() => {
    const m = encodeQr(value);
    return { path: qrPath(m, 4), size: m.length + 8 };
  }, [value]);
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
      // Dark on white in both themes: scanners need the contrast and the quiet zone.
      className="mx-auto mb-4 h-48 w-48 rounded-[var(--radius-md)] bg-white"
    >
      <rect width={size} height={size} fill="#ffffff" />
      <path d={path} fill="#000000" />
    </svg>
  );
}

/** First sign-in of an admin or manager: set up an authenticator app, then save the recovery codes. */
export function EnrolStep({
  challenge,
  onDone,
  onBack,
}: {
  challenge: string;
  onDone: (token: string, user: AuthUser) => void;
  onBack: () => void;
}) {
  const [setup, setSetup] = useState<MfaEnrolment | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ token: string; user: AuthUser; recoveryCodes: string[] } | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .mfaEnrol(challenge)
      .then((s) => alive && setSetup(s))
      .catch((err) => alive && setError(message(err, "Couldn't start the setup. Sign in again.")));
    return () => {
      alive = false;
    };
  }, [challenge]);

  const confirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setSaved(await api.mfaConfirmEnrolment(challenge, code));
      setSetup(null); // the secret leaves the screen as soon as it is confirmed
    } catch (err) {
      setError(message(err, "That code didn't work."));
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  if (saved) return <RecoveryCodes codes={saved.recoveryCodes} onContinue={() => onDone(saved.token, saved.user)} />;

  // The key in groups of four, as authenticator apps show it.
  const key = setup?.secret.replace(/(.{4})/g, "$1 ").trim();

  return (
    <form onSubmit={confirm} className={CARD} aria-labelledby="mfa-enrol-title">
      <h1 id="mfa-enrol-title" className="mb-2 flex items-center gap-2 font-display text-lg font-bold text-[var(--color-text-primary)]">
        <ShieldCheck className="h-5 w-5 text-[var(--color-text-brand)]" strokeWidth={1.75} aria-hidden />
        Set up two-step sign-in
      </h1>
      <p className={HINT}>
        Admin and manager accounts need a code from an authenticator app (Google Authenticator, Microsoft
        Authenticator, 1Password…) as well as the password. Scan this code with the app on your phone.
      </p>

      {setup ? (
        <>
          <QrCode value={setup.otpauthUri} label={`QR code to add ${setup.account} to an authenticator app`} />
          <details className="mb-4 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-3 py-2 text-sm">
            <summary className="cursor-pointer text-[var(--color-text-secondary)]">Can&apos;t scan it? Type the key instead</summary>
            <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
              Account {setup.account}, time-based, 6 digits:
            </p>
            <p className="mt-1 select-all break-all font-mono text-sm text-[var(--color-text-primary)]" aria-label="Setup key">
              {key}
            </p>
          </details>
          <p id="mfa-enrol-code-hint" className={HINT}>
            Then enter the 6-digit code the app shows.
          </p>
          <SixDigitField id="mfa-enrol-code" value={code} onChange={setCode} />
        </>
      ) : (
        !error && (
          <p className="mb-4 flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Preparing…
          </p>
        )
      )}

      {error && (
        <p role="alert" className="mb-3 text-sm text-[var(--color-danger)]">
          {error}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={busy || !setup || code.length !== 6}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" strokeWidth={1.75} aria-hidden />}
        {busy ? "Checking…" : "Turn on two-step sign-in"}
      </Button>
      <BackButton onBack={onBack} />
    </form>
  );
}

/** The ten recovery codes, shown this once. */
function RecoveryCodes({ codes, onContinue }: { codes: string[]; onContinue: () => void }) {
  const [ack, setAck] = useState(false);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className={CARD} role="region" aria-labelledby="mfa-recovery-title">
      <h1 id="mfa-recovery-title" className="mb-2 flex items-center gap-2 font-display text-lg font-bold text-[var(--color-text-primary)]">
        <ShieldCheck className="h-5 w-5 text-[var(--color-text-brand)]" strokeWidth={1.75} aria-hidden />
        Save your recovery codes
      </h1>
      <p className={HINT}>
        If you lose your phone, each of these signs you in once instead of a code. They are shown only now: write them
        down or keep them in a password manager, not on this computer.
      </p>
      <ol className="mb-4 grid grid-cols-2 gap-x-4 gap-y-1 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-3 font-mono text-sm text-[var(--color-text-primary)]">
        {codes.map((c) => (
          <li key={c} className="select-all">
            {c}
          </li>
        ))}
      </ol>
      <Button type="button" variant="secondary" className="mb-4 w-full" onClick={() => void copy()}>
        <Copy className="h-4 w-4" strokeWidth={1.75} aria-hidden />
        {copied ? "Copied" : "Copy codes"}
      </Button>
      <label className="mb-4 flex items-start gap-2 text-sm text-[var(--color-text-primary)]">
        <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5 h-4 w-4" />
        I have saved these codes somewhere safe.
      </label>
      <Button type="button" className="w-full" disabled={!ack} onClick={onContinue}>
        Continue to the POS
      </Button>
    </div>
  );
}
