import styles from "./NoScriptAlert.module.css";

export function NoScriptAlert() {
  return (
    <noscript>
      <div className={styles.overlay}>
        <div role="alert" className={styles.alert}>
          JavaScriptが無効になっています。このサイトのすべての機能を利用するには、JavaScriptを有効にしてください。
        </div>
      </div>
    </noscript>
  );
}
