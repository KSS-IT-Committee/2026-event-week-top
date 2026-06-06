"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

type EasterState = {
  id: number;
  bottom: number;
  right: number;
  isMoving: boolean;
};

export function Easter() {
  const [activeItems, setActiveItems] = useState<EasterState[]>([]);
  const splitIdRef = useRef(1_000_000);
  const idCounterRef = useRef(0);
  const [windowWidth, setWindowWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 0,
  );
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  useEffect(() => {
    const Konami: string[] = [
      "ArrowUp",
      "ArrowUp",
      "ArrowDown",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "ArrowLeft",
      "ArrowRight",
      "b",
      "a",
    ];
    let input: string[] = [];
    let touchStartX: number = 0;
    let touchStartY: number = 0;
    let touchEndX: number = 0;
    let touchEndY: number = 0;
    let tapCount: number = 0;
    let tapTimer: ReturnType<typeof setTimeout> | null = null;

    const triggerEaster = () => {
      const newId = idCounterRef.current++;
      const newBottom = Math.floor(Math.random() * 250) + 50;
      const animDuration = Math.max(2, (window.innerWidth / 1000) * 4);

      setActiveItems((prev) => [
        ...prev,
        {
          id: newId,
          bottom: newBottom,
          right: -150,
          isMoving: false,
        } as EasterState,
      ]);

      // Start animation after a short delay
      setTimeout(() => {
        setActiveItems((prev) =>
          prev.map((item) =>
            item.id === newId ? { ...item, isMoving: true } : item,
          ),
        );
      }, 50);

      input = [];

      setTimeout(() => {
        setActiveItems((prev) => prev.filter((item) => item.id !== newId));
      }, animDuration * 1000);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      input.push(e.key);
      if (input.length > Konami.length) input.shift();
      if (input.join(",").toLowerCase() === Konami.join(",").toLowerCase()) {
        triggerEaster();
      }
    };

    const onTouchStart = (e: TouchEvent) => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    };

    const onTouchEnd = (e: TouchEvent) => {
      touchEndX = e.changedTouches[0].clientX;
      touchEndY = e.changedTouches[0].clientY;

      const deltaX = touchEndX - touchStartX;
      const deltaY = touchEndY - touchStartY;

      const minSwipeDistance = 30;

      if (
        Math.abs(deltaX) >= minSwipeDistance ||
        Math.abs(deltaY) >= minSwipeDistance
      ) {
        e.preventDefault();
      }

      if (
        Math.abs(deltaX) < minSwipeDistance &&
        Math.abs(deltaY) < minSwipeDistance
      ) {
        ++tapCount;

        if (tapCount === 1) {
          input.push("b");
          tapTimer = setTimeout(() => {
            tapCount = 0;
          }, 500);
        } else if (tapCount === 2) {
          clearTimeout(tapTimer!);
          input.push("a");
          tapCount = 0;
        }
      } else {
        tapCount = 0;
        if (tapTimer) {
          clearTimeout(tapTimer);
          tapTimer = null;
        }

        let direction: string = "";
        if (Math.abs(deltaX) > Math.abs(deltaY)) {
          // Horizontal swipe
          direction = deltaX > 0 ? "ArrowRight" : "ArrowLeft";
        } else {
          // Vertical swipe
          direction = deltaY > 0 ? "ArrowDown" : "ArrowUp";
        }
        input.push(direction);
      }
      if (input.length > Konami.length) input.shift(); // Basically should match the Konami.length
      if (input.join(",").toLowerCase() === Konami.join(",").toLowerCase()) {
        triggerEaster();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: false });

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd);
      if (tapTimer) clearTimeout(tapTimer);
    };
  }, []);

  const animationDuration = Math.max(2, (windowWidth / 1000) * 4);

  const handleSplit = (id: number, bottom: number, right: number) => {
    const newId1 = ++splitIdRef.current;
    const newId2 = ++splitIdRef.current;

    setActiveItems((prev) => {
      const withoutClicked = prev.filter((item) => item.id !== id);
      return [
        ...withoutClicked,
        {
          id: newId1,
          bottom: bottom + 30,
          right: right,
          isMoving: true,
        } as EasterState,
        {
          id: newId2,
          bottom: bottom - 30,
          right: right,
          isMoving: true,
        } as EasterState,
      ];
    });

    setTimeout(() => {
      setActiveItems((prev) =>
        prev.map((item) =>
          item.id === newId1 || item.id === newId2
            ? { ...item, isMoving: true }
            : item,
        ),
      );
    }, 50);

    setTimeout(() => {
      setActiveItems((prev) =>
        prev.filter((item) => item.id !== newId1 && item.id !== newId2),
      );
    }, animationDuration * 1000);
  };
  return (
    <>
      {activeItems.map((item: EasterState) => (
        <Image
          key={item.id}
          src="/koisshi.png"
          alt="koisshi"
          width={100}
          height={100}
          style={{
            position: "fixed",
            bottom: `${item.bottom}px`,
            right: item.isMoving ? "100vw" : `${item.right}px`,
            width: "100px",
            height: "100px",
            zIndex: 9999,
            cursor: "pointer",
            transform: item.isMoving ? "rotate(-1080deg)" : "rotate(0deg)",
            transition: `right ${animationDuration}s linear, transform ${animationDuration}s linear`,
          }}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const clickRight = window.innerWidth - rect.right;
            handleSplit(item.id, item.bottom, clickRight);
          }}
        />
      ))}
    </>
  );
}
