export default function ModulePlaceholder({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-24 text-center">
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="mt-2 max-w-md text-muted-foreground">{description}</p>
      <p className="mt-4 text-sm text-amber-600">Module — coming in next increment</p>
    </div>
  );
}
