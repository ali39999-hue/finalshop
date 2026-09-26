import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "final.shop — ERP console",
  description: "Operations console for the final.shop demo store",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <Link href="/" className="brand">
            final.shop · ERP
          </Link>
          <nav>
            <Link href="/">Dashboard</Link>
            <Link href="/funnels">Funnels</Link>
            <Link href="/orders">Orders</Link>
            <Link href="/products">Products</Link>
          </nav>
        </header>
        <main>{children}</main>
        <footer className="site-footer">Operations console — demo owner context</footer>
      </body>
    </html>
  );
}
