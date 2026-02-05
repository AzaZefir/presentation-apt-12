import React from "react";

export default function SlideFrame({ title, children }) {
  return (
    <div className="slide">
      <div className="slideHeader">
        <div className="slideTitle">{title}</div>
        <div className="legend">
          <span className="dot free" /> свободно
          <span className="dot occ" /> занято
        </div>
      </div>
      <div className="slideBody">{children}</div>
    </div>
  );
}
