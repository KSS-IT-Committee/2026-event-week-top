"use client";

import { useActionState } from "react";

import { loginAction, type LoginFormState } from "./actions";
import styles from "./login.module.css";

const INITIAL_STATE: LoginFormState = { error: null };

type LoginFormProps = {
  next?: string;
};

export function LoginForm({ next }: LoginFormProps) {
  const [state, formAction, isPending] = useActionState(
    loginAction,
    INITIAL_STATE,
  );

  return (
    <form action={formAction} className={styles.form}>
      {next !== undefined && <input type="hidden" name="next" value={next} />}
      <div className={styles.field}>
        <label className={styles.label} htmlFor="login-username">
          ユーザー名
        </label>
        <input
          id="login-username"
          className={styles.input}
          name="username"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={8}
          placeholder="例: 1A01"
          required
        />
      </div>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="login-password">
          パスワード
        </label>
        <input
          id="login-password"
          className={styles.input}
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      {state.error !== null && (
        <p className={styles.error} role="alert">
          {state.error}
        </p>
      )}
      <button className={styles.button} type="submit" disabled={isPending}>
        {isPending ? "ログイン中…" : "ログイン"}
      </button>
    </form>
  );
}
