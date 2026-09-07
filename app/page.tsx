import { SiteFooter } from "@/components/site-footer";
import { Hero } from "@/components/hero";
import { HomeLinks } from "@/components/home-links";

export default function Home() {
  return (
    <>
      <main className="flex-1">
        <Hero />
        <HomeLinks />
      </main>
      <SiteFooter />
    </>
  );
}
