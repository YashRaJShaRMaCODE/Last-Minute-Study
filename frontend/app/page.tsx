import type { Metadata } from "next";
import StudyWorkspace from "./study-workspace";

export const metadata: Metadata = {
  title: "Make the next hour count",
  description:
    "A calm revision workspace for turning exam stress into small study sessions, clear subject progress, and useful notes.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Last-Minute Study — make the next hour count",
    description:
      "Turn exam stress into small study sessions, clear subject progress, and useful notes.",
    url: "/",
    siteName: "Last-Minute Study",
    locale: "en_IN",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Last-Minute Study — make the next hour count",
    description: "A calmer way to plan your final revision sessions.",
  },
};

export default function Home() {
  return <StudyWorkspace />;
}
