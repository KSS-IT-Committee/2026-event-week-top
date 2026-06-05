"use client";

import { useEffect, useRef, useState } from "react";

type EasterState = {
  id: number;
  bottom: number;
  right: number;
  moving: boolean;
};

export function Easter() {
  const [isActive, setIsActive] = useState<EasterState[]>([]);
  const splitIdRef = useRef(1_000_000);
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
    let idCounter: number = 0;
    let touchStartX: number = 0;
    let touchStartY: number = 0;
    let touchEndX: number = 0;
    let touchEndY: number = 0;
    let tapCount: number = 0;
    let tapTimer: ReturnType<typeof setTimeout> | null = null;

    const triggerEaster = () => {
      const newId = idCounter++;
      const newBottom = Math.floor(Math.random() * 250) + 50;
      const animDuration = Math.max(2, (windowWidth / 1000) * 4);

      setIsActive((prev) => [
        ...prev,
        {
          id: newId,
          bottom: newBottom,
          right: -150,
          moving: false,
        } as EasterState,
      ]);

      // Start animation after a short delay
      setTimeout(() => {
        setIsActive((prev) =>
          prev.map((item) =>
            item.id === newId ? { ...item, moving: true } : item,
          ),
        );
      }, 50);

      input = [];

      setTimeout(() => {
        setIsActive((prev) => prev.filter((item) => item.id !== newId));
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
        if (tapTimer) tapTimer = null;

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
  }, [windowWidth]);

  const animationDuration = Math.max(2, (windowWidth / 1000) * 4);

  const handleSplit = (id: number, bottom: number, right: number) => {
    const newId1 = ++splitIdRef.current;
    const newId2 = ++splitIdRef.current;

    setIsActive((prev) => {
      const withoutClicked = prev.filter((item) => item.id !== id);
      return [
        ...withoutClicked,
        {
          id: newId1,
          bottom: bottom + 30,
          right: right,
          moving: true,
        } as EasterState,
        {
          id: newId2,
          bottom: bottom - 30,
          right: right,
          moving: true,
        } as EasterState,
      ];
    });

    setTimeout(() => {
      setIsActive((prev) =>
        prev.map((item) =>
          item.id === newId1 || item.id === newId2
            ? { ...item, moving: true }
            : item,
        ),
      );
    }, 50);

    setTimeout(() => {
      setIsActive((prev) =>
        prev.filter((item) => item.id !== newId1 && item.id !== newId2),
      );
    }, animationDuration * 1000);
  };
  return (
    <>
      {isActive.map((item: EasterState) => (
        <img
          key={item.id}
          src="/koisshi.png"
          alt="koisshi"
          style={{
            position: "fixed",
            bottom: `${item.bottom}px`,
            right: item.moving ? "100vw" : `${item.right}px`,
            width: "100px",
            height: "100px",
            zIndex: 9999,
            cursor: "pointer",
            transform: item.moving ? "rotate(-1080deg)" : "rotate(0deg)",
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
