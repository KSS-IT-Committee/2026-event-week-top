"use client";
import { useEffect, useState } from "react";

export default function Countdown({ targetDate }: { targetDate: string }) {
  const [weeks, setWeeks] = useState(0);
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
        setWeeks(0);
        setDays(0);
        setHours(0);
        setMinutes(0);
        setSeconds(0);
        return;
      }

      const sec = Math.floor(diff / 1000);
      const weeksVal = Math.floor(sec / 604800);
      const secAfterWeeks = sec % 604800;
      const daysVal = Math.floor(secAfterWeeks / 86400);
      const secAfterDays = secAfterWeeks % 86400;
      const hoursVal = Math.floor(secAfterDays / 3600);
      const secAfterHours = secAfterDays % 3600;
      const minutesVal = Math.floor(secAfterHours / 60);
      const secondsVal = secAfterHours % 60;
      setWeeks(weeksVal);
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
    <div className="flex gap-4 text-center text-2xl font-bold">
      <div>{days}日</div>
      <div>{hours}時間</div>
      <div>{minutes}分</div>
      <div>{seconds}秒</div>
    </div>
  );
}
