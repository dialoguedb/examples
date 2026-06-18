export const metadata = {
  title: "DialogueDB + Next.js Chat API",
  description: "AI chat with persistent conversation history",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
