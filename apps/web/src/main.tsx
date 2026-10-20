import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { MotionConfig } from "framer-motion";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { AuthProvider } from "./lib/auth";
import { ToastProvider } from "./components/toast";
import { ApiError } from "./lib/api";
import "./index.css";
import { initNative } from "./lib/native";
import { currentTheme } from "./lib/theme";

const qc = new QueryClient({ defaultOptions: { queries: { retry: (n, e) => !(e instanceof ApiError && e.status < 500 && e.status !== 0) && n < 2, refetchOnWindowFocus: false } } });

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <MotionConfig reducedMotion="user">
        <BrowserRouter>
          <AuthProvider><ToastProvider><App /></ToastProvider></AuthProvider>
        </BrowserRouter>
      </MotionConfig>
    </QueryClientProvider>
  </React.StrictMode>,
);

// Inside the Android/iOS/Windows apps: theme the system bars, wire printing and hide the native splash once the first screen is painted.
setTimeout(() => initNative(currentTheme()), 120);
