import React, { useEffect } from "react";

export default function Carousel({ index, count, onPrev, onNext, children }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === "ArrowLeft") onPrev?.();
      if (e.key === "ArrowRight") onNext?.();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onPrev, onNext]);

  return (
    <div className="carousel">
      <div className="carouselTop">
        <button className="btn" onClick={onPrev} disabled={index === 0}>← Назад</button>
        <div className="counter">Слайд {index + 1} / {count}</div>
        <button className="btn" onClick={onNext} disabled={index === count - 1}>Вперёд →</button>
      </div>
      <div className="carouselContent">{children}</div>
    </div>
  );
}
