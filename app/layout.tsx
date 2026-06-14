import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Zero2Hero",
  description: "The AI companion that turns a vague idea into a realistic execution plan.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // data-theme drives the palette (see globals.css). Hard-coded dark for now;
  // the light-mode toggle will flip this attribute later.
  return (
    <html lang="en" data-theme="dark">
      <body>{children}</body>
    </html>
  );
}
