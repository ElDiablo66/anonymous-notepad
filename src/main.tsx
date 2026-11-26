import "@fontsource-variable/instrument-sans";
import "@fontsource-variable/jetbrains-mono";
import "@fontsource/barlow-condensed/600.css";
import "@fontsource/barlow-condensed/700-italic.css";
import "@fontsource/yellowtail";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

createRoot(document.getElementById("root") as HTMLElement).render(<App />);
