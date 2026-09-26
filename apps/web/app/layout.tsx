import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "final.shop — demo storefront",
  description: "Global Commerce OS demo storefront",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <Link href="/" className="brand">
            final.shop
          </Link>
          <nav>
            <Link href="/">Shop</Link>
            <Link href="/cart">Cart</Link>
          </nav>
        </header>
        <main>{children}</main>
        <footer className="site-footer">
          Powered by the final.shop Commerce OS kernel
        </footer>
      </body>
    </html>
  );
}
