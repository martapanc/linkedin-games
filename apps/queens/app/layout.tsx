import type {Metadata, Viewport} from "next";
import "./globals.css";
import {ServiceWorker} from "@games/core/ui";

export const metadata: Metadata = {
    title: "Queens — unlimited",
    description:
        "An offline-capable Queens puzzle you can play as many times a day as you like.",
    manifest: "/manifest.webmanifest",
    appleWebApp: {capable: true, statusBarStyle: "default", title: "Queens"},
    icons: {icon: "/icon.svg", apple: "/apple-touch-icon.png"},
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
        <body className="flex min-h-full flex-col">
        {children}
        <ServiceWorker/>
        </body>
        </html>
    );
}
