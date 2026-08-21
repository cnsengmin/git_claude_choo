import dynamic from "next/dynamic";

const AtlasMap = dynamic(() => import("@/components/AtlasMap"), { ssr: false });

export default function Home() {
  return <AtlasMap />;
}
