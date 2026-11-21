"use client";

import { useActionState, useEffect, useRef } from "react";
import { Submit } from "@/components/Submit";
import { requestCode, submitCode, type LoginState } from "./actions";

export function LoginForm() {
  const [reqState, reqAction] = useActionState<LoginState, FormData>(requestCode, { step: "email" });
  const [codeState, codeAction] = useActionState<LoginState, FormData>(submitCode, { step: "code" });
  const codeRef = useRef<HTMLInputElement>(null);
  const onCode = reqState.step === "code";
  const email = reqState.email ?? "";

  useEffect(() => {
    if (onCode) codeRef.current?.focus();
  }, [onCode, reqState]);

  if (!onCode) {
    return (
      <form action={reqAction} className="form" noValidate>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" className="input" autoComplete="email" required defaultValue={email} autoFocus />
        </div>
        {reqState.error && (
          <p className="flash" data-kind="error" role="alert">
            {reqState.error}
          </p>
        )}
        <Submit pending="Sending code…">Email me a sign-in code</Submit>
      </form>
    );
  }

  return (
    <div className="form">
      <p className="hint" role="status">
        {reqState.notice}
      </p>
      <form action={codeAction} className="form">
        <input type="hidden" name="email" value={email} />
        <div className="field">
          <label htmlFor="code">6-digit code</label>
          <input
            ref={codeRef}
            id="code"
            name="code"
            className="input code-input"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]{6,7}"
            maxLength={7}
            required
          />
        </div>
        {codeState.error && (
          <p className="flash" data-kind="error" role="alert">
            {codeState.error}
          </p>
        )}
        <Submit pending="Checking…">Sign in</Submit>
      </form>
      <form action={reqAction}>
        <input type="hidden" name="email" value={email} />
        <p className="hint">
          No email after a minute? Check spam, or <button className="linkish" type="submit">send a new code</button>.
        </p>
      </form>
    </div>
  );
}
