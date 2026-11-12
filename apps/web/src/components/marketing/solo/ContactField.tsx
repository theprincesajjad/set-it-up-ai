"use client";

/**
 * An email address, or a Canadian mobile number: 10 digits, with or without +1, spaces, dots, dashes or brackets. The same two shapes
 * the sign-up reads from ?contact= (lib/marketing/signupPrefill.ts).
 */
export const CONTACT_PATTERN = String.raw`\s*([^\s@<>]+@[^\s@<>]+\.[^\s@<>]+|(\+?1[\s.\-]?)?\(?\d\d\d\)?[\s.\-]?\d\d\d[\s.\-]?\d\d\d\d)\s*`;

/**
 * The start form's "Email or mobile" box. The form is a plain GET that works before any script loads, so the check is the browser's own
 * (`pattern`): a value that is neither stops the submit, focus goes to the box and the browser shows `error` (from `title` without
 * script; as the whole message once this has hydrated).
 */
export function ContactField({ hintId, error }: { hintId: string; error: string }) {
  return (
    <input
      type="text"
      name="contact"
      required
      maxLength={254}
      autoComplete="email"
      inputMode="email"
      pattern={CONTACT_PATTERN}
      title={error}
      aria-describedby={hintId}
      onInvalid={(e) => e.currentTarget.setCustomValidity(e.currentTarget.validity.patternMismatch ? error : "")}
      onInput={(e) => e.currentTarget.setCustomValidity("")}
    />
  );
}
