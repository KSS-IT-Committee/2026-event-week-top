"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

import styles from "./HeaderSlider.module.css";

const images = [
  "/background/background (1).jpg",
  "/background/background (2).jpg",
  "/background/background (3).jpg",
  "/background/background (4).jpg",
  "/background/background (5).jpg",
  "/background/background (6).jpg",
  "/background/background (7).jpg",
  "/background/background (8).jpg",
  "/background/background (9).jpg",
  "/background/background (10).jpg",
  "/background/background (11).jpg",
  "/background/background (12).jpg",
  "/background/background (13).jpg",
];

export function HeaderSlider() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [prevIndex, setPrevIndex] = useState<number | null>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setPrevIndex(currentIndex);
      setCurrentIndex((prev) => (prev + 1) % images.length);
    }, 4000);
    return () => clearInterval(timer);
  }, [currentIndex]);

  return (
    <div className={styles.bgSlider}>
      {images.map((src, index) => {
        const isVisible = index === currentIndex || index === prevIndex;
        if (!isVisible) return null;
        return (
          <div
            key={src}
            className={`${styles.slide} ${index === currentIndex ? styles.active : styles.fadingOut}`}
          >
            <Image
              src={src}
              alt=""
              aria-hidden="true"
              fill
              priority={index === 0}
              sizes="100vw"
              style={{ objectFit: "cover", objectPosition: "center" }}
            />
          </div>
        );
      })}
    </div>
  );
}
