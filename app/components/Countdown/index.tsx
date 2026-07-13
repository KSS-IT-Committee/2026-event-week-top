"use client";
import { useEffect, useState } from "react";

export default function Countdown({ targetDate }: { targetDate: string }) {
  const [time, setTime] = useState("");

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
        const days = Math.floor(sec / 86400);
        const hours = Math.floor((sec % 86400) / 3600);
        const minutes = Math.floor((sec % 3600) / 60);
        const seconds = sec % 60;
        setTime(`${days}d ${hours}h ${minutes}m ${seconds}s`);
        };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  } , [targetDate]);

  return (
    <div className="text-center text-2xl font-bold">
      {time}
    </div>
  );
}