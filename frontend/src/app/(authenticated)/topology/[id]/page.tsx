"use client";

import { useParams } from "next/navigation";
import TopologyMap from "@/components/topology2/TopologyMap";

export default function TopologyDetailPage() {
  const params = useParams();
  const idParam = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const id = Number(idParam);

  if (!id) return null;

  return (
    <div className="-m-6" style={{ height: "calc(100vh - 4rem)" }}>
      <TopologyMap topologyId={id} />
    </div>
  );
}
