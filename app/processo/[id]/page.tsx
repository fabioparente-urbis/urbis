import ProcessoClient from "../ProcessoClient";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <ProcessoClient id={id} />;
}