"use client";

import { useActionState } from "react";

import { logoutAction, type LogoutFormState } from "./actions";
import styles from "./login.module.css";

const INITIAL_STATE: LogoutFormState = { error: null };

type LogoutFormProps = {
  next?: string;
};

export function LogoutForm({ next }: LogoutFormProps) {
  const [state, formAction, isPending] = useActionState(
    logoutAction,
    INITIAL_STATE,
  );

  return (
    <form action={formAction}>
      {next !== undefined && <input type="hidden" name="next" value={next} />}
      {state.error !== null && (
        <p className={styles.error} role="alert">
          {state.error}
        </p>
      )}
      <button
        className={styles.logoutButton}
        type="submit"
        disabled={isPending}
      >
        {isPending ? "ログアウト中…" : "ログアウト"}
      </button>
    </form>
  );
}
