import type { Metadata, Viewport } from 'next';
import './globals.css';
import Providers from '@/components/providers';

export const metadata: Metadata = {
  title: 'DriveStream - Cache-First & Edge Proxy Media Player',
  description: 'Trình xem và tải ảnh/video từ Google Drive mượt mà 60fps không giới hạn API Quota',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" className="dark">
      <body className="min-h-screen bg-[#0a0a0a] text-neutral-100 antialiased selection:bg-blue-600 selection:text-white">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
