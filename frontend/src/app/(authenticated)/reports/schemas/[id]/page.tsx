"use client";

import { useParams } from "next/navigation";
import SchemaEditor from "@/components/schemas/SchemaEditor";

export default function ReportSchemaDetailPage() {
  const params = useParams();
  const idParam = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const id = Number(idParam);

  if (!id) return null;

  return (
    <div className="-m-6" style={{ height: "calc(100vh - 4rem)" }}>
      <SchemaEditor schemaId={id} />
    </div>
  );
}
