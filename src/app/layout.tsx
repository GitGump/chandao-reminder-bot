import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "迭代需求群消息自动通知系统",
  description: "基于发版日历的自动化消息推送平台",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        {children}
      </body>
    </html>
  );
}
