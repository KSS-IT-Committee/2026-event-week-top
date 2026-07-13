"use client";
import { useEffect, useState } from "react";

export default function Countdown({ targetDate }: { targetDate: string }) {
  const [time, setTime] = useState("");
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
        setTime("行事週間スタート‼");
        return;
      }
      const sec = Math.floor(diff / 1000);
      const weeks = Math.floor(sec / 604800);
      const secAfterWeeks = sec % 604800;
      const days = Math.floor(secAfterWeeks / 86400);
      const secAfterDays = secAfterWeeks % 86400;
      const hours = Math.floor(secAfterDays / 3600);
      const secAfterHours = secAfterDays % 3600;
      const minutesVal = Math.floor(secAfterHours / 60);
      const secondsVal = secAfterHours % 60;
      setWeeks(weeks);
      setDays(days);
      setHours(hours);
      setMinutes(minutesVal);
      setSeconds(secondsVal);
      setTime(
        `${weeks}週間 ${days}日 ${hours}時間 ${minutesVal}分 ${secondsVal}秒`,
      );
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [targetDate]);

  return (
    <div className="text-center text-2xl font-bold">
      <div className="mb-4">{time}</div>
    </div>
  );
}
