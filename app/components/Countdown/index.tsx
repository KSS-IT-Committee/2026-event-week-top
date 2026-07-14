"use client";
import { useEffect, useState } from "react";

import styles from "./countdown.module.css";

export default function Countdown({
  title,
  startedTitle,
  targetDate,
}: {
  title: string;
  startedTitle: string;
  targetDate: string;
}) {
  const [days, setDays] = useState(0);
  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [isStarted, setIsStarted] = useState(false);

  useEffect(() => {
    const targetData = new Date(targetDate);

    const update = () => {
      const now = new Date();
      const diff = targetData.getTime() - now.getTime();

      if (diff <= 0) {
        setIsStarted(true);
        return;
      }
      setIsStarted(false);

      const sec = Math.floor(diff / 1000);
      const daysVal = Math.floor(sec / 86400);
      const secAfterDays = sec % 86400;
      const hoursVal = Math.floor(secAfterDays / 3600);
      const secAfterHours = secAfterDays % 3600;
      const minutesVal = Math.floor(secAfterHours / 60);
      const secondsVal = secAfterHours % 60;
      setDays(daysVal);
      setHours(hoursVal);
      setMinutes(minutesVal);
      setSeconds(secondsVal);
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [targetDate]);

  return (
    <div className={styles.countdown}>
      <div className={styles.title}>{isStarted ? startedTitle : title}</div>
      {!isStarted && (
        <>
          <div className={styles.item}>
            <span className={styles.number}>{days}</span>日
          </div>
          <div className={styles.item}>
            <span className={styles.number}>{hours}</span>時間
          </div>
          <div className={styles.item}>
            <span className={styles.number}>{minutes}</span>分
          </div>
          <div className={styles.item}>
            <span className={styles.number}>{seconds}</span>秒
          </div>
        </>
      )}
    </div>
  );
}
