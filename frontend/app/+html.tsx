// @ts-nocheck
import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="pl" style={{ height: "100%" }}>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />
        <meta name="theme-color" content="#2F5B4C" />
        <title>CashFlo - Zarządzanie Finansami</title>
        <ScrollViewStyleReset />
        <style
          dangerouslySetInnerHTML={{
            __html: `
              body > div:first-child {
                position: fixed !important;
                top: 0; left: 0; right: 0; bottom: 0;
              }
              [role="tablist"] [role="tab"] * { overflow: visible !important; }
              [role="heading"], [role="heading"] * { overflow: visible !important; }

              /* === Desktop framing: phone-like centered layout on wide screens === */
              @media (min-width: 600px) {
                html, body {
                  background: #E8E4DC !important;
                }
                body > div:first-child {
                  /* Constrain the whole app to phone width on desktop */
                  left: 50% !important;
                  right: auto !important;
                  transform: translateX(-50%) !important;
                  width: 100% !important;
                  max-width: 480px !important;
                  box-shadow: 0 10px 40px rgba(0,0,0,0.18);
                  overflow: hidden;
                }
              }
              @media (min-width: 600px) and (prefers-color-scheme: dark) {
                html, body { background: #0A0A0A !important; }
              }
            `,
          }}
        />
      </head>
      <body
        style={{
          margin: 0,
          height: "100%",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {children}
      </body>
    </html>
  );
}
