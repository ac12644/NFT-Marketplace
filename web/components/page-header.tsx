export function PageHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-10 flex flex-col gap-3">
      <h1 className="text-balance text-3xl font-semibold tracking-tight">
        {title}
      </h1>
      {subtitle && (
        <p className="max-w-prose text-pretty leading-relaxed text-muted-foreground">
          {subtitle}
        </p>
      )}
    </div>
  );
}
