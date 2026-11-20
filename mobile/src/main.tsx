import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { applySize, readSize } from "./Me";
import "./styles.css";

// 글자 크기 설정은 이 기기에만 둔다
applySize(readSize());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
