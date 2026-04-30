interface Props {
  className?: string;
  align?: "left" | "center";
}

export function Attribution({ className = "", align = "center" }: Props) {
  const justify = align === "center" ? "justify-center" : "justify-start";
  return (
    <div
      className={`flex flex-wrap items-center ${justify} gap-x-3 gap-y-1 text-xs text-muted ${className}`}
    >
      <span>
        Built by <span className="font-semibold text-white">James Bowen</span>
      </span>
      <span className="text-border">•</span>
      <a
        href="mailto:jamesbowen@microsoft.com"
        className="text-accent hover:underline"
      >
        jamesbowen@microsoft.com
      </a>
      <span className="text-border">•</span>
      <span>Principal Solution Specialist | Manufacturing &amp; Mobility</span>
    </div>
  );
}
