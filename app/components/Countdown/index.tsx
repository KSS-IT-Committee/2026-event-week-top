"use client";
import { useEffect, useState } from "react";
import styles from "./countdown.module.css";

export default function Countdown({ targetDate }: { targetDate: string }) {
  const [days, setDays] = useState(0);
  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(0);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const targetData = new Date(targetDate);

    const update = () => {
      const now = new Date();
      const diff = targetData.getTime() - now.getTime();

      if (diff <= 0) {
        setDays(0);
        setHours(0);
        setMinutes(0);
        setSeconds(0);
        return "行事週間スタート!!";
      }

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
      <div className={styles.box}>
        <strong>{days}</strong>
        <span>日</span>
      </div>
      <div className={styles.box}>
        <strong>{hours}</strong>
        <span>時間</span>
      </div>
      <div className={styles.box}>
        <strong>{minutes}</strong>
        <span>分</span>
      </div>
      <div className="box">
        <strong>{seconds}</strong>
        <span>秒</span>
      </div>
    </div>
  );
}
