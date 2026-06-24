"use client";

import { useActionState } from "react";

import { changePasswordAction, type ChangePasswordFormState } from "./actions";
import styles from "./login.module.css";

const INITIAL_STATE: ChangePasswordFormState = { error: null, success: false };

type ChangePasswordFormProps = {
  // The app the user came from (the `next` carried by AccountNav). Offered as a
  // return link once the change succeeds, so a flow started on another app can
  // go back to it.
  next?: string;
};

export function ChangePasswordForm({ next }: ChangePasswordFormProps) {
  const [state, formAction, isPending] = useActionState(
    changePasswordAction,
    INITIAL_STATE,
  );

  return (
    <form action={formAction} className={styles.form}>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="current-password">
          現在のパスワード
        </label>
        <input
          id="current-password"
          className={styles.input}
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="new-password">
          新しいパスワード
        </label>
        <input
          id="new-password"
          className={styles.input}
          name="newPassword"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="confirm-password">
          新しいパスワード（確認）
        </label>
        <input
          id="confirm-password"
          className={styles.input}
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>
      {state.error !== null && (
        <p className={styles.error} role="alert">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className={styles.success} role="status">
          パスワードを変更しました。他の端末からはログアウトされました。
        </p>
      )}
      {state.success && next !== undefined && (
        <a className={styles.returnLink} href={next}>
          元のページに戻る
        </a>
      )}
      <button className={styles.button} type="submit" disabled={isPending}>
        {isPending ? "変更中…" : "パスワードを変更"}
      </button>
    </form>
  );
}
