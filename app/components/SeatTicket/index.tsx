import Image from "next/image";

import styles from "./SeatTicket.module.css";

type SeatTicketProps = {
  performance: string;
  seat: string | null;
};

export function SeatTicket({ performance, seat }: SeatTicketProps) {
  const hasSeat = seat !== null;

  return (
    <article
      className={`${styles.ticket} ${hasSeat ? "" : styles.ticketUnissued}`}
    >
      <div className={styles.body}>
        <Image
          className={styles.logo}
          src="/images/geinousai-logo.png"
          alt=""
          width={720}
          height={623}
          preload
        />
        <div className={styles.info}>
          <p className={styles.event}>2026年度行事週間</p>
          <p className={styles.performance}>
            <span className={styles.performanceLetter}>{performance}</span>
            公演
          </p>
          <dl className={styles.seat}>
            <dt className={styles.seatLabel}>座席</dt>
            <dd className={styles.seatValue}>{hasSeat ? seat : "未発券"}</dd>
          </dl>
        </div>
      </div>
      <div className={styles.stub}>
        <p className={styles.stubLabel}>ADMIT ONE</p>
        <p className={styles.stubPerformance}>{performance}</p>
        <p className={styles.stubSeat}>{hasSeat ? seat : "—"}</p>
        <span className={styles.barcode} aria-hidden="true" />
      </div>
    </article>
  );
}
