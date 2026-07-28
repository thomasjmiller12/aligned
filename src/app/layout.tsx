import type { Metadata, Viewport } from "next";
import { Inter, Bricolage_Grotesque } from "next/font/google";
import "./globals.css";
import { ConvexClientProvider } from "@/components/ConvexClientProvider";
import { MotionProvider } from "@/components/MotionProvider";

const inter = Inter({ subsets: ["latin"] });

// Display face. Carries the personality; used with restraint — wordmark,
// phase headings, scores. Body copy stays on Inter.
const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0C2B3E",
};

export const metadata: Metadata = {
  title: "Aligned — The Wavelengths Board Game Online",
  description:
    "Play Wavelengths online with friends and family. A collaborative guessing game where you try to read each other's minds across a spectrum.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        className={`${inter.className} ${bricolage.variable} min-h-screen antialiased`}
      >
        <ConvexClientProvider>
          <MotionProvider>{children}</MotionProvider>
        </ConvexClientProvider>
      </body>
    </html>
  );
}
