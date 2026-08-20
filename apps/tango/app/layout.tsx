import type {Metadata, Viewport} from "next";
import "./globals.css";

export const metadata: Metadata = {
    title: "Tango — unlimited",
    description:
        "A Tango puzzle you can play as many times a day as you like — suns, moons, and the signs between them.",
    icons: {icon: "/icon.svg"},
};

export const viewport: Viewport = {
    themeColor: [
        {media: "(prefers-color-scheme: light)", color: "#f4f2ee"},
        {media: "(prefers-color-scheme: dark)", color: "#14161a"},
    ],
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
    userScalable: false,
};

export default function RootLayout({children}: LayoutProps<"/">) {
    return (
        <html lang="en" className="h-full antialiased">
        <body className="flex min-h-full flex-col">{children}</body>
        </html>
    );
}
