import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Zero2Hero",
  description: "The AI companion that turns a vague idea into a realistic execution plan.",
};

// Runs before paint: applies the saved theme (or system preference) so there's
// no flash of the wrong palette. suppressHydrationWarning because this script
// mutates data-theme before React hydrates.
const themeInit = `(function(){try{var t=localStorage.getItem('theme');if(!t){t=window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';}document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        {children}
      </body>
    </html>
  );
}
